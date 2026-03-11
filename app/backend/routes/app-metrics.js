/**
 * Application infrastructure metrics — live AWS queries for ECS, RDS, and ALB.
 *
 * Makes real-time calls to describe + CloudWatch APIs in the app account.
 * Credentials obtained by assuming HealthDashboardReadRole in APP_ACCOUNT_ID.
 *
 * Required env vars:
 *   APP_ACCOUNT_ID     — AWS account ID where the app runs
 *   ECS_CLUSTER        — ECS cluster name (e.g. vsrp-sandbox-dev)
 *   BACKEND_SERVICE    — ECS backend service name (e.g. backend)
 *   FRONTEND_SERVICE   — ECS frontend service name (e.g. frontend)
 *   RDS_INSTANCE_ID    — RDS instance identifier (e.g. vsrp-sandbox-dev)
 *   ALB_NAME           — ALB name (e.g. vsrp-sandbox-dev)
 */
const express = require('express');
const { ECSClient, DescribeServicesCommand } = require('@aws-sdk/client-ecs');
const { RDSClient, DescribeDBInstancesCommand } = require('@aws-sdk/client-rds');
const {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
} = require('@aws-sdk/client-elastic-load-balancing-v2');
const {
  CloudWatchClient,
  GetMetricDataCommand,
} = require('@aws-sdk/client-cloudwatch');
const { assumeRole } = require('../sync/engine');

const router = express.Router();

const REGION = process.env.AWS_REGION || 'us-east-1';
const APP_ACCOUNT_ID = process.env.APP_ACCOUNT_ID;
const ECS_CLUSTER = process.env.ECS_CLUSTER;
const BACKEND_SERVICE = process.env.BACKEND_SERVICE;
const FRONTEND_SERVICE = process.env.FRONTEND_SERVICE;
const RDS_INSTANCE_ID = process.env.RDS_INSTANCE_ID;
const ALB_NAME = process.env.ALB_NAME;

// Cache results for 60s to avoid hammering CloudWatch on every page load
let cache = { data: null, ts: 0 };
const CACHE_TTL_MS = 60000;

async function getCredentials() {
  if (!APP_ACCOUNT_ID) throw new Error('APP_ACCOUNT_ID not configured');
  const roleArn = `arn:aws:iam::${APP_ACCOUNT_ID}:role/HealthDashboardReadRole`;
  return assumeRole(roleArn, 'app-metrics');
}

async function getEcsMetrics(credentials) {
  if (!ECS_CLUSTER) return null;
  const client = new ECSClient({ region: REGION, credentials });

  const services = [];
  if (BACKEND_SERVICE) services.push(BACKEND_SERVICE);
  if (FRONTEND_SERVICE) services.push(FRONTEND_SERVICE);
  if (services.length === 0) return null;

  const res = await client.send(new DescribeServicesCommand({
    cluster: ECS_CLUSTER,
    services,
  }));

  const result = {};
  for (const svc of (res.services || [])) {
    const deployment = svc.deployments?.find(d => d.status === 'PRIMARY') || {};
    result[svc.serviceName] = {
      status: svc.status,
      running: svc.runningCount,
      desired: svc.desiredCount,
      pending: svc.pendingCount,
      task_definition: deployment.taskDefinition?.split('/').pop() || null,
      rollout_state: deployment.rolloutState || null,
      created_at: deployment.createdAt || null,
      updated_at: deployment.updatedAt || null,
      last_event: svc.events?.[0]?.message || null,
      last_event_time: svc.events?.[0]?.createdAt || null,
    };
  }
  for (const f of (res.failures || [])) {
    result[f.id?.split('/').pop() || f.arn] = { status: 'NOT_FOUND', error: f.reason };
  }
  return result;
}

