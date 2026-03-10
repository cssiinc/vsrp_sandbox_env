const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/inventory — paginated resource list with filters
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, resource_type, region, name, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (resource_type) { conditions.push(`resource_type = $${idx++}`); params.push(resource_type); }
    if (region) { conditions.push(`aws_region = $${idx++}`); params.push(region); }
    if (name) { conditions.push(`resource_name ILIKE $${idx++}`); params.push(`%${name}%`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM resource_inventory ${where}`, params),
      pool.query(
        `SELECT id, account_id, resource_type, resource_id, resource_name, resource_arn,
                aws_region, tags, resource_status, config_capture_time, updated_at
         FROM resource_inventory ${where}
         ORDER BY resource_type, resource_name
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
    ]);

    res.json({
      resources: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/inventory error:', err.message);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// GET /api/inventory/summary — count by resource type
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT resource_type, COUNT(*) as count
       FROM resource_inventory
       GROUP BY resource_type
       ORDER BY count DESC`
    );
    const total = rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    const accounts = await pool.query(
      'SELECT COUNT(DISTINCT account_id) as count FROM resource_inventory'
    );
    res.json({
      types: rows,
      total,
      account_count: parseInt(accounts.rows[0].count),
    });
  } catch (err) {
    console.error('GET /api/inventory/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
});

// GET /api/inventory/:id — single resource with full configuration
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query('SELECT * FROM resource_inventory WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Resource not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/inventory/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch resource' });
  }
});

module.exports = router;
