/**
 * Dashboard summary endpoint — aggregates key metrics from all modules
 * into a single response so the Dashboard page needs only one extra call.
 */
const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/dashboard/summary — aggregated metrics for GuardDuty, Inspector, IAM, Trusted Advisor
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { account } = req.query;
    const acctWhere = account ? 'WHERE account_id = $1' : '';
    const acctAnd = account ? 'AND account_id = $1' : '';
    const params = account ? [account] : [];

    const [gdRes, inspRes, iamRes, taRes] = await Promise.all([
      pool.query(
        `SELECT severity_label, COUNT(*) as count
         FROM guardduty_findings WHERE archived = false ${acctAnd}
         GROUP BY severity_label`,
        params
      ),
      pool.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical,
           COUNT(*) FILTER (WHERE severity = 'HIGH') as high,
           COUNT(*) FILTER (WHERE exploit_available = true) as exploitable,
           COUNT(*) FILTER (WHERE fix_available = true) as fixable
         FROM inspector_findings WHERE status = 'ACTIVE' ${acctAnd}`,
        params
      ),
      pool.query(
        `SELECT
           COUNT(*) as total_users,
           COUNT(*) FILTER (WHERE mfa_active = false AND iam_user != '<root_account>') as no_mfa,
           COUNT(*) FILTER (WHERE
             (access_key_1_active = true AND access_key_1_last_rotated < NOW() - INTERVAL '90 days')
             OR (access_key_2_active = true AND access_key_2_last_rotated < NOW() - INTERVAL '90 days')
           ) as stale_keys,
           COUNT(*) FILTER (WHERE access_key_1_active = true OR access_key_2_active = true) as users_with_keys
         FROM iam_credentials ${acctWhere}`,
        params
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'error') as errors,
           COUNT(*) FILTER (WHERE status = 'warning') as warnings,
           COALESCE(SUM(estimated_savings), 0) as total_savings
         FROM trusted_advisor_checks ${acctWhere}`,
        params
      ),
    ]);

    const guardduty = { HIGH: 0, MEDIUM: 0, LOW: 0, total: 0 };
    for (const r of gdRes.rows) {
      guardduty[r.severity_label] = parseInt(r.count);
      guardduty.total += parseInt(r.count);
    }

    res.json({
      guardduty,
      inspector: inspRes.rows[0],
      iam: iamRes.rows[0],
      trusted_advisor: taRes.rows[0],
    });
  } catch (err) {
    console.error('GET /api/dashboard/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

module.exports = router;
