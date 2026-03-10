const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/logs — search and filter log entries
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const {
      account, event_name, event_source, username, source_ip,
      error_code, read_only, event_type, from, to,
      search, page = 1, limit = 50,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (event_name) { conditions.push(`event_name ILIKE $${idx++}`); params.push(`%${event_name}%`); }
    if (event_source) { conditions.push(`event_source ILIKE $${idx++}`); params.push(`%${event_source}%`); }
    if (username) { conditions.push(`username ILIKE $${idx++}`); params.push(`%${username}%`); }
    if (source_ip) { conditions.push(`source_ip = $${idx++}`); params.push(source_ip); }
    if (error_code) { conditions.push(`error_code ILIKE $${idx++}`); params.push(`%${error_code}%`); }
    if (event_type) { conditions.push(`event_type = $${idx++}`); params.push(event_type); }
    if (from) { conditions.push(`event_time >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`event_time <= $${idx++}`); params.push(to); }

    if (read_only === 'true') { conditions.push('read_only = true'); }
    else if (read_only === 'false') { conditions.push('read_only = false'); }

    // Full-text search across event_name, username, error_code, error_message
    if (search) {
      conditions.push(`(
        event_name ILIKE $${idx} OR
        username ILIKE $${idx} OR
        event_source ILIKE $${idx} OR
        error_code ILIKE $${idx} OR
        error_message ILIKE $${idx} OR
        source_ip ILIKE $${idx}
      )`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM log_entries ${where}`, params),
      pool.query(
        `SELECT id, account_id, event_id, event_time, event_name, event_source,
                aws_region, event_type, username, user_type, source_ip,
                error_code, error_message, read_only, management_event
         FROM log_entries ${where}
         ORDER BY event_time DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
    ]);

    res.json({
      logs: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/logs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// GET /api/logs/summary — log stats for overview cards
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, hours = 24 } = req.query;

    const acctFilter = account ? ' AND account_id = $1' : '';
    const acctParams = account ? [account] : [];
    const hoursInt = parseInt(hours);

    const [totalRes, errorRes, topUsersRes, topServicesRes, topEventsRes, readWriteRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as total FROM log_entries
         WHERE event_time >= NOW() - INTERVAL '${hoursInt} hours'${acctFilter}`,
        acctParams
      ),
      pool.query(
        `SELECT COUNT(*) as errors FROM log_entries
         WHERE error_code IS NOT NULL AND event_time >= NOW() - INTERVAL '${hoursInt} hours'${acctFilter}`,
        acctParams
      ),
      pool.query(
        `SELECT username, COUNT(*) as count FROM log_entries
         WHERE event_time >= NOW() - INTERVAL '${hoursInt} hours'${acctFilter}
         GROUP BY username ORDER BY count DESC LIMIT 10`,
        acctParams
      ),
      pool.query(
        `SELECT event_source, COUNT(*) as count FROM log_entries
         WHERE event_time >= NOW() - INTERVAL '${hoursInt} hours'${acctFilter}
         GROUP BY event_source ORDER BY count DESC LIMIT 10`,
        acctParams
      ),
      pool.query(
        `SELECT event_name, COUNT(*) as count FROM log_entries
         WHERE event_time >= NOW() - INTERVAL '${hoursInt} hours'${acctFilter}
         GROUP BY event_name ORDER BY count DESC LIMIT 10`,
        acctParams
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE read_only = true) as read_count,
           COUNT(*) FILTER (WHERE read_only = false) as write_count
         FROM log_entries
         WHERE event_time >= NOW() - INTERVAL '${hoursInt} hours'${acctFilter}`,
        acctParams
      ),
    ]);

    res.json({
      total: parseInt(totalRes.rows[0].total),
      errors: parseInt(errorRes.rows[0].errors),
      top_users: topUsersRes.rows,
      top_services: topServicesRes.rows,
      top_events: topEventsRes.rows,
      read_count: parseInt(readWriteRes.rows[0].read_count),
      write_count: parseInt(readWriteRes.rows[0].write_count),
      hours: hoursInt,
    });
  } catch (err) {
    console.error('GET /api/logs/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch log summary' });
  }
});

// GET /api/logs/timeline — event count by hour for charting
router.get('/timeline', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, hours = 24 } = req.query;

    const acctFilter = account ? ' AND account_id = $1' : '';
    const acctParams = account ? [account] : [];
    const hoursInt = parseInt(hours);

    const { rows } = await pool.query(
      `SELECT date_trunc('hour', event_time) as hour,
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE error_code IS NOT NULL) as errors,
              COUNT(*) FILTER (WHERE read_only = false) as writes
       FROM log_entries
       WHERE event_time >= NOW() - INTERVAL '${hoursInt} hours'${acctFilter}
       GROUP BY hour
       ORDER BY hour`,
      acctParams
    );

    res.json({ timeline: rows });
  } catch (err) {
    console.error('GET /api/logs/timeline error:', err.message);
    res.status(500).json({ error: 'Failed to fetch log timeline' });
  }
});

// GET /api/logs/:id — get full log entry with raw event
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      'SELECT * FROM log_entries WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Log entry not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/logs/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch log entry' });
  }
});

module.exports = router;
