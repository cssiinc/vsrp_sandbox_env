const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/accounts — list all monitored accounts
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      'SELECT * FROM accounts ORDER BY account_name ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/accounts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// GET /api/accounts/:id — get single account by UUID
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query('SELECT * FROM accounts WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/accounts/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// POST /api/accounts — add a new monitored account
router.post('/', async (req, res) => {
  const { account_id, account_name, role_arn, enabled } = req.body;

  if (!account_id || !account_name) {
    return res.status(400).json({ error: 'account_id and account_name are required' });
  }
  if (!/^\d{12}$/.test(account_id)) {
    return res.status(400).json({ error: 'account_id must be a 12-digit AWS account ID' });
  }

  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `INSERT INTO accounts (account_id, account_name, role_arn, enabled)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [account_id, account_name, role_arn || null, enabled !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Account already exists' });
    }
    console.error('POST /api/accounts error:', err.message);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PUT /api/accounts/:id — update an existing account
router.put('/:id', async (req, res) => {
  const { account_name, role_arn, enabled } = req.body;

  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `UPDATE accounts
       SET account_name = COALESCE($1, account_name),
           role_arn     = COALESCE($2, role_arn),
           enabled      = COALESCE($3, enabled),
           updated_at   = NOW()
       WHERE id = $4
       RETURNING *`,
      [account_name || null, role_arn || null, enabled, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/accounts/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE /api/accounts/:id — remove a monitored account
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rowCount } = await pool.query('DELETE FROM accounts WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Account not found' });
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /api/accounts/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
