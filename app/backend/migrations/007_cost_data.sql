-- Cost Explorer data: daily cost per account per service
CREATE TABLE IF NOT EXISTS cost_data (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    VARCHAR(12) NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  granularity   VARCHAR(10) NOT NULL DEFAULT 'DAILY',
  service       VARCHAR(255) NOT NULL,
  amount        NUMERIC(14,4) NOT NULL,
  unit          VARCHAR(10) DEFAULT 'USD',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_id, period_start, granularity, service)
);

CREATE TABLE IF NOT EXISTS cost_forecasts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     VARCHAR(12) NOT NULL,
  forecast_start DATE NOT NULL,
  forecast_end   DATE NOT NULL,
  mean_value     NUMERIC(14,4),
  unit           VARCHAR(10) DEFAULT 'USD',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_id, forecast_start, forecast_end)
);

CREATE INDEX IF NOT EXISTS idx_cost_account ON cost_data (account_id);
CREATE INDEX IF NOT EXISTS idx_cost_period ON cost_data (period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_cost_service ON cost_data (service);
CREATE INDEX IF NOT EXISTS idx_forecast_account ON cost_forecasts (account_id);
