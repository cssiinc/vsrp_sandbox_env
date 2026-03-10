-- Log Explorer: CloudTrail S3 logs for lightweight SIEM
-- Stores parsed CloudTrail records from S3 log files
CREATE TABLE IF NOT EXISTS log_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      VARCHAR(12) NOT NULL,
  event_id        TEXT UNIQUE,              -- CloudTrail eventID for dedup
  event_time      TIMESTAMPTZ NOT NULL,
  event_name      VARCHAR(255) NOT NULL,
  event_source    VARCHAR(255) NOT NULL,
  aws_region      VARCHAR(30),
  event_type      VARCHAR(50),              -- AwsApiCall, AwsServiceEvent, AwsConsoleSignIn, etc.
  username        VARCHAR(255),
  user_type       VARCHAR(50),              -- Root, IAMUser, AssumedRole, AWSService, etc.
  source_ip       VARCHAR(45),
  user_agent      TEXT,
  request_params  JSONB,
  response_elements JSONB,
  resources       JSONB,
  error_code      VARCHAR(255),
  error_message   TEXT,
  read_only       BOOLEAN DEFAULT false,
  management_event BOOLEAN DEFAULT true,
  recipient_account VARCHAR(12),
  shared_event_id TEXT,
  vpc_endpoint_id VARCHAR(64),
  raw_event       JSONB,                    -- full original event for drill-down
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_account ON log_entries (account_id);
CREATE INDEX IF NOT EXISTS idx_log_event_time ON log_entries (event_time DESC);
CREATE INDEX IF NOT EXISTS idx_log_event_name ON log_entries (event_name);
CREATE INDEX IF NOT EXISTS idx_log_event_source ON log_entries (event_source);
CREATE INDEX IF NOT EXISTS idx_log_username ON log_entries (username);
CREATE INDEX IF NOT EXISTS idx_log_error_code ON log_entries (error_code);
CREATE INDEX IF NOT EXISTS idx_log_read_only ON log_entries (read_only);
CREATE INDEX IF NOT EXISTS idx_log_source_ip ON log_entries (source_ip);
CREATE INDEX IF NOT EXISTS idx_log_event_type ON log_entries (event_type);

-- GIN index for full-text search on request_params and raw_event
CREATE INDEX IF NOT EXISTS idx_log_raw_gin ON log_entries USING GIN (raw_event jsonb_path_ops);
