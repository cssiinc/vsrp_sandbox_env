const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/health-events — paginated health events
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, service, status, category, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (service) { conditions.push(`service = $${idx++}`); params.push(service); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (category) { conditions.push(`event_type_category = $${idx++}`); params.push(category); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM health_events ${where}`, params),
      pool.query(
        `SELECT id, account_id, event_arn, event_type_code, event_type_category,
                service, aws_region, status, start_time, end_time, last_updated,
                description, affected_entities, updated_at
         FROM health_events ${where}
         ORDER BY CASE status WHEN 'open' THEN 1 WHEN 'upcoming' THEN 2 ELSE 3 END,
                  start_time DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
    ]);

    res.json({
      events: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/health-events error:', err.message);
    res.status(500).json({ error: 'Failed to fetch health events' });
  }
});

// GET /api/health-events/summary — counts by status and category
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT status, event_type_category, COUNT(*) as count
       FROM health_events
       GROUP BY status, event_type_category
       ORDER BY CASE status WHEN 'open' THEN 1 WHEN 'upcoming' THEN 2 ELSE 3 END`
    );
    const open = rows.filter(r => r.status === 'open').reduce((s, r) => s + parseInt(r.count), 0);
    const upcoming = rows.filter(r => r.status === 'upcoming').reduce((s, r) => s + parseInt(r.count), 0);
    const closed = rows.filter(r => r.status === 'closed').reduce((s, r) => s + parseInt(r.count), 0);
    const total = open + upcoming + closed;

    res.json({ breakdown: rows, open, upcoming, closed, total });
  } catch (err) {
    console.error('GET /api/health-events/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch health events summary' });
  }
});

// GET /api/health-events/:id — single event with full details
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query('SELECT * FROM health_events WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/health-events/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

module.exports = router;
