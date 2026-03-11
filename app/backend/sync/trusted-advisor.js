/**
 * Trusted Advisor sync worker — pulls check metadata and results across
 * all accounts.
 *
 * Trusted Advisor provides recommendations in 5 categories:
 * cost_optimizing, security, fault_tolerance, performance, service_limits.
 *
 * Requires Business or Enterprise Support plan. If not available,
 * the sync gracefully skips with a log message (like health-events).
 */
const {
  SupportClient,
  DescribeTrustedAdvisorChecksCommand,
  DescribeTrustedAdvisorCheckResultCommand,
} = require('@aws-sdk/client-support');
const { runSyncForAllAccounts } = require('./engine');

async function syncAccount(credentials, account, pool) {
  // Trusted Advisor API only available in us-east-1
  const client = new SupportClient({ region: 'us-east-1', credentials });

  let checks;
  try {
    const res = await client.send(new DescribeTrustedAdvisorChecksCommand({ language: 'en' }));
    checks = res.checks || [];
  } catch (err) {
    if (err.name === 'SubscriptionRequiredException' ||
        err.message?.includes('subscription')) {
      console.log(`[trusted-advisor] Account ${account.account_id}: no Business/Enterprise support — skipping`);
      return 0;
    }
    throw err;
  }

  let totalUpserted = 0;

  for (const check of checks) {
    let result;
    try {
      const res = await client.send(new DescribeTrustedAdvisorCheckResultCommand({
        checkId: check.id,
        language: 'en',
      }));
      result = res.result;
    } catch (err) {
      // Some checks may not be available; skip them
      continue;
    }

    if (!result) continue;

    const status = result.status || 'not_available';
    const resourcesSummary = result.resourcesSummary || {};
    const flaggedResources = (result.flaggedResources || []).slice(0, 100); // Cap stored resources

    // Estimate savings from cost_optimizing checks
    let estimatedSavings = 0;
    if (check.category === 'cost_optimizing' && result.categorySpecificSummary?.costOptimizing) {
      estimatedSavings = result.categorySpecificSummary.costOptimizing.estimatedMonthlySavings || 0;
    }

    try {
      await pool.query(
        `INSERT INTO trusted_advisor_checks
           (account_id, check_id, check_name, category, description, status,
            resources_flagged, resources_ignored, resources_suppressed,
            resources_processed, estimated_savings, flagged_resources, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (account_id, check_id) DO UPDATE SET
           check_name = EXCLUDED.check_name,
           status = EXCLUDED.status,
           resources_flagged = EXCLUDED.resources_flagged,
           resources_ignored = EXCLUDED.resources_ignored,
           resources_suppressed = EXCLUDED.resources_suppressed,
           resources_processed = EXCLUDED.resources_processed,
           estimated_savings = EXCLUDED.estimated_savings,
           flagged_resources = EXCLUDED.flagged_resources,
           synced_at = NOW()`,
        [
          account.account_id,
          check.id,
          check.name,
          check.category,
          check.description || null,
          status,
          resourcesSummary.resourcesFlagged || 0,
          resourcesSummary.resourcesIgnored || 0,
          resourcesSummary.resourcesSuppressed || 0,
          resourcesSummary.resourcesProcessed || 0,
          estimatedSavings,
          JSON.stringify(flaggedResources.map(r => ({
            status: r.status,
            region: r.region,
            metadata: r.metadata,
          }))),
        ]
      );
      totalUpserted++;
    } catch (dbErr) {
      if (dbErr.code !== '23505') {
        console.warn(`[trusted-advisor] Insert error: ${dbErr.message}`);
      }
    }
  }

  return totalUpserted;
}

async function syncAll() {
  return runSyncForAllAccounts('trusted-advisor', syncAccount);
}

module.exports = { syncAll };
