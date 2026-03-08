/**
 * Schema migration: runs 001_app_events.sql
 * Used by ECS init container; exits 0 on success
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function run() {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    console.error('DB_SECRET_ARN not set');
    process.exit(1);
  }

  const sm = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secret = JSON.parse(res.SecretString);

  const client = new Client({
    host: secret.host,
    port: secret.port || 5432,
    database: secret.dbname || secret.dbName,
    user: secret.username,
    password: secret.password,
    ssl: { rejectUnauthorized: true },
  });

  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', '001_app_events.sql'), 'utf8');
  await client.query(sql);
  await client.end();
  console.log('Migration complete');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
