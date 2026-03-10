/**
 * Cost Explorer sync worker — pulls daily cost by service per account.
 */
const {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostForecastCommand,
} = require('@aws-sdk/client-cost-explorer');
const { runSyncForAllAccounts, REGION } = require('./engine');

const LOOKBACK_DAYS = parseInt(process.env.COST_LOOKBACK_DAYS, 10) || 30;

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

async function syncAccount(credentials, account, pool) {
  const client = new CostExplorerClient({ region: REGION, credentials });
  let totalRecords = 0;

  // Pull daily cost grouped by service
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - LOOKBACK_DAYS);

  let nextPageToken;
  do {
    const res = await client.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: formatDate(start), End: formatDate(end) },
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost'],
      GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      NextPageToken: nextPageToken,
    }));

    for (const period of (res.ResultsByTime || [])) {
      const periodStart = period.TimePeriod.Start;
      const periodEnd = period.TimePeriod.End;

      for (const group of (period.Groups || [])) {
        const service = group.Keys[0];
        const amount = parseFloat(group.Metrics.UnblendedCost.Amount);
        const unit = group.Metrics.UnblendedCost.Unit || 'USD';

        if (amount === 0) continue;

        await pool.query(
          `INSERT INTO cost_data (account_id, period_start, period_end, granularity, service, amount, unit)
           VALUES ($1, $2, $3, 'DAILY', $4, $5, $6)
           ON CONFLICT (account_id, period_start, granularity, service)
           DO UPDATE SET amount = EXCLUDED.amount, period_end = EXCLUDED.period_end`,
          [account.account_id, periodStart, periodEnd, service, amount, unit]
        );
        totalRecords++;
      }
    }

    nextPageToken = res.NextPageToken;
  } while (nextPageToken);

  // Pull cost forecast for the rest of this month
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const monthEnd = new Date(end.getFullYear(), end.getMonth() + 1, 1);

    if (tomorrow < monthEnd) {
      const forecast = await client.send(new GetCostForecastCommand({
        TimePeriod: { Start: formatDate(tomorrow), End: formatDate(monthEnd) },
        Metric: 'UNBLENDED_COST',
        Granularity: 'MONTHLY',
      }));

      if (forecast.Total) {
        await pool.query(
          `INSERT INTO cost_forecasts (account_id, forecast_start, forecast_end, mean_value, unit)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (account_id, forecast_start, forecast_end)
           DO UPDATE SET mean_value = EXCLUDED.mean_value`,
          [
            account.account_id,
            formatDate(tomorrow),
            formatDate(monthEnd),
            parseFloat(forecast.Total.Amount),
            forecast.Total.Unit || 'USD',
          ]
        );
        totalRecords++;
      }
    }
  } catch (err) {
    // Forecast may fail if not enough data — non-fatal
    console.warn(`[cost-explorer] Forecast failed for ${account.account_id}: ${err.message}`);
  }

  return totalRecords;
}

async function syncAll() {
  return runSyncForAllAccounts('cost-explorer', syncAccount);
}

module.exports = { syncAll };
