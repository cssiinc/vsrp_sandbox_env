/**
 * Amazon Inspector sync worker — pulls container image and package
 * vulnerability findings across all accounts.
 *
 * Inspector v2 provides continuous scanning of ECR container images,
 * EC2 instances, and Lambda functions for known CVEs. This worker
 * pulls ACTIVE findings and stores them for the Inspector dashboard.
 */
const {
  Inspector2Client,
  ListFindingsCommand,
} = require('@aws-sdk/client-inspector2');
const { runSyncForAllAccounts, REGION } = require('./engine');

const MAX_FINDINGS = parseInt(process.env.INSPECTOR_MAX_FINDINGS, 10) || 2000;

async function syncAccount(credentials, account, pool) {
  const client = new Inspector2Client({ region: REGION, credentials });

  let nextToken;
  let totalUpserted = 0;

  do {
    const res = await client.send(new ListFindingsCommand({
      filterCriteria: {
        findingStatus: [{ comparison: 'EQUALS', value: 'ACTIVE' }],
      },
      maxResults: 100,
      nextToken,
    }));

    const findings = res.findings || [];
    for (const f of findings) {
      const resource = f.resources?.[0] || {};
      const ecrImage = resource.details?.awsEcrContainerImage || {};
      const vulnDetails = f.packageVulnerabilityDetails || {};
      const vulnPkg = vulnDetails.vulnerablePackages?.[0] || {};

      try {
        await pool.query(
          `INSERT INTO inspector_findings
             (account_id, finding_arn, severity, inspector_score, title, description,
              type, status, resource_type, resource_id, repository, image_hash,
              image_tags, platform, vuln_id, package_name, package_version, fixed_in,
              package_manager, exploit_available, fix_available, first_seen, last_seen,
              raw_json, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW())
           ON CONFLICT (finding_arn) DO UPDATE SET
             severity = EXCLUDED.severity,
             inspector_score = EXCLUDED.inspector_score,
             title = EXCLUDED.title,
             status = EXCLUDED.status,
             image_tags = EXCLUDED.image_tags,
             exploit_available = EXCLUDED.exploit_available,
             fix_available = EXCLUDED.fix_available,
             last_seen = EXCLUDED.last_seen,
             raw_json = EXCLUDED.raw_json,
             synced_at = NOW()`,
          [
            account.account_id,
            f.findingArn,
            f.severity || 'INFORMATIONAL',
            f.inspectorScore || 0,
            f.title || 'Untitled',
            f.description || null,
            f.type || null,
            f.status || 'ACTIVE',
            resource.type || null,
            resource.id || null,
            ecrImage.repositoryName || null,
            ecrImage.imageHash || null,
            JSON.stringify(ecrImage.imageTags || []),
            ecrImage.platform || null,
            vulnDetails.vulnerabilityId || null,
            vulnPkg.name || null,
            vulnPkg.version || null,
            vulnPkg.fixedInVersion || null,
            vulnPkg.packageManager || null,
            f.exploitAvailable === 'YES',
            f.fixAvailable === 'YES',
            f.firstObservedAt ? new Date(f.firstObservedAt) : null,
            f.lastObservedAt ? new Date(f.lastObservedAt) : null,
            JSON.stringify(f),
          ]
        );
        totalUpserted++;
      } catch (dbErr) {
        if (!dbErr.message.includes('duplicate key')) {
          console.warn(`[inspector] Insert error: ${dbErr.message}`);
        }
      }
    }

    nextToken = res.nextToken;
    if (totalUpserted >= MAX_FINDINGS) break;
  } while (nextToken);

  return totalUpserted;
}

async function syncAll() {
  return runSyncForAllAccounts('inspector', syncAccount);
}

module.exports = { syncAll };