async function getRdsMetrics(credentials) {
  if (!RDS_INSTANCE_ID) return null;
  const client = new RDSClient({ region: REGION, credentials });

  const res = await client.send(new DescribeDBInstancesCommand({
    DBInstanceIdentifier: RDS_INSTANCE_ID,
  }));

  const db = res.DBInstances?.[0];
  if (!db) return null;

  return {
    status: db.DBInstanceStatus,
    instance_class: db.DBInstanceClass,
    engine: db.Engine,
    engine_version: db.EngineVersion,
    allocated_storage_gb: db.AllocatedStorage,
    multi_az: db.MultiAZ,
    endpoint: db.Endpoint?.Address || null,
    latest_restore: db.LatestRestorableTime || null,
    backup_retention_days: db.BackupRetentionPeriod,
    deletion_protection: db.DeletionProtection,
  };
}

async function getAlbMetrics(credentials) {
  if (!ALB_NAME) return null;
  const client = new ElasticLoadBalancingV2Client({ region: REGION, credentials });

  // Find the ALB by name
  const albRes = await client.send(new DescribeLoadBalancersCommand({ Names: [ALB_NAME] }));
  const alb = albRes.LoadBalancers?.[0];
  if (!alb) return null;

  // Get target groups for this ALB
  const tgRes = await client.send(new DescribeTargetGroupsCommand({
    LoadBalancerArn: alb.LoadBalancerArn,
  }));

  // Get health for each target group
  const targetGroups = await Promise.all(
    (tgRes.TargetGroups || []).map(async (tg) => {
      const healthRes = await client.send(new DescribeTargetHealthCommand({
        TargetGroupArn: tg.TargetGroupArn,
      }));
      const healthy = healthRes.TargetHealthDescriptions?.filter(t => t.TargetHealth?.State === 'healthy').length || 0;
      const unhealthy = healthRes.TargetHealthDescriptions?.filter(t => t.TargetHealth?.State !== 'healthy').length || 0;
      return {
        name: tg.TargetGroupName,
        port: tg.Port,
        protocol: tg.Protocol,
        healthy,
        unhealthy,
        total: healthRes.TargetHealthDescriptions?.length || 0,
      };
    })
  );

  // Extract ARN suffix for CloudWatch dimension (format: app/<name>/<id>)
  const arnSuffix = alb.LoadBalancerArn.split(':loadbalancer/')[1];

  return {
    name: alb.LoadBalancerName,
    dns: alb.DNSName,
    state: alb.State?.Code,
    arn_suffix: arnSuffix,
    target_groups: targetGroups,
  };
}

