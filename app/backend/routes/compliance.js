const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/compliance — rule-level compliance, paginated
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, compliance_type, rule_name, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (compliance_type) { conditions.push(`compliance_type = $${idx++}`); params.push(compliance_type); }
    if (rule_name) { conditions.push(`config_rule_name ILIKE $${idx++}`); params.push(`%${rule_name}%`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM config_compliance ${where}`, params),
      pool.query(
        `SELECT id, account_id, config_rule_name, compliance_type,
                compliant_count, non_compliant_count, aws_region, updated_at
         FROM config_compliance ${where}
         ORDER BY CASE compliance_type
           WHEN 'NON_COMPLIANT' THEN 1
           WHEN 'INSUFFICIENT_DATA' THEN 2
           WHEN 'COMPLIANT' THEN 3
           ELSE 4 END,
           config_rule_name
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
    ]);

    res.json({
      rules: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/compliance error:', err.message);
    res.status(500).json({ error: 'Failed to fetch compliance data' });
  }
});

// GET /api/compliance/summary — counts by compliance type
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT compliance_type, COUNT(*) as count
       FROM config_compliance
       GROUP BY compliance_type`
    );
    const { rows: byAccount } = await pool.query(
      `SELECT account_id,
         COUNT(*) FILTER (WHERE compliance_type = 'COMPLIANT') as compliant,
         COUNT(*) FILTER (WHERE compliance_type = 'NON_COMPLIANT') as non_compliant,
         COUNT(*) as total_rules,
         ROUND(100.0 * COUNT(*) FILTER (WHERE compliance_type = 'COMPLIANT') / NULLIF(COUNT(*), 0), 1) as compliance_pct
       FROM config_compliance
       GROUP BY account_id
       ORDER BY compliance_pct ASC`
    );

    const summary = {};
    for (const r of rows) summary[r.compliance_type] = parseInt(r.count);

    res.json({ summary, by_account: byAccount });
  } catch (err) {
    console.error('GET /api/compliance/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch compliance summary' });
  }
});

// GET /api/compliance/details — non-compliant resource details
router.get('/details', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, rule_name, resource_type, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (rule_name) { conditions.push(`config_rule_name = $${idx++}`); params.push(rule_name); }
    if (resource_type) { conditions.push(`resource_type = $${idx++}`); params.push(resource_type); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM config_compliance_details ${where}`, params),
      pool.query(
        `SELECT id, account_id, config_rule_name, resource_type, resource_id,
                compliance_type, annotation, ordering_timestamp
         FROM config_compliance_details ${where}
         ORDER BY ordering_timestamp DESC NULLS LAST
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
    ]);

    res.json({
      details: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/compliance/details error:', err.message);
    res.status(500).json({ error: 'Failed to fetch compliance details' });
  }
});

module.exports = router;
