/**
 * CloudTrail sync worker — pulls recent events via LookupEvents
 * and upserts them into the cloudtrail_events table.
 */
const { CloudTrailClient, LookupEventsCommand } = require('@aws-sdk/client-cloudtrail');
const { runSyncForAllAccounts, REGION } = require('./engine');

// How far back to look on each sync (default 1 hour, first run catches more)
const LOOKBACK_HOURS = parseInt(process.env.CT_LOOKBACK_HOURS, 10) || 1;

/**
 * Sync CloudTrail events for a single account.
 * Pulls write events (non-read-only) from the last LOOKBACK_HOURS.
 */
async function syncAccount(credentials, account, pool) {
  const client = new CloudTrailClient({
    region: REGION,
    credentials,
  });

  const startTime = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
  let nextToken = undefined;
  let totalUpserted = 0;

  do {
    const res = await client.send(new LookupEventsCommand({
      StartTime: startTime,
      EndTime: new Date(),
      MaxResults: 50,
      NextToken: nextToken,
      LookupAttributes: [{
        AttributeKey: 'ReadOnly',
        AttributeValue: 'false',
      }],
    }));

    const events = res.Events || [];
    for (const e of events) {
      const detail = safeJson(e.CloudTrailEvent);
      const userIdentity = detail?.userIdentity || {};
      const username = userIdentity.userName ||
        userIdentity.principalId?.split(':').pop() ||
        userIdentity.arn?.split('/').pop() ||
        'unknown';

      await pool.query(
        `INSERT INTO cloudtrail_events
           (account_id, event_id, event_time, event_name, event_source,
            aws_region, user_identity, username, source_ip, user_agent,
            resources, request_params, response_elements, error_code,
            error_message, read_only)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          account.account_id,
          e.EventId,
          e.EventTime,
          e.EventName,
          e.EventSource,
          detail?.awsRegion || REGION,
          JSON.stringify(userIdentity),
          username,
          detail?.sourceIPAddress || null,
          detail?.userAgent || null,
          JSON.stringify(e.Resources || []),
          JSON.stringify(detail?.requestParameters || null),
          JSON.stringify(detail?.responseElements || null),
          detail?.errorCode || null,
          detail?.errorMessage || null,
          false,
        ]
      );
      totalUpserted++;
    }

    nextToken = res.NextToken;
    // CloudTrail LookupEvents paginates heavily — cap at 500 events per sync
    if (totalUpserted >= 500) break;
  } while (nextToken);

  return totalUpserted;
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

/**
 * Run CloudTrail sync across all enabled accounts.
 */
async function syncAll() {
  return runSyncForAllAccounts('cloudtrail', syncAccount);
}

module.exports = { syncAll };
