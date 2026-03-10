/**
 * AWS Health Events sync worker — pulls health events per account.
 * Health API is only available in us-east-1.
 */
const {
  HealthClient,
  DescribeEventsCommand,
  DescribeEventDetailsCommand,
  DescribeAffectedEntitiesCommand,
} = require('@aws-sdk/client-health');
const { runSyncForAllAccounts } = require('./engine');

const MAX_EVENTS = 200;

async function syncAccount(credentials, account, pool) {
  // Health API only available in us-east-1
  const client = new HealthClient({ region: 'us-east-1', credentials });
  let totalRecords = 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Discover events
  const events = [];
  let nextToken;
  do {
    let res;
    try {
      res = await client.send(new DescribeEventsCommand({
        filter: {
          startTimes: [{ from: thirtyDaysAgo }],
        },
        maxResults: 100,
        nextToken,
      }));
    } catch (err) {
      // Health API may not be available for all accounts
      if (err.name === 'SubscriptionRequiredException') {
        console.warn(`[health-events] Health API not available for ${account.account_id} (Business/Enterprise support required)`);
        return 0;
      }
      throw err;
    }

    events.push(...(res.events || []));
    nextToken = res.nextToken;
  } while (nextToken && events.length < MAX_EVENTS);

  if (events.length === 0) return 0;

  // Get event details in batches of 10
  for (let i = 0; i < events.length; i += 10) {
    const batch = events.slice(i, i + 10);
    const arns = batch.map(e => e.arn);

    let details = [];
    try {
      const res = await client.send(new DescribeEventDetailsCommand({
        eventArns: arns,
      }));
      details = res.successfulSet || [];
    } catch {
      details = [];
    }

    const detailMap = new Map();
    for (const d of details) {
      detailMap.set(d.event?.arn, d);
    }

    for (const event of batch) {
      const detail = detailMap.get(event.arn);
      const description = detail?.eventDescription?.latestDescription || null;

      // Get affected entities for open/upcoming events
      let affectedEntities = null;
      if (event.statusCode === 'open' || event.statusCode === 'upcoming') {
        try {
          const entRes = await client.send(new DescribeAffectedEntitiesCommand({
            filter: { eventArns: [event.arn] },
          }));
          affectedEntities = (entRes.entities || []).map(e => ({
            entityValue: e.entityValue,
            entityUrl: e.entityUrl,
            statusCode: e.statusCode,
          }));
        } catch {
          // Non-fatal
        }
      }

      await pool.query(
        `INSERT INTO health_events
           (account_id, event_arn, event_type_code, event_type_category, service,
            aws_region, status, start_time, end_time, last_updated,
            description, affected_entities, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         ON CONFLICT (event_arn)
         DO UPDATE SET
           status = EXCLUDED.status,
           end_time = EXCLUDED.end_time,
           last_updated = EXCLUDED.last_updated,
           description = EXCLUDED.description,
           affected_entities = EXCLUDED.affected_entities,
           updated_at = NOW()`,
        [
          account.account_id, event.arn,
          event.eventTypeCode, event.eventTypeCategory, event.service,
          event.region || null, event.statusCode,
          event.startTime || null, event.endTime || null, event.lastUpdatedTime || null,
          description,
          affectedEntities ? JSON.stringify(affectedEntities) : null,
        ]
      );
      totalRecords++;
    }
  }

  return totalRecords;
}

async function syncAll() {
  return runSyncForAllAccounts('health-events', syncAccount);
}

module.exports = { syncAll };
