const express = require('express');
const { getPool } = require('../db');
const securityHub = require('../sync/security-hub');
const cloudtrail = require('../sync/cloudtrail');
const resourceInventory = require('../sync/resource-inventory');
const costExplorer = require('../sync/cost-explorer');
const configCompliance = require('../sync/config-compliance');
const healthEvents = require('../sync/health-events');
const cloudtrailS3 = require('../sync/cloudtrail-s3');
const iamCredentials = require('../sync/iam-credentials');
const guardduty = require('../sync/guardduty');
const trustedAdvisor = require('../sync/trusted-advisor');
const inspector = require('../sync/inspector');

const router = express.Router();

// Track running syncs to prevent overlaps
const runningSyncs = new Set();

// Helper to create sync endpoints
function createSyncEndpoint(name, syncFn) {
  router.post(`/${name}`, async (req, res) => {
    if (runningSyncs.has(name)) {
      return res.status(409).json({ error: `${name} sync already running` });
    }
    runningSyncs.add(name);
    res.json({ message: `${name} sync started` });
    try { await syncFn(); } finally { runningSyncs.delete(name); }
  });
}

createSyncEndpoint('security-hub', securityHub.syncAll);
createSyncEndpoint('cloudtrail', cloudtrail.syncAll);
createSyncEndpoint('resource-inventory', resourceInventory.syncAll);
createSyncEndpoint('cost-explorer', costExplorer.syncAll);
createSyncEndpoint('config-compliance', configCompliance.syncAll);
createSyncEndpoint('health-events', healthEvents.syncAll);
createSyncEndpoint('cloudtrail-s3', cloudtrailS3.syncAll);
createSyncEndpoint('iam-credentials', iamCredentials.syncAll);
createSyncEndpoint('guardduty', guardduty.syncAll);
createSyncEndpoint('trusted-advisor', trustedAdvisor.syncAll);
createSyncEndpoint('inspector', inspector.syncAll);

const ALL_MODULES = [
  { name: 'security-hub', fn: securityHub.syncAll },
  { name: 'cloudtrail', fn: cloudtrail.syncAll },
  { name: 'resource-inventory', fn: resourceInventory.syncAll },
  { name: 'cost-explorer', fn: costExplorer.syncAll },
  { name: 'config-compliance', fn: configCompliance.syncAll },
  { name: 'health-events', fn: healthEvents.syncAll },
  { name: 'cloudtrail-s3', fn: cloudtrailS3.syncAll },
  { name: 'iam-credentials', fn: iamCredentials.syncAll },
  { name: 'guardduty', fn: guardduty.syncAll },
  { name: 'trusted-advisor', fn: trustedAdvisor.syncAll },
  { name: 'inspector', fn: inspector.syncAll },
];

// POST /api/sync/all — trigger all syncs
router.post('/all', async (req, res) => {
  const running = [...runningSyncs];
  if (running.length > 0) {
    return res.status(409).json({ error: `Syncs already running: ${running.join(', ')}` });
  }

  for (const m of ALL_MODULES) runningSyncs.add(m.name);
  res.json({ message: 'All syncs started' });

  for (const m of ALL_MODULES) {
    try { await m.fn(); } finally { runningSyncs.delete(m.name); }
  }
});

// GET /api/sync/status — get recent sync status
router.get('/status', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (module, account_id)
         id, module, account_id, status, records_synced,
         started_at, completed_at, error, created_at
       FROM sync_status
       ORDER BY module, account_id, created_at DESC`
    );
    res.json({
      running: [...runningSyncs],
      syncs: rows,
    });
  } catch (err) {
    console.error('GET /api/sync/status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

module.exports = router;
