-- AWS Config rule compliance status per account
CREATE TABLE IF NOT EXISTS config_compliance (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          VARCHAR(12) NOT NULL,
  config_rule_name    VARCHAR(255) NOT NULL,
  compliance_type     VARCHAR(30) NOT NULL,
  compliant_count     INTEGER DEFAULT 0,
  non_compliant_count INTEGER DEFAULT 0,
  aws_region          VARCHAR(30),
  rule_description    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_id, config_rule_name, aws_region)
);

CREATE TABLE IF NOT EXISTS config_compliance_details (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          VARCHAR(12) NOT NULL,
  config_rule_name    VARCHAR(255) NOT NULL,
  resource_type       VARCHAR(255),
  resource_id         TEXT,
  compliance_type     VARCHAR(30) NOT NULL,
  annotation          TEXT,
  ordering_timestamp  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_id, config_rule_name, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_account ON config_compliance (account_id);
CREATE INDEX IF NOT EXISTS idx_cc_compliance ON config_compliance (compliance_type);
CREATE INDEX IF NOT EXISTS idx_ccd_account ON config_compliance_details (account_id);
CREATE INDEX IF NOT EXISTS idx_ccd_rule ON config_compliance_details (config_rule_name);
