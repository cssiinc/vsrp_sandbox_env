/**
 * IAM Credential Report sync worker — generates and parses the credential
 * report for each account, storing user-level credential hygiene data.
 *
 * Captures: MFA status, access key age/activity, password status,
 * certificate status, and last-used timestamps for every IAM user.
 */
const { IAMClient, GenerateCredentialReportCommand, GetCredentialReportCommand } = require('@aws-sdk/client-iam');
const { runSyncForAllAccounts } = require('./engine');

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 2000;

async function syncAccount(credentials, account, pool) {
  const client = new IAMClient({ region: 'us-east-1', credentials });

  // Generate the report — may take a few seconds
  let ready = false;
  for (let i = 0; i < MAX_RETRIES && !ready; i++) {
    const gen = await client.send(new GenerateCredentialReportCommand({}));
    if (gen.State === 'COMPLETE') {
      ready = true;
    } else {
      await sleep(RETRY_DELAY_MS);
    }
  }
  if (!ready) throw new Error('Credential report generation timed out');

  // Fetch the report (base64-encoded CSV)
  const report = await client.send(new GetCredentialReportCommand({}));
  const csv = Buffer.from(report.Content).toString('utf-8');
  const rows = parseCsv(csv);

  // Delete stale records for this account, then insert fresh
  await pool.query('DELETE FROM iam_credentials WHERE account_id = $1', [account.account_id]);

  let count = 0;
  for (const r of rows) {
    await pool.query(
      `INSERT INTO iam_credentials
         (account_id, iam_user, arn, user_creation_time, password_enabled,
          password_last_used, password_last_changed, password_next_rotation,
          mfa_active, access_key_1_active, access_key_1_last_rotated,
          access_key_1_last_used, access_key_1_last_used_region, access_key_1_last_used_service,
          access_key_2_active, access_key_2_last_rotated,
          access_key_2_last_used, access_key_2_last_used_region, access_key_2_last_used_service,
          cert_1_active, cert_1_last_rotated, cert_2_active, cert_2_last_rotated, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
       ON CONFLICT (account_id, arn) DO UPDATE SET
         iam_user = EXCLUDED.iam_user,
         user_creation_time = EXCLUDED.user_creation_time,
         password_enabled = EXCLUDED.password_enabled,
         password_last_used = EXCLUDED.password_last_used,
         password_last_changed = EXCLUDED.password_last_changed,
         password_next_rotation = EXCLUDED.password_next_rotation,
         mfa_active = EXCLUDED.mfa_active,
         access_key_1_active = EXCLUDED.access_key_1_active,
         access_key_1_last_rotated = EXCLUDED.access_key_1_last_rotated,
         access_key_1_last_used = EXCLUDED.access_key_1_last_used,
         access_key_1_last_used_region = EXCLUDED.access_key_1_last_used_region,
         access_key_1_last_used_service = EXCLUDED.access_key_1_last_used_service,
         access_key_2_active = EXCLUDED.access_key_2_active,
         access_key_2_last_rotated = EXCLUDED.access_key_2_last_rotated,
         access_key_2_last_used = EXCLUDED.access_key_2_last_used,
         access_key_2_last_used_region = EXCLUDED.access_key_2_last_used_region,
         access_key_2_last_used_service = EXCLUDED.access_key_2_last_used_service,
         cert_1_active = EXCLUDED.cert_1_active,
         cert_1_last_rotated = EXCLUDED.cert_1_last_rotated,
         cert_2_active = EXCLUDED.cert_2_active,
         cert_2_last_rotated = EXCLUDED.cert_2_last_rotated,
         synced_at = NOW()`,
      [
        account.account_id,
        r.user,
        r.arn,
        parseTs(r.user_creation_time),
        parseBool(r.password_enabled),
        parseTs(r.password_last_used),
        parseTs(r.password_last_changed),
        parseTs(r.password_next_rotation),
        parseBool(r.mfa_active),
        parseBool(r.access_key_1_active),
        parseTs(r.access_key_1_last_rotated),
        parseTs(r.access_key_1_last_used_date),
        parseStr(r.access_key_1_last_used_region),
        parseStr(r.access_key_1_last_used_service),
        parseBool(r.access_key_2_active),
        parseTs(r.access_key_2_last_rotated),
        parseTs(r.access_key_2_last_used_date),
        parseStr(r.access_key_2_last_used_region),
        parseStr(r.access_key_2_last_used_service),
        parseBool(r.cert_1_active),
        parseTs(r.cert_1_last_rotated),
        parseBool(r.cert_2_active),
        parseTs(r.cert_2_last_rotated),
      ]
    );
    count++;
  }

  return count;
}

/**
 * Parse CSV credential report into array of row objects.
 * AWS credential report uses comma-separated values with header row.
 */
function parseCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (vals[j] || '').trim();
    }
    rows.push(row);
  }
  return rows;
}

function parseBool(val) {
  if (!val || val === 'not_supported' || val === 'N/A') return false;
  return val.toLowerCase() === 'true';
}

function parseTs(val) {
  if (!val || val === 'N/A' || val === 'no_information' || val === 'not_supported') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseStr(val) {
  if (!val || val === 'N/A' || val === 'not_supported') return null;
  return val;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncAll() {
  return runSyncForAllAccounts('iam-credentials', syncAccount);
}

module.exports = { syncAll };
