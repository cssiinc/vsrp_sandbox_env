/**
 * Resource Inventory sync worker — discovers resources via AWS Config per account.
 */
const {
  ConfigServiceClient,
  ListDiscoveredResourcesCommand,
  BatchGetResourceConfigCommand,
} = require('@aws-sdk/client-config-service');
const { runSyncForAllAccounts, REGION } = require('./engine');

const RESOURCE_TYPES = [
  'AWS::EC2::Instance', 'AWS::EC2::SecurityGroup', 'AWS::EC2::VPC',
  'AWS::EC2::Subnet', 'AWS::EC2::NetworkInterface',
  'AWS::S3::Bucket', 'AWS::RDS::DBInstance', 'AWS::Lambda::Function',
  'AWS::IAM::Role', 'AWS::ECS::Cluster', 'AWS::ECS::Service',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
  'AWS::CloudFormation::Stack', 'AWS::SNS::Topic', 'AWS::SQS::Queue',
  'AWS::DynamoDB::Table',
];

async function syncAccount(credentials, account, pool) {
  const client = new ConfigServiceClient({ region: REGION, credentials });
  const syncStart = new Date();
  let totalRecords = 0;

  for (const resourceType of RESOURCE_TYPES) {
    // Discover resource IDs for this type
    const identifiers = [];
    let nextToken;
    do {
      try {
        const res = await client.send(new ListDiscoveredResourcesCommand({
          resourceType,
          nextToken,
          limit: 100,
        }));
        for (const r of (res.resourceIdentifiers || [])) {
          identifiers.push({
            resourceType: r.resourceType,
            resourceId: r.resourceId,
            resourceName: r.resourceName,
          });
        }
        nextToken = res.nextToken;
      } catch (err) {
        // Config may not be enabled or resource type not recorded — skip
        if (err.name === 'NoAvailableConfigurationRecorderException' ||
            err.name === 'ResourceNotDiscoveredException') {
          break;
        }
        throw err;
      }
    } while (nextToken);

    if (identifiers.length === 0) continue;

    // Batch get resource details (max 100 per call)
    for (let i = 0; i < identifiers.length; i += 100) {
      const batch = identifiers.slice(i, i + 100);
      const keys = batch.map(r => ({
        resourceType: r.resourceType,
        resourceId: r.resourceId,
      }));

      let items = [];
      try {
        const res = await client.send(new BatchGetResourceConfigCommand({
          resourceKeys: keys,
        }));
        items = res.baseConfigurationItems || [];
      } catch {
        // If batch fails, still count the discovered resources
        items = [];
      }

      // Build a map of detailed items
      const detailMap = new Map();
      for (const item of items) {
        detailMap.set(item.resourceId, item);
      }

      // Upsert each resource
      for (const ident of batch) {
        const detail = detailMap.get(ident.resourceId);
        let config = null;
        let tags = null;
        let captureTime = null;
        let arn = null;
        let status = null;

        if (detail) {
          try { config = detail.configuration ? JSON.parse(detail.configuration) : null; } catch { config = null; }
          tags = detail.supplementaryConfiguration?.Tags
            ? JSON.parse(detail.supplementaryConfiguration.Tags) : null;
          captureTime = detail.configurationItemCaptureTime || null;
          arn = detail.arn || null;
          status = detail.configurationItemStatus || null;
        }

        await pool.query(
          `INSERT INTO resource_inventory
             (account_id, resource_type, resource_id, resource_name, resource_arn,
              aws_region, configuration, tags, resource_status, config_capture_time, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           ON CONFLICT (account_id, resource_type, resource_id, aws_region)
           DO UPDATE SET
             resource_name = EXCLUDED.resource_name,
             resource_arn = EXCLUDED.resource_arn,
             configuration = EXCLUDED.configuration,
             tags = EXCLUDED.tags,
             resource_status = EXCLUDED.resource_status,
             config_capture_time = EXCLUDED.config_capture_time,
             updated_at = NOW()`,
          [
            account.account_id, resourceType, ident.resourceId,
            ident.resourceName || null, arn, REGION,
            config ? JSON.stringify(config) : null,
            tags ? JSON.stringify(tags) : null,
            status, captureTime,
          ]
        );
        totalRecords++;
      }
    }
  }

  // Purge resources not seen in this sync (deleted upstream)
  await pool.query(
    `DELETE FROM resource_inventory
     WHERE account_id = $1 AND updated_at < $2`,
    [account.account_id, syncStart]
  );

  return totalRecords;
}

async function syncAll() {
  return runSyncForAllAccounts('resource-inventory', syncAccount);
}

module.exports = { syncAll };
