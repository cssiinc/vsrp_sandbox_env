-- Security findings from Security Hub, GuardDuty, IAM Access Analyzer
CREATE TABLE IF NOT EXISTS security_findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      VARCHAR(12) NOT NULL,
  source          VARCHAR(50) NOT NULL,   -- securityhub, guardduty, access-analyzer
  severity        VARCHAR(20) NOT NULL,   -- CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL
  title           TEXT NOT NULL,
  description     TEXT,
  resource_arn    TEXT,
  resource_type   VARCHAR(255),
  status          VARCHAR(30) DEFAULT 'ACTIVE',  -- ACTIVE, ARCHIVED, RESOLVED
  compliance_status VARCHAR(30),          -- PASSED, FAILED, WARNING, NOT_AVAILABLE
  finding_id      TEXT UNIQUE,            -- AWS-native finding ID for dedup
  first_seen      TIMESTAMPTZ,
  last_seen       TIMESTAMPTZ,
  raw_json        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_findings_account ON security_findings (account_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON security_findings (severity, status);
CREATE INDEX IF NOT EXISTS idx_findings_source ON security_findings (source);
CREATE INDEX IF NOT EXISTS idx_findings_last_seen ON security_findings (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_findings_finding_id ON security_findings (finding_id);
