const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/sso/users — all SSO users with their groups
router.get('/users', async (req, res) => {
  try {
    const pool = await getPool();
    const { search, status } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`u.user_status = $${idx++}`); params.push(status); }
    if (search) {
      conditions.push(`(u.username ILIKE $${idx} OR u.display_name ILIKE $${idx} OR u.email ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: users } = await pool.query(
      `SELECT u.*,
              COALESCE(
                (SELECT json_agg(json_build_object('group_id', g.group_id, 'display_name', g.display_name))
                 FROM sso_group_members gm
                 JOIN sso_groups g ON g.group_id = gm.group_id
                 WHERE gm.user_id = u.user_id),
                '[]'::json
              ) as groups
       FROM sso_users u ${where}
       ORDER BY u.display_name ASC`,
      params
    );

    res.json({ users, total: users.length });
  } catch (err) {
    console.error('GET /api/sso/users error:', err.message);
    res.status(500).json({ error: 'Failed to fetch SSO users' });
  }
});

// GET /api/sso/groups — all SSO groups with member counts
router.get('/groups', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT g.*,
              COUNT(gm.user_id) as member_count,
              COALESCE(
                (SELECT json_agg(json_build_object('user_id', u.user_id, 'username', u.username, 'display_name', u.display_name, 'email', u.email))
                 FROM sso_group_members gm2
                 JOIN sso_users u ON u.user_id = gm2.user_id
                 WHERE gm2.group_id = g.group_id),
                '[]'::json
              ) as members
       FROM sso_groups g
       LEFT JOIN sso_group_members gm ON gm.group_id = g.group_id
       GROUP BY g.id, g.group_id, g.display_name, g.description, g.created_at_aws, g.synced_at
       ORDER BY member_count DESC, g.display_name ASC`
    );
    res.json({ groups: rows, total: rows.length });
  } catch (err) {
    console.error('GET /api/sso/groups error:', err.message);
    res.status(500).json({ error: 'Failed to fetch SSO groups' });
  }
});

// GET /api/sso/summary — overview stats
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const [usersRes, groupsRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE user_status = 'ENABLED') as enabled,
                COUNT(*) FILTER (WHERE user_status = 'DISABLED') as disabled
         FROM sso_users`
      ),
      pool.query('SELECT COUNT(*) as total FROM sso_groups'),
    ]);

    res.json({
      users: usersRes.rows[0],
      groups: parseInt(groupsRes.rows[0].total),
    });
  } catch (err) {
    console.error('GET /api/sso/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch SSO summary' });
  }
});

module.exports = router;
