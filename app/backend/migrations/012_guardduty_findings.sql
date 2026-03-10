-- GuardDuty findings: threat detection across accounts
CREATE TABLE IF NOT EXISTS guardduty_findings (
  id              SERIAL PRIMARY KEY,
  account_id      VARCHAR(12) NOT NULL,
  finding_id      VARCHAR(256) NOT NULL UNIQUE,
  detector_id     VARCHAR(256),
  severity        REAL,
  severity_label  VARCHAR(20),
  title           TEXT,
  description     TEXT,
  type            VARCHAR(256),
  resource_type   VARCHAR(128),
  resource_id     TEXT,
  region          VARCHAR(64),
  first_seen      TIMESTAMPTZ,
  last_seen       TIMESTAMPTZ,
  count           INTEGER DEFAULT 1,
  archived        BOOLEAN DEFAULT false,
  raw_json        JSONB,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gd_account ON guardduty_findings (account_id);
CREATE INDEX IF NOT EXISTS idx_gd_severity ON guardduty_findings (severity DESC);
CREATE INDEX IF NOT EXISTS idx_gd_type ON guardduty_findings (type);
CREATE INDEX IF NOT EXISTS idx_gd_last_seen ON guardduty_findings (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_gd_archived ON guardduty_findings (archived);
CREATE INDEX IF NOT EXISTS idx_gd_resource_type ON guardduty_findings (resource_type);