async function getCloudWatchMetrics(credentials, rdsInstanceId, albArnSuffix) {
  if (!rdsInstanceId && !albArnSuffix) return null;

  const client = new CloudWatchClient({ region: REGION, credentials });
  const now = new Date();
  const fiveMinAgo = new Date(now - 5 * 60 * 1000);
  const oneHourAgo = new Date(now - 60 * 60 * 1000);

  const queries = [];

  if (rdsInstanceId) {
    const rdsDims = [{ Name: 'DBInstanceIdentifier', Value: rdsInstanceId }];
    queries.push(
      { Id: 'rds_cpu', MetricStat: { Metric: { Namespace: 'AWS/RDS', MetricName: 'CPUUtilization', Dimensions: rdsDims }, Period: 300, Stat: 'Average' }, ReturnData: true },
      { Id: 'rds_storage', MetricStat: { Metric: { Namespace: 'AWS/RDS', MetricName: 'FreeStorageSpace', Dimensions: rdsDims }, Period: 300, Stat: 'Average' }, ReturnData: true },
      { Id: 'rds_connections', MetricStat: { Metric: { Namespace: 'AWS/RDS', MetricName: 'DatabaseConnections', Dimensions: rdsDims }, Period: 300, Stat: 'Average' }, ReturnData: true },
      { Id: 'rds_read_iops', MetricStat: { Metric: { Namespace: 'AWS/RDS', MetricName: 'ReadIOPS', Dimensions: rdsDims }, Period: 300, Stat: 'Average' }, ReturnData: true },
      { Id: 'rds_write_iops', MetricStat: { Metric: { Namespace: 'AWS/RDS', MetricName: 'WriteIOPS', Dimensions: rdsDims }, Period: 300, Stat: 'Average' }, ReturnData: true }
    );
  }

  if (albArnSuffix) {
    const albDims = [{ Name: 'LoadBalancer', Value: albArnSuffix }];
    queries.push(
      { Id: 'alb_requests', MetricStat: { Metric: { Namespace: 'AWS/ApplicationELB', MetricName: 'RequestCount', Dimensions: albDims }, Period: 300, Stat: 'Sum' }, ReturnData: true },
      { Id: 'alb_5xx', MetricStat: { Metric: { Namespace: 'AWS/ApplicationELB', MetricName: 'HTTPCode_ELB_5XX_Count', Dimensions: albDims }, Period: 300, Stat: 'Sum' }, ReturnData: true },
      { Id: 'alb_target_5xx', MetricStat: { Metric: { Namespace: 'AWS/ApplicationELB', MetricName: 'HTTPCode_Target_5XX_Count', Dimensions: albDims }, Period: 300, Stat: 'Sum' }, ReturnData: true },
      { Id: 'alb_latency', MetricStat: { Metric: { Namespace: 'AWS/ApplicationELB', MetricName: 'TargetResponseTime', Dimensions: albDims }, Period: 300, Stat: 'Average' }, ReturnData: true }
    );
  }

  if (queries.length === 0) return null;

  const res = await client.send(new GetMetricDataCommand({
    MetricDataQueries: queries,
    StartTime: oneHourAgo,
    EndTime: now,
    ScanBy: 'TimestampDescending',
  }));

  const getValue = (id) => {
    const r = res.MetricDataResults?.find(m => m.Id === id);
    return r?.Values?.[0] ?? null;
  };

  const result = {};
  if (rdsInstanceId) {
    result.rds = {
      cpu_percent: getValue('rds_cpu') !== null ? Math.round(getValue('rds_cpu') * 10) / 10 : null,
      free_storage_gb: getValue('rds_storage') !== null ? Math.round(getValue('rds_storage') / 1024 / 1024 / 1024 * 10) / 10 : null,
      connections: getValue('rds_connections') !== null ? Math.round(getValue('rds_connections')) : null,
      read_iops: getValue('rds_read_iops') !== null ? Math.round(getValue('rds_read_iops') * 10) / 10 : null,
      write_iops: getValue('rds_write_iops') !== null ? Math.round(getValue('rds_write_iops') * 10) / 10 : null,
    };
  }
  if (albArnSuffix) {
    result.alb = {
      requests_5min: Math.round(getValue('alb_requests') || 0),
      errors_5xx: Math.round((getValue('alb_5xx') || 0) + (getValue('alb_target_5xx') || 0)),
      avg_response_ms: getValue('alb_latency') !== null ? Math.round(getValue('alb_latency') * 1000) : null,
    };
  }
  return result;
}

// GET /api/app-metrics — live infrastructure health snapshot
router.get('/', async (req, res) => {
  // Serve from cache if fresh
  if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return res.json({ ...cache.data, cached: true });
  }

  const configured = !!(APP_ACCOUNT_ID && ECS_CLUSTER);
  if (!configured) {
    return res.json({
      configured: false,
      message: 'Set APP_ACCOUNT_ID, ECS_CLUSTER, BACKEND_SERVICE, FRONTEND_SERVICE, RDS_INSTANCE_ID, ALB_NAME env vars to enable app metrics.',
    });
  }

  try {
    const credentials = await getCredentials();

    // Run all describe calls in parallel
    const [ecs, rds, alb] = await Promise.all([
      getEcsMetrics(credentials).catch(err => ({ error: err.message })),
      getRdsMetrics(credentials).catch(err => ({ error: err.message })),
      getAlbMetrics(credentials).catch(err => ({ error: err.message })),
    ]);

    // CloudWatch needs ALB ARN suffix from the describe result
    const cwMetrics = await getCloudWatchMetrics(
      credentials,
      RDS_INSTANCE_ID || null,
      alb?.arn_suffix || null
    ).catch(() => null);

    const data = {
      configured: true,
      fetched_at: new Date().toISOString(),
      ecs,
      rds: rds ? { ...rds, ...(cwMetrics?.rds || {}) } : null,
      alb: alb ? { ...alb, ...(cwMetrics?.alb || {}) } : null,
    };

    cache = { data, ts: Date.now() };
    res.json(data);
  } catch (err) {
    console.error('GET /api/app-metrics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
