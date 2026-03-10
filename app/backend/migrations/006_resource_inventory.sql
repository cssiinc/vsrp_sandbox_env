-- Resource inventory from AWS Config per-account discovery
CREATE TABLE IF NOT EXISTS resource_inventory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        VARCHAR(12) NOT NULL,
  resource_type     VARCHAR(255) NOT NULL,
  resource_id       TEXT NOT NULL,
  resource_name     VARCHAR(512),
  resource_arn      TEXT,
  aws_region        VARCHAR(30) NOT NULL,
  configuration     JSONB,
  tags              JSONB,
  resource_status   VARCHAR(50),
  config_capture_time TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_id, resource_type, resource_id, aws_region)
);

CREATE INDEX IF NOT EXISTS idx_ri_account ON resource_inventory (account_id);
CREATE INDEX IF NOT EXISTS idx_ri_type ON resource_inventory (resource_type);
CREATE INDEX IF NOT EXISTS idx_ri_region ON resource_inventory (aws_region);
CREATE INDEX IF NOT EXISTS idx_ri_account_type ON resource_inventory (account_id, resource_type);
