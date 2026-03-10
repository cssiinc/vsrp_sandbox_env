/**
 * CloudTrail Log Explorer sync worker — pulls ALL events (read + write) via
 * LookupEvents API and stores them in log_entries for the Log Explorer.
 *
 * This is separate from the Change Log sync (cloudtrail.js) which only captures
 * write events. The Log Explorer captures everything for SIEM-like investigation.
 *
 * LookupEvents covers management events (API calls, console logins, IAM changes,
 * security group modifications, resource lifecycle, error events, cross-account
 * assume role, etc.) — up to 90 days of history.
 *
 * Not covered: data events (S3 object-level, Lambda invocations, DynamoDB reads)
 * which require trail data event logging and S3 access.
 */
const { CloudTrailClient, LookupEventsCommand } = require('@aws-sdk/client-cloudtrail');
const { runSyncForAllAccounts, REGION } = require('./engine');

const LOOKBACK_HOURS = parseInt(process.env.LOG_LOOKBACK_HOURS, 10) || 24;
const MAX_EVENTS = parseInt(process.env.LOG_MAX_RECORDS, 10) || 5000;

/**
 * Sync CloudTrail events for a single account — both read and write.
 */
async function syncAccount(credentials, account, pool) {
  const client = new CloudTrailClient({ region: REGION, credentials });
  const startTime = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
  let totalUpserted = 0;

  // Pull ALL events (no ReadOnly filter = both read and write)
  for (const readOnly of ['false', 'true']) {
    let nextToken;
    let batchCount = 0;

    do {
      const res = await client.send(new LookupEventsCommand({
        StartTime: startTime,
        EndTime: new Date(),
        MaxResults: 50,
        NextToken: nextToken,
        LookupAttributes: [{
          AttributeKey: 'ReadOnly',
          AttributeValue: readOnly,
        }],
      }));

      const events = res.Events || [];
      for (const e of events) {
        const detail = safeJson(e.CloudTrailEvent);
        const userIdentity = detail?.userIdentity || {};
        const username = userIdentity.userName ||
          userIdentity.principalId?.split(':').pop() ||
          userIdentity.arn?.split('/').pop() ||
          userIdentity.invokedBy ||
          'unknown';

        try {
          await pool.query(
            `INSERT INTO log_entries
               (account_id, event_id, event_time, event_name, event_source,
                aws_region, event_type, username, user_type, source_ip, user_agent,
                request_params, response_elements, resources, error_code, error_message,
                read_only, management_event, recipient_account, shared_event_id,
                vpc_endpoint_id, raw_event)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
             ON CONFLICT (event_id) DO NOTHING`,
            [
              account.account_id,
              e.EventId,
              e.EventTime,
              e.EventName,
              e.EventSource || detail?.eventSource || '',
              detail?.awsRegion || REGION,
              detail?.eventType || null,
              username,
              userIdentity.type || null,
              detail?.sourceIPAddress || null,
              detail?.userAgent || null,
              JSON.stringify(detail?.requestParameters || null),
              JSON.stringify(detail?.responseElements || null),
              JSON.stringify(e.Resources || []),
              detail?.errorCode || null,
              detail?.errorMessage || null,
              readOnly === 'true',
              detail?.managementEvent !== false,
              detail?.recipientAccountId || null,
              detail?.sharedEventID || null,
              detail?.vpcEndpointId || null,
              JSON.stringify(detail || {}),
            ]
          );
          totalUpserted++;
        } catch (dbErr) {
          if (!dbErr.message.includes('duplicate key')) {
            console.warn(`[cloudtrail-s3] Record insert error: ${dbErr.message}`);
          }
        }
      }

      nextToken = res.NextToken;
      batchCount += events.length;

      // Cap total events to prevent runaway syncs
      if (totalUpserted >= MAX_EVENTS) break;

    } while (nextToken && batchCount < MAX_EVENTS);

    if (totalUpserted >= MAX_EVENTS) break;
  }

  return totalUpserted;
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

async function syncAll() {
  return runSyncForAllAccounts('cloudtrail-s3', syncAccount);
}

module.exports = { syncAll };
