-- Monitored AWS accounts for the health dashboard
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    VARCHAR(12) NOT NULL UNIQUE,
  account_name  VARCHAR(255) NOT NULL,
  role_arn      VARCHAR(2048),
  enabled       BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_account_id ON accounts (account_id);
