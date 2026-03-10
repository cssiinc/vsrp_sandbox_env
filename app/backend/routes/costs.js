const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/costs — daily cost data, paginated
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, service, from, to, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (service) { conditions.push(`service ILIKE $${idx++}`); params.push(`%${service}%`); }
    if (from) { conditions.push(`period_start >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`period_start <= $${idx++}`); params.push(to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM cost_data ${where}`, params),
      pool.query(
        `SELECT id, account_id, period_start, period_end, service, amount, unit
         FROM cost_data ${where}
         ORDER BY period_start DESC, amount DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
    ]);

    res.json({
      costs: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/costs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch cost data' });
  }
});

// GET /api/costs/summary — total spend per account (current month)
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows: byAccount } = await pool.query(
      `SELECT account_id, SUM(amount) as total_spend
       FROM cost_data
       WHERE period_start >= date_trunc('month', CURRENT_DATE) AND granularity = 'DAILY'
       GROUP BY account_id
       ORDER BY total_spend DESC`
    );
    const { rows: byService } = await pool.query(
      `SELECT service, SUM(amount) as total_spend
       FROM cost_data
       WHERE period_start >= date_trunc('month', CURRENT_DATE) AND granularity = 'DAILY'
       GROUP BY service
       ORDER BY total_spend DESC
       LIMIT 10`
    );
    const total = byAccount.reduce((sum, r) => sum + parseFloat(r.total_spend), 0);
    res.json({ by_account: byAccount, by_service: byService, total: Math.round(total * 100) / 100 });
  } catch (err) {
    console.error('GET /api/costs/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

// GET /api/costs/trend — daily total for charting (last 30 days)
router.get('/trend', async (req, res) => {
  try {
    const pool = await getPool();
    const { account } = req.query;
    const conditions = [`granularity = 'DAILY'`, `period_start >= CURRENT_DATE - 30`];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows } = await pool.query(
      `SELECT period_start, SUM(amount) as daily_total
       FROM cost_data ${where}
       GROUP BY period_start
       ORDER BY period_start`,
      params
    );
    res.json({ trend: rows });
  } catch (err) {
    console.error('GET /api/costs/trend error:', err.message);
    res.status(500).json({ error: 'Failed to fetch cost trend' });
  }
});

// GET /api/costs/forecast — forecast data
router.get('/forecast', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT account_id, forecast_start, forecast_end, mean_value, unit
       FROM cost_forecasts
       ORDER BY created_at DESC`
    );
    res.json({ forecasts: rows });
  } catch (err) {
    console.error('GET /api/costs/forecast error:', err.message);
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

module.exports = router;
