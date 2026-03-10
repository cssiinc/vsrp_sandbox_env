-- Trusted Advisor checks and results across accounts
CREATE TABLE IF NOT EXISTS trusted_advisor_checks (
  id              SERIAL PRIMARY KEY,
  account_id      VARCHAR(12) NOT NULL,
  check_id        VARCHAR(64) NOT NULL,
  check_name      TEXT NOT NULL,
  category        VARCHAR(64),
  description     TEXT,
  status          VARCHAR(32),
  resources_flagged   INTEGER DEFAULT 0,
  resources_ignored   INTEGER DEFAULT 0,
  resources_suppressed INTEGER DEFAULT 0,
  resources_processed  INTEGER DEFAULT 0,
  estimated_savings    REAL DEFAULT 0,
  flagged_resources    JSONB DEFAULT '[]'::jsonb,
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_id, check_id)
);

CREATE INDEX IF NOT EXISTS idx_ta_account ON trusted_advisor_checks (account_id);
CREATE INDEX IF NOT EXISTS idx_ta_category ON trusted_advisor_checks (category);
CREATE INDEX IF NOT EXISTS idx_ta_status ON trusted_advisor_checks (status);
CREATE INDEX IF NOT EXISTS idx_ta_savings ON trusted_advisor_checks (estimated_savings DESC);
