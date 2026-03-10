const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/findings — paginated findings with filters
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const {
      severity, source, account, status,
      page = 1, limit = 50,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (severity) { conditions.push(`severity = $${idx++}`); params.push(severity.toUpperCase()); }
    if (source) { conditions.push(`source = $${idx++}`); params.push(source); }
    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status.toUpperCase()); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM security_findings ${where}`, params),
      pool.query(
        `SELECT id, account_id, source, severity, title, description,
                resource_arn, resource_type, status, compliance_status,
                first_seen, last_seen, updated_at
         FROM security_findings ${where}
         ORDER BY last_seen DESC
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
    console.error('GET /api/findings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch findings' });
  }
});

// GET /api/findings/summary — aggregate counts by severity
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT severity, COUNT(*) as count
       FROM security_findings
       WHERE status = 'NEW' OR status = 'NOTIFIED' OR status = 'ACTIVE'
       GROUP BY severity
       ORDER BY CASE severity
         WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
         WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5
       END`
    );

    const summary = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
    for (const r of rows) {
      summary[r.severity] = parseInt(r.count);
    }
    summary.total = Object.values(summary).reduce((a, b) => a + b, 0);

    res.json(summary);
  } catch (err) {
    console.error('GET /api/findings/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch findings summary' });
  }
});

// GET /api/findings/:id — single finding with raw JSON
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query('SELECT * FROM security_findings WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Finding not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/findings/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch finding' });
  }
});

module.exports = router;
