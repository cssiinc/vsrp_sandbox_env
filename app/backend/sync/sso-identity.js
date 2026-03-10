/**
 * IAM Identity Center (SSO) sync worker — pulls users, groups, and
 * group memberships from the org-wide Identity Store.
 *
 * Unlike other sync workers, this is NOT per-account. Identity Store
 * is org-wide, so we assume role into any enabled account and call
 * the Identity Store API once.
 *
 * Requires: identitystore:ListUsers, ListGroups, ListGroupMemberships
 * (included in ReadOnlyAccess managed policy).
 */
const {
  IdentitystoreClient,
  ListUsersCommand,
  ListGroupsCommand,
  ListGroupMembershipsCommand,
} = require('@aws-sdk/client-identitystore');
const { getPool } = require('../db');
const { assumeRole, getEnabledAccounts, startSync, completeSync, failSync } = require('./engine');

const IDENTITY_STORE_ID = process.env.IDENTITY_STORE_ID || 'd-9067e07388';

async function syncAll() {
  const pool = await getPool();
  const accounts = await getEnabledAccounts();
  if (accounts.length === 0) {
    console.log('[sso-identity] No enabled accounts — skipping');
    return { total: 0, succeeded: 0, failed: 0, accounts: [] };
  }

  // Use first account's credentials to access Identity Store
  const account = accounts[0];
  const syncId = await startSync('sso-identity', account.account_id);

  try {
    const roleArn = account.role_arn ||
      `arn:aws:iam::${account.account_id}:role/HealthDashboardReadRole`;
    const credentials = await assumeRole(roleArn, 'sso-identity');
    const client = new IdentitystoreClient({ region: 'us-east-1', credentials });

    let totalRecords = 0;

    // --- Sync Users ---
    const users = await fetchAllUsers(client);
    // Clear and reload
    await pool.query('DELETE FROM sso_users');
    for (const u of users) {
      const email = u.Emails?.find(e => e.Primary)?.Value || u.Emails?.[0]?.Value || null;
      await pool.query(
        `INSERT INTO sso_users
           (user_id, username, display_name, given_name, family_name, email,
            user_status, created_at_aws, updated_at_aws, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           username = EXCLUDED.username,
           display_name = EXCLUDED.display_name,
           given_name = EXCLUDED.given_name,
           family_name = EXCLUDED.family_name,
           email = EXCLUDED.email,
           user_status = EXCLUDED.user_status,
           updated_at_aws = EXCLUDED.updated_at_aws,
           synced_at = NOW()`,
        [
          u.UserId,
          u.UserName,
          u.DisplayName || null,
          u.Name?.GivenName || null,
          u.Name?.FamilyName || null,
          email,
          u.UserStatus || 'ENABLED',
          u.CreatedAt ? new Date(u.CreatedAt) : null,
          u.UpdatedAt ? new Date(u.UpdatedAt) : null,
        ]
      );
      totalRecords++;
    }
    console.log(`[sso-identity] Synced ${users.length} users`);

    // --- Sync Groups ---
    const groups = await fetchAllGroups(client);
    await pool.query('DELETE FROM sso_groups');
    for (const g of groups) {
      await pool.query(
        `INSERT INTO sso_groups
           (group_id, display_name, description, created_at_aws, synced_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (group_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           description = EXCLUDED.description,
           synced_at = NOW()`,
        [
          g.GroupId,
          g.DisplayName,
          g.Description || null,
          g.CreatedAt ? new Date(g.CreatedAt) : null,
        ]
      );
      totalRecords++;
    }
    console.log(`[sso-identity] Synced ${groups.length} groups`);

    // --- Sync Group Memberships ---
    await pool.query('DELETE FROM sso_group_members');
    for (const g of groups) {
      const members = await fetchGroupMembers(client, g.GroupId);
      for (const m of members) {
        if (m.MemberId?.UserId) {
          await pool.query(
            `INSERT INTO sso_group_members (group_id, user_id, synced_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (group_id, user_id) DO NOTHING`,
            [g.GroupId, m.MemberId.UserId]
          );
          totalRecords++;
        }
      }
    }
    console.log(`[sso-identity] Synced group memberships`);

    await completeSync(syncId, totalRecords);
    return { total: totalRecords, succeeded: 1, failed: 0, accounts: [{ account_id: account.account_id, status: 'ok', records: totalRecords }] };
  } catch (err) {
    await failSync(syncId, err.message);
    console.error('[sso-identity] Sync failed:', err.message);
    return { total: 0, succeeded: 0, failed: 1, accounts: [{ account_id: account.account_id, status: 'error', error: err.message }] };
  }
}

async function fetchAllUsers(client) {
  const users = [];
  let nextToken;
  do {
    const res = await client.send(new ListUsersCommand({
      IdentityStoreId: IDENTITY_STORE_ID,
      MaxResults: 100,
      NextToken: nextToken,
    }));
    users.push(...(res.Users || []));
    nextToken = res.NextToken;
  } while (nextToken);
  return users;
}

async function fetchAllGroups(client) {
  const groups = [];
  let nextToken;
  do {
    const res = await client.send(new ListGroupsCommand({
      IdentityStoreId: IDENTITY_STORE_ID,
      MaxResults: 100,
      NextToken: nextToken,
    }));
    groups.push(...(res.Groups || []));
    nextToken = res.NextToken;
  } while (nextToken);
  return groups;
}

async function fetchGroupMembers(client, groupId) {
  const members = [];
  let nextToken;
  do {
    const res = await client.send(new ListGroupMembershipsCommand({
      IdentityStoreId: IDENTITY_STORE_ID,
      GroupId: groupId,
      MaxResults: 100,
      NextToken: nextToken,
    }));
    members.push(...(res.GroupMemberships || []));
    nextToken = res.NextToken;
  } while (nextToken);
  return members;
}

module.exports = { syncAll };
