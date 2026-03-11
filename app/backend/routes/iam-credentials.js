const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/iam — paginated IAM credentials with filters
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, mfa, key_active, search, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (mfa === 'true') { conditions.push('mfa_active = true'); }
    if (mfa === 'false') { conditions.push('mfa_active = false'); }
    if (key_active === 'true') { conditions.push('(access_key_1_active = true OR access_key_2_active = true)'); }
    if (key_active === 'stale') {
      conditions.push(`(
        (access_key_1_active = true AND access_key_1_last_rotated < NOW() - INTERVAL '90 days')
        OR (access_key_2_active = true AND access_key_2_last_rotated < NOW() - INTERVAL '90 days')
      )`);
    }
    if (search) { conditions.push(`(iam_user ILIKE $${idx} OR arn ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (Math.max(1, parseInt(page)) - 1) * safeLimit;

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM iam_credentials ${where}`, params),
      pool.query(
        `SELECT id, account_id, iam_user, arn, user_creation_time,
                password_enabled, password_last_used, password_last_changed,
                mfa_active, access_key_1_active, access_key_1_last_rotated,
                access_key_1_last_used, access_key_1_last_used_service,
                access_key_2_active, access_key_2_last_rotated,
                access_key_2_last_used, access_key_2_last_used_service,
                synced_at
         FROM iam_credentials ${where}
         ORDER BY mfa_active ASC, iam_user ASC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, safeLimit, offset]
      ),
    ]);

    res.json({
      credentials: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/iam error:', err.message);
    res.status(500).json({ error: 'Failed to fetch IAM credentials' });
  }
});

// GET /api/iam/summary — credential hygiene overview
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { account } = req.query;
    const acctFilter = account ? `WHERE account_id = $1` : '';
    const acctParams = account ? [account] : [];

    const { rows } = await pool.query(
      `SELECT
         COUNT(*) as total_users,
         COUNT(*) FILTER (WHERE iam_user = '<root_account>') as root_accounts,
         COUNT(*) FILTER (WHERE mfa_active = false AND iam_user != '<root_account>') as no_mfa,
         COUNT(*) FILTER (WHERE mfa_active = false AND iam_user = '<root_account>') as root_no_mfa,
         COUNT(*) FILTER (WHERE password_enabled = true AND password_last_used IS NULL) as unused_passwords,
         COUNT(*) FILTER (WHERE access_key_1_active = true OR access_key_2_active = true) as users_with_keys,
         COUNT(*) FILTER (WHERE
           (access_key_1_active = true AND access_key_1_last_rotated < NOW() - INTERVAL '90 days')
           OR (access_key_2_active = true AND access_key_2_last_rotated < NOW() - INTERVAL '90 days')
         ) as stale_keys,
         COUNT(*) FILTER (WHERE
           (access_key_1_active = true AND access_key_1_last_used IS NULL)
           OR (access_key_2_active = true AND access_key_2_last_used IS NULL)
         ) as unused_keys,
         COUNT(DISTINCT account_id) as account_count
       FROM iam_credentials ${acctFilter}`,
      acctParams
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/iam/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch IAM summary' });
  }
});

// GET /api/iam/by-account — breakdown by account
router.get('/by-account', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT
         account_id,
         COUNT(*) as total_users,
         COUNT(*) FILTER (WHERE mfa_active = false AND iam_user != '<root_account>') as no_mfa,
         COUNT(*) FILTER (WHERE access_key_1_active = true OR access_key_2_active = true) as with_keys,
         COUNT(*) FILTER (WHERE
           (access_key_1_active = true AND access_key_1_last_rotated < NOW() - INTERVAL '90 days')
           OR (access_key_2_active = true AND access_key_2_last_rotated < NOW() - INTERVAL '90 days')
         ) as stale_keys
       FROM iam_credentials
       GROUP BY account_id
       ORDER BY no_mfa DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/iam/by-account error:', err.message);
    res.status(500).json({ error: 'Failed to fetch IAM by-account' });
  }
});

// GET /api/iam/:id — single credential record
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query('SELECT * FROM iam_credentials WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Credential not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/iam/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch credential' });
  }
});

module.exports = router;
