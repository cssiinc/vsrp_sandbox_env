-- Tracks the status of data sync jobs per module per account
CREATE TABLE IF NOT EXISTS sync_status (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module        VARCHAR(50) NOT NULL,
  account_id    VARCHAR(12) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  records_synced INTEGER DEFAULT 0,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_status_module_account
  ON sync_status (module, account_id, created_at DESC);
