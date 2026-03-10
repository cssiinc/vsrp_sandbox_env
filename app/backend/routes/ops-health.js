const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

const TABLES = [
  { name: 'accounts', label: 'Accounts' },
  { name: 'security_findings', label: 'Security Findings' },
  { name: 'cloudtrail_events', label: 'CloudTrail Events' },
  { name: 'resource_inventory', label: 'Resource Inventory' },
  { name: 'cost_data', label: 'Cost Data' },
  { name: 'cost_forecasts', label: 'Cost Forecasts' },
  { name: 'config_compliance', label: 'Config Compliance' },
  { name: 'config_compliance_details', label: 'Compliance Details' },
  { name: 'health_events', label: 'Health Events' },
  { name: 'sync_status', label: 'Sync History' },
  { name: 'events', label: 'App Events' },
];

// GET /api/ops-health — full operational health snapshot
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();

    // Table row counts and sizes
    const tableStats = [];
    for (const t of TABLES) {
      try {
        const { rows } = await pool.query(`SELECT COUNT(*) as count FROM ${t.name}`);
        const sizeResult = await pool.query(
          `SELECT pg_total_relation_size($1) as total_bytes, pg_relation_size($1) as table_bytes`,
          [t.name]
        );
        tableStats.push({
          table: t.name,
          label: t.label,
          rows: parseInt(rows[0].count),
          total_bytes: parseInt(sizeResult.rows[0].total_bytes),
          table_bytes: parseInt(sizeResult.rows[0].table_bytes),
          total_size_mb: Math.round(parseInt(sizeResult.rows[0].total_bytes) / 1024 / 1024 * 100) / 100,
        });
      } catch {
        tableStats.push({ table: t.name, label: t.label, rows: 0, total_bytes: 0, table_bytes: 0, total_size_mb: 0, error: 'table not found' });
      }
    }

    // Database size
    const { rows: dbSize } = await pool.query(
      `SELECT pg_database_size(current_database()) as db_bytes`
    );
    const dbSizeMb = Math.round(parseInt(dbSize[0].db_bytes) / 1024 / 1024 * 100) / 100;

    // Connection pool stats
    const poolStats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };

    // Active connections on the DB
    const { rows: connRows } = await pool.query(
      `SELECT count(*) as active_connections FROM pg_stat_activity WHERE datname = current_database()`
    );

    // Sync performance (average duration per module, last 24h)
    const { rows: syncPerf } = await pool.query(
      `SELECT module,
         COUNT(*) as sync_count,
         COUNT(*) FILTER (WHERE status = 'completed') as succeeded,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))::numeric, 1) as avg_duration_sec,
         MAX(EXTRACT(EPOCH FROM (completed_at - started_at))) as max_duration_sec,
         SUM(records_synced) as total_records
       FROM sync_status
       WHERE started_at >= NOW() - INTERVAL '24 hours'
       GROUP BY module
       ORDER BY module`
    );

    // Data growth: rows added in last 24h per table (using created_at)
    const growth = [];
    for (const t of TABLES) {
      if (t.name === 'events') continue;
      try {
        const { rows } = await pool.query(
          `SELECT COUNT(*) as recent FROM ${t.name} WHERE created_at >= NOW() - INTERVAL '24 hours'`
        );
        growth.push({ table: t.name, label: t.label, rows_24h: parseInt(rows[0].recent) });
      } catch {
        growth.push({ table: t.name, label: t.label, rows_24h: 0 });
      }
    }

    // Last successful sync per module
    const { rows: lastSyncs } = await pool.query(
      `SELECT DISTINCT ON (module)
         module, status, records_synced, started_at, completed_at,
         EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_sec
       FROM sync_status
       WHERE status = 'completed'
       ORDER BY module, completed_at DESC`
    );

    // Oldest data per key table
    const { rows: oldestFindings } = await pool.query(
      `SELECT MIN(last_seen) as oldest FROM security_findings`
    ).catch(() => ({ rows: [{ oldest: null }] }));
    const { rows: oldestEvents } = await pool.query(
      `SELECT MIN(event_time) as oldest FROM cloudtrail_events`
    ).catch(() => ({ rows: [{ oldest: null }] }));

    const totalRows = tableStats.reduce((s, t) => s + t.rows, 0);
    const totalSizeMb = tableStats.reduce((s, t) => s + t.total_size_mb, 0);

    res.json({
      database: {
        size_mb: dbSizeMb,
        total_rows: totalRows,
        total_data_size_mb: Math.round(totalSizeMb * 100) / 100,
        active_connections: parseInt(connRows[0].active_connections),
        pool: poolStats,
      },
      tables: tableStats,
      sync_performance: syncPerf,
      data_growth_24h: growth,
      last_syncs: lastSyncs,
      data_age: {
        oldest_finding: oldestFindings[0]?.oldest,
        oldest_cloudtrail_event: oldestEvents[0]?.oldest,
      },
    });
  } catch (err) {
    console.error('GET /api/ops-health error:', err.message);
    res.status(500).json({ error: 'Failed to fetch operational health' });
  }
});

module.exports = router;
