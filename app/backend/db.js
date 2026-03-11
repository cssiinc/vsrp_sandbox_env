/**
 * RDS PostgreSQL connection via Secrets Manager
 * Uses pg.Pool for connection pooling and automatic reconnection.
 * Fetches credentials at startup; used by index.js and run-migration.js
 */
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');

let pool = null;

async function getDbConfig() {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable is required');
  }

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  let secret;
  try {
    secret = JSON.parse(response.SecretString);
  } catch {
    throw new Error('DB_SECRET_ARN secret is not valid JSON');
  }

  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME,
    user: secret.username,
    password: secret.password,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

async function getPool() {
  if (pool) return pool;
  const config = await getDbConfig();
  pool = new Pool(config);
  pool.on('error', (err) => {
    console.error('Unexpected pool error:', err.message);
  });
  return pool;
}

async function logEvent(eventType, userId, details) {
  try {
    const p = await getPool();
    await p.query(
      'INSERT INTO app_events (event_type, user_id, details) VALUES ($1, $2, $3)',
      [eventType, userId || null, JSON.stringify(details || {})]
    );
  } catch (err) {
    console.error('Failed to log event:', err.message);
  }
}

module.exports = { getPool, getDbConfig, logEvent };
