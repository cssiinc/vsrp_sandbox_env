const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

// GET /api/inspector — paginated findings with filters
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const {
      account, severity, repository, package_name, exploit,
      fix, search, page = 1, limit = 50,
    } = req.query;

    const conditions = ["status = 'ACTIVE'"];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (severity) { conditions.push(`severity = $${idx++}`); params.push(severity.toUpperCase()); }
    if (repository) { conditions.push(`repository = $${idx++}`); params.push(repository); }
    if (package_name) { conditions.push(`package_name ILIKE $${idx++}`); params.push(`%${package_name}%`); }
    if (exploit === 'true') { conditions.push('exploit_available = true'); }
    if (fix === 'true') { conditions.push('fix_available = true'); }
    if (fix === 'false') { conditions.push('fix_available = false'); }
    if (search) { conditions.push(`(title ILIKE $${idx} OR vuln_id ILIKE $${idx} OR package_name ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM inspector_findings ${where}`, params),
      pool.query(
        `SELECT id, account_id, finding_arn, severity, inspector_score, title,
                type, resource_type, repository, image_tags, platform,
                vuln_id, package_name, package_version, fixed_in, package_manager,
                exploit_available, fix_available, first_seen, last_seen
         FROM inspector_findings ${where}
         ORDER BY
           CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
           inspector_score DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
    ]);

    res.json({
      findings: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /api/inspector error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Inspector findings' });
  }
});

// GET /api/inspector/summary — vulnerability overview
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const { account, repository } = req.query;
    const conditions = ["status = 'ACTIVE'"];
    const params = [];
    let idx = 1;

    if (account) { conditions.push(`account_id = $${idx++}`); params.push(account); }
    if (repository) { conditions.push(`repository = $${idx++}`); params.push(repository); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [severityRes, repoRes, pkgRes, exploitRes] = await Promise.all([
      pool.query(
        `SELECT severity, COUNT(*) as count FROM inspector_findings ${where}
         GROUP BY severity ORDER BY
           CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END`,
        params
      ),
      pool.query(
        `SELECT repository, COUNT(*) as count,
                COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical,
                COUNT(*) FILTER (WHERE severity = 'HIGH') as high
         FROM inspector_findings ${where}
         GROUP BY repository ORDER BY count DESC`,
        params
      ),
      pool.query(
        `SELECT package_name, COUNT(*) as count,
                MAX(severity) as max_severity,
                bool_or(exploit_available) as has_exploit
         FROM inspector_findings ${where}
         GROUP BY package_name ORDER BY count DESC LIMIT 15`,
        params
      ),
      pool.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE exploit_available = true) as exploitable,
           COUNT(*) FILTER (WHERE fix_available = true) as fixable,
           COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical,
           COUNT(*) FILTER (WHERE severity = 'HIGH') as high,
           COUNT(*) FILTER (WHERE severity = 'MEDIUM') as medium,
           COUNT(*) FILTER (WHERE severity = 'LOW' OR severity = 'INFORMATIONAL') as low
         FROM inspector_findings ${where}`,
        params
      ),
    ]);

    const bySeverity = {};
    for (const r of severityRes.rows) bySeverity[r.severity] = parseInt(r.count);

    res.json({
      ...exploitRes.rows[0],
      by_severity: bySeverity,
      by_repository: repoRes.rows,
      top_packages: pkgRes.rows,
    });
  } catch (err) {
    console.error('GET /api/inspector/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Inspector summary' });
  }
});

// GET /api/inspector/:id — single finding with raw JSON
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query('SELECT * FROM inspector_findings WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Finding not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/inspector/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch finding' });
  }
});

module.exports = router;
