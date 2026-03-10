const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/guardduty — paginated findings with filters
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, severity, type, resource_type, search, page = 1, limit = 50 } = req.query;

    const conditions = ['archived = false'];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (severity) { conditions.push(`severity_label = $${idx++}`); params.push(severity.toUpperCase()); }
    if (type) { conditions.push(`type ILIKE $${idx++}`); params.push(`%${type}%`); }
    if (resource_type) { conditions.push(`resource_type = $${idx++}`); params.push(resource_type); }
    if (search) { conditions.push(`(title ILIKE $${idx} OR description ILIKE $${idx} OR type ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM guardduty_findings ${where}`, params),
      pool.query(
        `SELECT id, account_id, finding_id, severity, severity_label,
                title, description, type, resource_type, resource_id,
                region, first_seen, last_seen, count, synced_at
         FROM guardduty_findings ${where}
         ORDER BY severity DESC, last_seen DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
    ]);

    res.json({
      findings: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/guardduty error:', err.message);
    res.status(500).json({ error: 'Failed to fetch GuardDuty findings' });
  }
});

// GET /api/guardduty/summary — threat overview
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { account } = req.query;
    const acctFilter = account ? `AND account_id = $1` : '';
    const acctParams = account ? [account] : [];

    const [severityRes, typeRes, resourceRes] = await Promise.all([
      pool.query(
        `SELECT severity_label, COUNT(*) as count
         FROM guardduty_findings WHERE archived = false ${acctFilter}
         GROUP BY severity_label ORDER BY
           CASE severity_label WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`,
        acctParams
      ),
      pool.query(
        `SELECT type, COUNT(*) as count
         FROM guardduty_findings WHERE archived = false ${acctFilter}
         GROUP BY type ORDER BY count DESC LIMIT 10`,
        acctParams
      ),
      pool.query(
        `SELECT resource_type, COUNT(*) as count
         FROM guardduty_findings WHERE archived = false ${acctFilter}
         GROUP BY resource_type ORDER BY count DESC`,
        acctParams
      ),
    ]);

    const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const r of severityRes.rows) bySeverity[r.severity_label] = parseInt(r.count);

    res.json({
      total: Object.values(bySeverity).reduce((a, b) => a + b, 0),
      by_severity: bySeverity,
      top_types: typeRes.rows,
      by_resource: resourceRes.rows,
    });
  } catch (err) {
    console.error('GET /api/guardduty/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch GuardDuty summary' });
  }
});

// GET /api/guardduty/:id — single finding with raw JSON
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query('SELECT * FROM guardduty_findings WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Finding not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/guardduty/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch finding' });
  }
});

module.exports = router;
