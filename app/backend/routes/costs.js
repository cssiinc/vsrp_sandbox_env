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

// GET /api/costs/summary — total spend per account (current month) with prev month comparison
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { account } = req.query;

    const acctFilter = account ? ' AND account_id = $1' : '';
    const acctParams = account ? [account] : [];

    const [byAccountRes, byServiceRes, prevMonthRes] = await Promise.all([
      pool.query(
        `SELECT account_id, SUM(amount) as total_spend
         FROM cost_data
         WHERE period_start >= date_trunc('month', CURRENT_DATE) AND granularity = 'DAILY'${acctFilter}
         GROUP BY account_id
         ORDER BY total_spend DESC`,
        acctParams
      ),
      pool.query(
        `SELECT service, SUM(amount) as total_spend
         FROM cost_data
         WHERE period_start >= date_trunc('month', CURRENT_DATE) AND granularity = 'DAILY'${acctFilter}
         GROUP BY service
         ORDER BY total_spend DESC`,
        acctParams
      ),
      pool.query(
        `SELECT SUM(amount) as prev_total
         FROM cost_data
         WHERE period_start >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
           AND period_start < date_trunc('month', CURRENT_DATE)
           AND granularity = 'DAILY'${acctFilter}`,
        acctParams
      ),
    ]);

    const total = byAccountRes.rows.reduce((sum, r) => sum + parseFloat(r.total_spend), 0);
    const prevTotal = parseFloat(prevMonthRes.rows[0]?.prev_total || 0);

    res.json({
      by_account: byAccountRes.rows,
      by_service: byServiceRes.rows,
      total: Math.round(total * 100) / 100,
      prev_month_total: Math.round(prevTotal * 100) / 100,
    });
  } catch (err) {
    console.error('GET /api/costs/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

// GET /api/costs/trend — daily total for charting (last 30 days)
router.get('/trend', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, service } = req.query;
    const conditions = [`granularity = 'DAILY'`, `period_start >= CURRENT_DATE - 30`];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (service) { conditions.push(`service = $${idx++}`); params.push(service); }

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

// GET /api/costs/services — all services with MTD, prev month, and % change
router.get('/services', async (req, res) => {
  try {
    const pool = await getPool();
    const { account } = req.query;

    const acctFilter = account ? ' AND account_id = $1' : '';
    const acctParams = account ? [account] : [];

    const [currentRes, prevRes] = await Promise.all([
      pool.query(
        `SELECT service, SUM(amount) as mtd_spend, COUNT(DISTINCT period_start) as days_active,
                MIN(period_start) as first_seen, MAX(period_start) as last_seen,
                COUNT(DISTINCT account_id) as account_count
         FROM cost_data
         WHERE period_start >= date_trunc('month', CURRENT_DATE) AND granularity = 'DAILY'${acctFilter}
         GROUP BY service
         ORDER BY mtd_spend DESC`,
        acctParams
      ),
      pool.query(
        `SELECT service, SUM(amount) as prev_spend
         FROM cost_data
         WHERE period_start >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
           AND period_start < date_trunc('month', CURRENT_DATE)
           AND granularity = 'DAILY'${acctFilter}
         GROUP BY service`,
        acctParams
      ),
    ]);

    const prevMap = {};
    for (const row of prevRes.rows) {
      prevMap[row.service] = parseFloat(row.prev_spend);
    }

    const services = currentRes.rows.map(row => {
      const mtd = parseFloat(row.mtd_spend);
      const prev = prevMap[row.service] || 0;
      const pctChange = prev > 0 ? ((mtd - prev) / prev) * 100 : null;
      const dailyAvg = row.days_active > 0 ? mtd / parseInt(row.days_active) : 0;

      return {
        service: row.service,
        mtd_spend: Math.round(mtd * 100) / 100,
        prev_month_spend: Math.round(prev * 100) / 100,
        pct_change: pctChange != null ? Math.round(pctChange * 10) / 10 : null,
        daily_avg: Math.round(dailyAvg * 100) / 100,
        days_active: parseInt(row.days_active),
        account_count: parseInt(row.account_count),
      };
    });

    res.json({ services });
  } catch (err) {
    console.error('GET /api/costs/services error:', err.message);
    res.status(500).json({ error: 'Failed to fetch service costs' });
  }
});

// GET /api/costs/services/:service — daily breakdown for a specific service
router.get('/services/:service', async (req, res) => {
  try {
    const pool = await getPool();
    const { account } = req.query;

    const conditions = [`service = $1`, `granularity = 'DAILY'`, `period_start >= CURRENT_DATE - 30`];
    const params = [req.params.service];
    let idx = 2;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [dailyRes, byAccountRes] = await Promise.all([
      pool.query(
        `SELECT period_start, SUM(amount) as daily_total
         FROM cost_data ${where}
         GROUP BY period_start
         ORDER BY period_start`,
        params
      ),
      pool.query(
        `SELECT account_id, SUM(amount) as total_spend
         FROM cost_data ${where}
         GROUP BY account_id
         ORDER BY total_spend DESC`,
        params
      ),
    ]);

    res.json({
      service: req.params.service,
      daily: dailyRes.rows,
      by_account: byAccountRes.rows,
    });
  } catch (err) {
    console.error('GET /api/costs/services/:service error:', err.message);
    res.status(500).json({ error: 'Failed to fetch service detail' });
  }
});

// GET /api/costs/account-services — cross-tab: each account's spend per service
router.get('/account-services', async (req, res) => {
  try {
    const pool = await getPool();
    const { account } = req.query;

    const acctFilter = account ? ' AND account_id = $1' : '';
    const acctParams = account ? [account] : [];

    const { rows } = await pool.query(
      `SELECT account_id, service, SUM(amount) as total_spend
       FROM cost_data
       WHERE period_start >= date_trunc('month', CURRENT_DATE) AND granularity = 'DAILY'${acctFilter}
       GROUP BY account_id, service
       ORDER BY account_id, total_spend DESC`,
      acctParams
    );

    // Group by account
    const accounts = {};
    for (const row of rows) {
      if (!accounts[row.account_id]) accounts[row.account_id] = { account_id: row.account_id, services: [], total: 0 };
      const amount = parseFloat(row.total_spend);
      accounts[row.account_id].services.push({ service: row.service, amount: Math.round(amount * 100) / 100 });
      accounts[row.account_id].total += amount;
    }

    const result = Object.values(accounts)
      .map(a => ({ ...a, total: Math.round(a.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    res.json({ accounts: result });
  } catch (err) {
    console.error('GET /api/costs/account-services error:', err.message);
    res.status(500).json({ error: 'Failed to fetch account-service breakdown' });
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
