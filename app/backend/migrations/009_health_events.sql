-- AWS Health events (service disruptions, maintenance, account notifications)
CREATE TABLE IF NOT EXISTS health_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            VARCHAR(12) NOT NULL,
  event_arn             TEXT UNIQUE,
  event_type_code       VARCHAR(255) NOT NULL,
  event_type_category   VARCHAR(50) NOT NULL,
  service               VARCHAR(100) NOT NULL,
  aws_region            VARCHAR(30),
  status                VARCHAR(30) NOT NULL,
  start_time            TIMESTAMPTZ,
  end_time              TIMESTAMPTZ,
  last_updated          TIMESTAMPTZ,
  description           TEXT,
  affected_entities     JSONB,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_he_account ON health_events (account_id);
CREATE INDEX IF NOT EXISTS idx_he_service ON health_events (service);
CREATE INDEX IF NOT EXISTS idx_he_status ON health_events (status);
CREATE INDEX IF NOT EXISTS idx_he_category ON health_events (event_type_category);
CREATE INDEX IF NOT EXISTS idx_he_start ON health_events (start_time DESC);
