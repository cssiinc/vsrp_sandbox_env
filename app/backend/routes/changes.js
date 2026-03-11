const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/changes — paginated CloudTrail events with filters
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const {
      account, username, service, event_name,
      from, to, page = 1, limit = 50,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (username) { conditions.push(`username ILIKE $${idx++}`); params.push(`%${username}%`); }
    if (service) { conditions.push(`event_source = $${idx++}`); params.push(service); }
    if (event_name) { conditions.push(`event_name ILIKE $${idx++}`); params.push(`%${event_name}%`); }
    if (from) { conditions.push(`event_time >= $${idx++}`); params.push(new Date(from)); }
    if (to) { conditions.push(`event_time <= $${idx++}`); params.push(new Date(to)); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM cloudtrail_events ${where}`, params),
      pool.query(
        `SELECT id, account_id, event_time, event_name, event_source,
                aws_region, username, source_ip, error_code, error_message,
                resources, created_at
         FROM cloudtrail_events ${where}
         ORDER BY event_time DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
    ]);

    res.json({
      changes: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/changes error:', err.message);
    res.status(500).json({ error: 'Failed to fetch changes' });
  }
});

// GET /api/changes/summary — event counts by service (last 24h)
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { account } = req.query;
    const conditions = ["event_time >= NOW() - INTERVAL '24 hours'"];
    const params = [];
    if (account) { conditions.push(`account_id = $${params.length + 1}`); params.push(account); }
    const where = conditions.map((c, i) => (i === 0 ? `WHERE ${c}` : `AND ${c}`)).join(' ');
    const { rows } = await pool.query(
      `SELECT event_source, COUNT(*) as count
       FROM cloudtrail_events
       ${where}
       GROUP BY event_source
       ORDER BY count DESC
       LIMIT 10`,
      params
    );
    const total = rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    res.json({ services: rows, total });
  } catch (err) {
    console.error('GET /api/changes/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch changes summary' });
  }
});

// GET /api/changes/:id — single event with full detail
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query('SELECT * FROM cloudtrail_events WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/changes/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

module.exports = router;
