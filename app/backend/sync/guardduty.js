/**
 * GuardDuty sync worker — pulls threat detection findings from GuardDuty
 * across all accounts.
 *
 * Flow: ListDetectors → GetFindings (active, non-archived) → upsert to DB.
 * GuardDuty provides threat intel for compromised instances, crypto mining,
 * credential exfiltration, unusual API calls, etc.
 */
const {
  GuardDutyClient,
  ListDetectorsCommand,
  ListFindingsCommand,
  GetFindingsCommand,
} = require('@aws-sdk/client-guardduty');
const { runSyncForAllAccounts, REGION } = require('./engine');

const MAX_FINDINGS = parseInt(process.env.GD_MAX_FINDINGS, 10) || 1000;

async function syncAccount(credentials, account, pool) {
  const client = new GuardDutyClient({ region: REGION, credentials });

  // Get detector ID (usually one per region)
  const detectors = await client.send(new ListDetectorsCommand({}));
  const detectorIds = detectors.DetectorIds || [];
  if (detectorIds.length === 0) {
    console.log(`[guardduty] No detector in account ${account.account_id}`);
    return 0;
  }

  let totalUpserted = 0;

  for (const detectorId of detectorIds) {
    // List finding IDs (non-archived)
    let nextToken;
    const allFindingIds = [];

    do {
      const listRes = await client.send(new ListFindingsCommand({
        DetectorId: detectorId,
        FindingCriteria: {
          Criterion: {
            'service.archived': { Eq: ['false'] },
          },
        },
        MaxResults: 50,
        NextToken: nextToken,
      }));

      allFindingIds.push(...(listRes.FindingIds || []));
      nextToken = listRes.NextToken;

      if (allFindingIds.length >= MAX_FINDINGS) break;
    } while (nextToken);

    // Fetch full findings in batches of 50
    for (let i = 0; i < allFindingIds.length; i += 50) {
      const batch = allFindingIds.slice(i, i + 50);
      const getRes = await client.send(new GetFindingsCommand({
        DetectorId: detectorId,
        FindingIds: batch,
      }));

      for (const f of (getRes.Findings || [])) {
        const resourceDetail = f.Resource || {};
        const resourceType = resourceDetail.ResourceType || null;
        let resourceId = null;

        // Extract resource identifier based on type
        if (resourceDetail.InstanceDetails) {
          resourceId = resourceDetail.InstanceDetails.InstanceId;
        } else if (resourceDetail.AccessKeyDetails) {
          resourceId = resourceDetail.AccessKeyDetails.AccessKeyId;
        } else if (resourceDetail.S3BucketDetails?.length > 0) {
          resourceId = resourceDetail.S3BucketDetails[0].Name;
        } else if (resourceDetail.EksClusterDetails) {
          resourceId = resourceDetail.EksClusterDetails.Name;
        }

        const severityVal = f.Severity || 0;
        const severityLabel = severityVal >= 7 ? 'HIGH' :
          severityVal >= 4 ? 'MEDIUM' : 'LOW';

        try {
          await pool.query(
            `INSERT INTO guardduty_findings
               (account_id, finding_id, detector_id, severity, severity_label,
                title, description, type, resource_type, resource_id, region,
                first_seen, last_seen, count, archived, raw_json, synced_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
             ON CONFLICT (finding_id) DO UPDATE SET
               severity = EXCLUDED.severity,
               severity_label = EXCLUDED.severity_label,
               title = EXCLUDED.title,
               description = EXCLUDED.description,
               last_seen = EXCLUDED.last_seen,
               count = EXCLUDED.count,
               archived = EXCLUDED.archived,
               raw_json = EXCLUDED.raw_json,
               synced_at = NOW()`,
            [
              account.account_id,
              f.Id,
              detectorId,
              severityVal,
              severityLabel,
              f.Title || 'Untitled',
              f.Description || null,
              f.Type || null,
              resourceType,
              resourceId,
              f.Region || REGION,
              f.Service?.EventFirstSeen ? new Date(f.Service.EventFirstSeen) : null,
              f.Service?.EventLastSeen ? new Date(f.Service.EventLastSeen) : null,
              f.Service?.Count || 1,
              f.Service?.Archived || false,
              JSON.stringify(f),
            ]
          );
          totalUpserted++;
        } catch (dbErr) {
          if (dbErr.code !== '23505') {
            console.warn(`[guardduty] Insert error: ${dbErr.message}`);
          }
        }
      }
    }
  }

  return totalUpserted;
}

async function syncAll() {
  return runSyncForAllAccounts('guardduty', syncAccount);
}

module.exports = { syncAll };
