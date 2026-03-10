-- IAM Credential Report: user credential hygiene across accounts
CREATE TABLE IF NOT EXISTS iam_credentials (
  id            SERIAL PRIMARY KEY,
  account_id    VARCHAR(12) NOT NULL,
  iam_user      VARCHAR(256) NOT NULL,
  arn           TEXT,
  user_creation_time    TIMESTAMPTZ,
  password_enabled      BOOLEAN,
  password_last_used    TIMESTAMPTZ,
  password_last_changed TIMESTAMPTZ,
  password_next_rotation TIMESTAMPTZ,
  mfa_active            BOOLEAN DEFAULT false,
  access_key_1_active   BOOLEAN DEFAULT false,
  access_key_1_last_rotated TIMESTAMPTZ,
  access_key_1_last_used    TIMESTAMPTZ,
  access_key_1_last_used_region VARCHAR(64),
  access_key_1_last_used_service VARCHAR(128),
  access_key_2_active   BOOLEAN DEFAULT false,
  access_key_2_last_rotated TIMESTAMPTZ,
  access_key_2_last_used    TIMESTAMPTZ,
  access_key_2_last_used_region VARCHAR(64),
  access_key_2_last_used_service VARCHAR(128),
  cert_1_active  BOOLEAN DEFAULT false,
  cert_1_last_rotated TIMESTAMPTZ,
  cert_2_active  BOOLEAN DEFAULT false,
  cert_2_last_rotated TIMESTAMPTZ,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_id, arn)
);

CREATE INDEX IF NOT EXISTS idx_iam_cred_account ON iam_credentials (account_id);
CREATE INDEX IF NOT EXISTS idx_iam_cred_mfa ON iam_credentials (mfa_active);
CREATE INDEX IF NOT EXISTS idx_iam_cred_user ON iam_credentials (iam_user);
CREATE INDEX IF NOT EXISTS idx_iam_cred_ak1_active ON iam_credentials (access_key_1_active);
CREATE INDEX IF NOT EXISTS idx_iam_cred_ak2_active ON iam_credentials (access_key_2_active);
