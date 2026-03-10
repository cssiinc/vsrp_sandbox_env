-- Amazon Inspector findings: container image and package vulnerabilities
CREATE TABLE IF NOT EXISTS inspector_findings (
  id              SERIAL PRIMARY KEY,
  account_id      VARCHAR(12) NOT NULL,
  finding_arn     TEXT NOT NULL UNIQUE,
  severity        VARCHAR(20),
  inspector_score REAL,
  title           TEXT,
  description     TEXT,
  type            VARCHAR(64),
  status          VARCHAR(20),
  resource_type   VARCHAR(64),
  resource_id     TEXT,
  repository      VARCHAR(256),
  image_hash      VARCHAR(128),
  image_tags      JSONB DEFAULT '[]'::jsonb,
  platform        VARCHAR(64),
  vuln_id         VARCHAR(64),
  package_name    VARCHAR(256),
  package_version VARCHAR(128),
  fixed_in        VARCHAR(128),
  package_manager VARCHAR(32),
  exploit_available BOOLEAN DEFAULT false,
  fix_available   BOOLEAN DEFAULT false,
  first_seen      TIMESTAMPTZ,
  last_seen       TIMESTAMPTZ,
  raw_json        JSONB,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insp_account ON inspector_findings (account_id);
CREATE INDEX IF NOT EXISTS idx_insp_severity ON inspector_findings (severity);
CREATE INDEX IF NOT EXISTS idx_insp_status ON inspector_findings (status);
CREATE INDEX IF NOT EXISTS idx_insp_repo ON inspector_findings (repository);
CREATE INDEX IF NOT EXISTS idx_insp_vuln ON inspector_findings (vuln_id);
CREATE INDEX IF NOT EXISTS idx_insp_package ON inspector_findings (package_name);
CREATE INDEX IF NOT EXISTS idx_insp_exploit ON inspector_findings (exploit_available);
CREATE INDEX IF NOT EXISTS idx_insp_last_seen ON inspector_findings (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_insp_score ON inspector_findings (inspector_score DESC);
