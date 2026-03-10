/**
 * Security Hub sync worker — pulls findings from Security Hub
 * and upserts them into the security_findings table.
 */
const { SecurityHubClient, GetFindingsCommand } = require('@aws-sdk/client-securityhub');
const { runSyncForAllAccounts, REGION } = require('./engine');

/**
 * Sync Security Hub findings for a single account.
 * Uses the assumed-role credentials.
 */
async function syncAccount(credentials, account, pool) {
  const client = new SecurityHubClient({
    region: REGION,
    credentials,
  });

  let nextToken = undefined;
  let totalUpserted = 0;

  do {
    const res = await client.send(new GetFindingsCommand({
      Filters: {
        RecordState: [{ Value: 'ACTIVE', Comparison: 'EQUALS' }],
        WorkflowStatus: [{ Value: 'NEW', Comparison: 'EQUALS' }, { Value: 'NOTIFIED', Comparison: 'EQUALS' }],
      },
      MaxResults: 100,
      NextToken: nextToken,
    }));

    const findings = res.Findings || [];
    for (const f of findings) {
      await pool.query(
        `INSERT INTO security_findings
           (account_id, source, severity, title, description, resource_arn,
            resource_type, status, compliance_status, finding_id, first_seen,
            last_seen, raw_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
         ON CONFLICT (finding_id) DO UPDATE SET
           severity = EXCLUDED.severity,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           compliance_status = EXCLUDED.compliance_status,
           last_seen = EXCLUDED.last_seen,
           raw_json = EXCLUDED.raw_json,
           updated_at = NOW()`,
        [
          account.account_id,
          mapSource(f),
          f.Severity?.Label || 'INFORMATIONAL',
          f.Title || 'Untitled',
          f.Description || null,
          extractResourceArn(f),
          extractResourceType(f),
          f.Workflow?.Status || 'NEW',
          f.Compliance?.Status || null,
          f.Id,
          f.FirstObservedAt || f.CreatedAt,
          f.LastObservedAt || f.UpdatedAt,
          JSON.stringify(f),
        ]
      );
      totalUpserted++;
    }

    nextToken = res.NextToken;
  } while (nextToken);

  return totalUpserted;
}

function mapSource(finding) {
  const gen = (finding.GeneratorId || '').toLowerCase();
  if (gen.includes('guardduty')) return 'guardduty';
  if (gen.includes('access-analyzer')) return 'access-analyzer';
  return 'securityhub';
}

function extractResourceArn(finding) {
  const resources = finding.Resources || [];
  return resources[0]?.Id || null;
}

function extractResourceType(finding) {
  const resources = finding.Resources || [];
  return resources[0]?.Type || null;
}

/**
 * Run Security Hub sync across all enabled accounts.
 */
async function syncAll() {
  return runSyncForAllAccounts('security-hub', syncAccount);
}

module.exports = { syncAll };
