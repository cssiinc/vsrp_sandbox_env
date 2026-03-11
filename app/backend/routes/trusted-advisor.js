const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/trusted-advisor — paginated checks with filters
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, category, status, search, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (category) { conditions.push(`category = $${idx++}`); params.push(category); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (search) { conditions.push(`(check_name ILIKE $${idx} OR description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (Math.max(1, parseInt(page)) - 1) * safeLimit;

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM trusted_advisor_checks ${where}`, params),
      pool.query(
        `SELECT id, account_id, check_id, check_name, category, status,
                resources_flagged, resources_ignored, resources_suppressed,
                resources_processed, estimated_savings, synced_at
         FROM trusted_advisor_checks ${where}
         ORDER BY
           CASE status WHEN 'error' THEN 1 WHEN 'warning' THEN 2 WHEN 'ok' THEN 3 ELSE 4 END,
           estimated_savings DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, safeLimit, offset]
      ),
    ]);

    res.json({
      checks: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/trusted-advisor error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Trusted Advisor checks' });
  }
});

// GET /api/trusted-advisor/summary — category overview
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { account } = req.query;
    const acctFilter = account ? `WHERE account_id = $1` : '';
    const acctParams = account ? [account] : [];

    const [catRes, statusRes, savingsRes] = await Promise.all([
      pool.query(
        `SELECT category, COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'error') as errors,
                COUNT(*) FILTER (WHERE status = 'warning') as warnings,
                COUNT(*) FILTER (WHERE status = 'ok') as ok,
                SUM(resources_flagged) as flagged
         FROM trusted_advisor_checks ${acctFilter}
         GROUP BY category ORDER BY errors DESC, warnings DESC`,
        acctParams
      ),
      pool.query(
        `SELECT status, COUNT(*) as count
         FROM trusted_advisor_checks ${acctFilter}
         GROUP BY status`,
        acctParams
      ),
      pool.query(
        `SELECT SUM(estimated_savings) as total_savings,
                COUNT(*) FILTER (WHERE estimated_savings > 0) as checks_with_savings
         FROM trusted_advisor_checks ${acctFilter}`,
        acctParams
      ),
    ]);

    const byStatus = {};
    for (const r of statusRes.rows) byStatus[r.status] = parseInt(r.count);

    res.json({
      by_category: catRes.rows,
      by_status: byStatus,
      total_estimated_savings: parseFloat(savingsRes.rows[0]?.total_savings || 0),
      checks_with_savings: parseInt(savingsRes.rows[0]?.checks_with_savings || 0),
    });
  } catch (err) {
    console.error('GET /api/trusted-advisor/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Trusted Advisor summary' });
  }
});

// GET /api/trusted-advisor/:id — single check with flagged resources
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query('SELECT * FROM trusted_advisor_checks WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Check not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/trusted-advisor/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch check' });
  }
});

module.exports = router;
