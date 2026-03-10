const express = require('express');
const { getPool } = require('../db');
const securityHub = require('../sync/security-hub');
const cloudtrail = require('../sync/cloudtrail');

const router = express.Router();

// Track running syncs to prevent overlaps
const runningSyncs = new Set();

// POST /api/sync/security-hub — trigger Security Hub sync
router.post('/security-hub', async (req, res) => {
  if (runningSyncs.has('security-hub')) {
    return res.status(409).json({ error: 'Security Hub sync already running' });
  }
  runningSyncs.add('security-hub');
  res.json({ message: 'Security Hub sync started' });

  try {
    await securityHub.syncAll();
  } finally {
    runningSyncs.delete('security-hub');
  }
});

// POST /api/sync/cloudtrail — trigger CloudTrail sync
router.post('/cloudtrail', async (req, res) => {
  if (runningSyncs.has('cloudtrail')) {
    return res.status(409).json({ error: 'CloudTrail sync already running' });
  }
  runningSyncs.add('cloudtrail');
  res.json({ message: 'CloudTrail sync started' });

  try {
    await cloudtrail.syncAll();
  } finally {
    runningSyncs.delete('cloudtrail');
  }
});

// POST /api/sync/all — trigger all syncs
router.post('/all', async (req, res) => {
  const running = [...runningSyncs];
  if (running.length > 0) {
    return res.status(409).json({ error: `Syncs already running: ${running.join(', ')}` });
  }

  runningSyncs.add('security-hub');
  runningSyncs.add('cloudtrail');
  res.json({ message: 'All syncs started' });

  try {
    await securityHub.syncAll();
  } finally {
    runningSyncs.delete('security-hub');
  }
  try {
    await cloudtrail.syncAll();
  } finally {
    runningSyncs.delete('cloudtrail');
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
