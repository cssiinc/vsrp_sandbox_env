/**
 * Sync engine core — assumes roles, iterates accounts, tracks sync status.
 * Used by individual sync workers (security-hub, cloudtrail, etc.)
 */
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { getPool } = require('../db');

const REGION = process.env.AWS_REGION || 'us-east-1';
const sts = new STSClient({ region: REGION });

/**
 * Assume the HealthDashboardReadRole in a target account.
 * Returns temporary credentials { accessKeyId, secretAccessKey, sessionToken }.
 */
async function assumeRole(roleArn, sessionName = 'health-dashboard') {
  const res = await sts.send(new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: sessionName,
    DurationSeconds: 900,
  }));
  return {
    accessKeyId: res.Credentials.AccessKeyId,
    secretAccessKey: res.Credentials.SecretAccessKey,
    sessionToken: res.Credentials.SessionToken,
  };
}

/**
 * Get all enabled accounts from the database.
 */
async function getEnabledAccounts() {
  const pool = await getPool();
  const { rows } = await pool.query(
    'SELECT * FROM accounts WHERE enabled = true ORDER BY account_name'
  );
  return rows;
}

/**
 * Record sync start in sync_status table.
 * Returns the sync record ID.
 */
async function startSync(module, accountId) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `INSERT INTO sync_status (module, account_id, status, started_at)
     VALUES ($1, $2, 'running', NOW())
     RETURNING id`,
    [module, accountId]
  );
  return rows[0].id;
}

/**
 * Record sync completion (success).
 */
async function completeSync(syncId, recordsSynced) {
  const pool = await getPool();
  await pool.query(
    `UPDATE sync_status
     SET status = 'completed', records_synced = $1, completed_at = NOW()
     WHERE id = $2`,
    [recordsSynced, syncId]
  );
}

/**
 * Record sync failure.
 */
async function failSync(syncId, error) {
  const pool = await getPool();
  await pool.query(
    `UPDATE sync_status
     SET status = 'failed', error = $1, completed_at = NOW()
     WHERE id = $2`,
    [error, syncId]
  );
}

/**
 * Update last_synced_at on the account record.
 */
async function touchAccount(accountId) {
  const pool = await getPool();
  await pool.query(
    'UPDATE accounts SET last_synced_at = NOW() WHERE account_id = $1',
    [accountId]
  );
}

/**
 * Run a sync worker across all enabled accounts.
 * @param {string} moduleName - e.g. 'security-hub', 'cloudtrail'
 * @param {Function} workerFn - async (credentials, account, pool) => recordCount
 */
async function runSyncForAllAccounts(moduleName, workerFn) {
  const accounts = await getEnabledAccounts();
  const pool = await getPool();
  // Prune sync history older than 30 days to prevent unbounded growth
  await pool.query("DELETE FROM sync_status WHERE completed_at < NOW() - INTERVAL '30 days'").catch(() => {});
  const results = { total: 0, succeeded: 0, failed: 0, accounts: [] };

  for (const account of accounts) {
    const syncId = await startSync(moduleName, account.account_id);
    try {
      const roleArn = account.role_arn ||
        `arn:aws:iam::${account.account_id}:role/HealthDashboardReadRole`;

      console.log(`[${moduleName}] Syncing account ${account.account_id} (${account.account_name})`);
      const credentials = await assumeRole(roleArn, `${moduleName}-${account.account_id}`);
      const recordCount = await workerFn(credentials, account, pool);

      await completeSync(syncId, recordCount);
      await touchAccount(account.account_id);
      results.succeeded++;
      results.total += recordCount;
      results.accounts.push({ account_id: account.account_id, status: 'ok', records: recordCount });
      console.log(`[${moduleName}] Account ${account.account_id}: ${recordCount} records`);
    } catch (err) {
      await failSync(syncId, err.message);
      results.failed++;
      results.accounts.push({ account_id: account.account_id, status: 'error', error: err.message });
      console.error(`[${moduleName}] Account ${account.account_id} failed:`, err.message);
    }
  }

  console.log(`[${moduleName}] Sync complete: ${results.succeeded} ok, ${results.failed} failed, ${results.total} records`);
  return results;
}

module.exports = {
  assumeRole,
  getEnabledAccounts,
  startSync,
  completeSync,
  failSync,
  touchAccount,
  runSyncForAllAccounts,
  REGION,
};
