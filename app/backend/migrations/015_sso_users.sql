-- IAM Identity Center (SSO) users, groups, and group memberships
CREATE TABLE IF NOT EXISTS sso_users (
  id              SERIAL PRIMARY KEY,
  user_id         VARCHAR(64) NOT NULL UNIQUE,
  username        VARCHAR(256) NOT NULL,
  display_name    VARCHAR(256),
  given_name      VARCHAR(128),
  family_name     VARCHAR(128),
  email           VARCHAR(256),
  user_status     VARCHAR(32),
  created_at_aws  TIMESTAMPTZ,
  updated_at_aws  TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sso_groups (
  id              SERIAL PRIMARY KEY,
  group_id        VARCHAR(64) NOT NULL UNIQUE,
  display_name    VARCHAR(256) NOT NULL,
  description     TEXT,
  created_at_aws  TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sso_group_members (
  id              SERIAL PRIMARY KEY,
  group_id        VARCHAR(64) NOT NULL,
  user_id         VARCHAR(64) NOT NULL,
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sso_users_status ON sso_users (user_status);
CREATE INDEX IF NOT EXISTS idx_sso_users_email ON sso_users (email);
CREATE INDEX IF NOT EXISTS idx_sso_gm_group ON sso_group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_sso_gm_user ON sso_group_members (user_id);
