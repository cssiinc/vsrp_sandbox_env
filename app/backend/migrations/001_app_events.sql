-- vsrp-sandbox: app_events table for API call logging
-- Append-only; minimal schema per README
CREATE TABLE IF NOT EXISTS app_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  event_type VARCHAR(50),
  user_id    VARCHAR(255),
  details    JSONB
);
