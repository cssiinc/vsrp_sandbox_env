-- CloudTrail events for infrastructure change log
CREATE TABLE IF NOT EXISTS cloudtrail_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      VARCHAR(12) NOT NULL,
  event_id        TEXT UNIQUE,              -- CloudTrail event ID for dedup
  event_time      TIMESTAMPTZ NOT NULL,
  event_name      VARCHAR(255) NOT NULL,    -- e.g. CreateSecurityGroup, PutBucketPolicy
  event_source    VARCHAR(255) NOT NULL,    -- e.g. ec2.amazonaws.com, s3.amazonaws.com
  aws_region      VARCHAR(30),
  user_identity   JSONB,                    -- full user identity block
  username        VARCHAR(255),             -- extracted for easy querying
  source_ip       VARCHAR(45),
  user_agent      TEXT,
  resources       JSONB,                    -- resource ARNs and types
  request_params  JSONB,
  response_elements JSONB,
  error_code      VARCHAR(255),
  error_message   TEXT,
  read_only       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ct_account ON cloudtrail_events (account_id);
CREATE INDEX IF NOT EXISTS idx_ct_event_time ON cloudtrail_events (event_time DESC);
CREATE INDEX IF NOT EXISTS idx_ct_event_name ON cloudtrail_events (event_name);
CREATE INDEX IF NOT EXISTS idx_ct_event_source ON cloudtrail_events (event_source);
CREATE INDEX IF NOT EXISTS idx_ct_username ON cloudtrail_events (username);
CREATE INDEX IF NOT EXISTS idx_ct_event_id ON cloudtrail_events (event_id);
