/**
 * CloudOps Console backend
 * - Health Dashboard: accounts, findings, changes, sync workers
 * - Public API proxy (legacy)
 */
const express = require('express');
const { logEvent } = require('./db');
const accountsRouter = require('./routes/accounts');
const syncRouter = require('./routes/sync');
const findingsRouter = require('./routes/findings');
const changesRouter = require('./routes/changes');
const inventoryRouter = require('./routes/inventory');
const costsRouter = require('./routes/costs');
const complianceRouter = require('./routes/compliance');
const healthEventsRouter = require('./routes/health-events');
const opsHealthRouter = require('./routes/ops-health');
const logExplorerRouter = require('./routes/log-explorer');
const iamCredentialsRouter = require('./routes/iam-credentials');
const guarddutyRouter = require('./routes/guardduty');
const trustedAdvisorRouter = require('./routes/trusted-advisor');
const inspectorRouter = require('./routes/inspector');
const ssoIdentityRouter = require('./routes/sso-identity');
const dashboardRouter = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;
const PROXY_TIMEOUT_MS = 5000;
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MIN, 10) * 60 * 1000 || 15 * 60 * 1000;

app.use(express.json());

// CloudOps routes
app.use('/api/accounts', accountsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/findings', findingsRouter);
app.use('/api/changes', changesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/costs', costsRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/health-events', healthEventsRouter);
app.use('/api/ops-health', opsHealthRouter);
app.use('/api/logs', logExplorerRouter);
app.use('/api/iam', iamCredentialsRouter);
app.use('/api/guardduty', guarddutyRouter);
app.use('/api/trusted-advisor', trustedAdvisorRouter);
app.use('/api/inspector', inspectorRouter);
app.use('/api/sso', ssoIdentityRouter);
app.use('/api/dashboard', dashboardRouter);

// ---------------------------------------------------------------------------
// Reusable proxy: fetches upstream URL with timeout, logs event, returns JSON
// ---------------------------------------------------------------------------
async function proxyRequest(url, endpoint, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const r = await fetch(url, { signal: controller.signal, ...options });
    const data = await r.json();
    await logEvent('api_call', null, { endpoint, status: r.status });
    return { data };
  } catch (err) {
    const message = err.name === 'AbortError' ? `Upstream timeout (${PROXY_TIMEOUT_MS}ms)` : err.message;
    await logEvent('api_call', null, { endpoint, error: message });
    return { error: message };
  } finally {
    clearTimeout(timeout);
  }
}

// Health check: no external calls, no DB
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'backend' });
});

// Proxy: Dog CEO API - random dog images
app.get('/api/dog', async (req, res) => {
  const result = await proxyRequest('https://dog.ceo/api/breeds/image/random', '/api/dog');
  result.error ? res.status(502).json({ error: result.error }) : res.json(result.data);
});

// Proxy: Bored API - random activity suggestion
app.get('/api/bored', async (req, res) => {
  const result = await proxyRequest('https://www.boredapi.com/api/activity', '/api/bored');
  result.error ? res.status(502).json({ error: result.error }) : res.json(result.data);
});

// Proxy: JokeAPI - programming jokes (no API key)
app.get('/api/joke', async (req, res) => {
  const result = await proxyRequest('https://v2.jokeapi.dev/joke/Programming?type=single', '/api/joke');
  result.error ? res.status(502).json({ error: result.error }) : res.json(result.data);
});

// Proxy: Chuck Norris API - random Chuck Norris jokes
app.get('/api/chuck', async (req, res) => {
  const result = await proxyRequest('https://api.chucknorris.io/jokes/random', '/api/chuck');
  result.error ? res.status(502).json({ error: result.error }) : res.json(result.data);
});

// Proxy: icanhazdadjoke - dad jokes (no API key)
app.get('/api/dadjoke', async (req, res) => {
  const result = await proxyRequest('https://icanhazdadjoke.com/', '/api/dadjoke', {
    headers: { Accept: 'application/json' },
  });
  result.error ? res.status(502).json({ error: result.error }) : res.json(result.data);
});

// Proxy: Studio Ghibli API - random film (no API key)
app.get('/api/ghibli', async (req, res) => {
  const result = await proxyRequest('https://ghibliapi.herokuapp.com/films', '/api/ghibli');
  if (result.error) return res.status(502).json({ error: result.error });
  const films = result.data;
  res.json(films[Math.floor(Math.random() * films.length)]);
});

// Proxy: Open-Meteo weather (no API key)
app.get('/api/weather', async (req, res) => {
  const lat = req.query.lat || '40.7128';
  const lon = req.query.lon || '-74.0060';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,weather_code`;
  const result = await proxyRequest(url, '/api/weather');
  result.error ? res.status(502).json({ error: result.error }) : res.json(result.data);
});

// List available APIs
app.get('/api', (req, res) => {
  res.json({
    apis: [
      { path: '/api/dog', description: 'Random dog image (Dog CEO API)' },
      { path: '/api/bored', description: 'Random activity (Bored API)' },
      { path: '/api/joke', description: 'Programming jokes (JokeAPI)' },
      { path: '/api/chuck', description: 'Chuck Norris jokes (chucknorris.io)' },
      { path: '/api/dadjoke', description: 'Dad jokes (icanhazdadjoke)' },
      { path: '/api/ghibli', description: 'Random Studio Ghibli film' },
      { path: '/api/weather', description: 'Weather forecast (Open-Meteo)', query: '?lat=&lon=' },
    ],
  });
});

app.listen(PORT, async () => {
  console.log(`Backend listening on port ${PORT}`);
  try {
    const { getPool } = require('./db');
    await getPool();
    console.log('RDS connection pool ready');
  } catch (err) {
    console.warn('RDS not ready (will retry on first request):', err.message);
  }

  // Background sync scheduler
  const securityHub = require('./sync/security-hub');
  const cloudtrail = require('./sync/cloudtrail');
  const resourceInventory = require('./sync/resource-inventory');
  const costExplorer = require('./sync/cost-explorer');
  const configCompliance = require('./sync/config-compliance');
  const healthEvents = require('./sync/health-events');
  const cloudtrailS3 = require('./sync/cloudtrail-s3');
  const iamCredentials = require('./sync/iam-credentials');
  const guardduty = require('./sync/guardduty');
  const trustedAdvisor = require('./sync/trusted-advisor');
  const inspector = require('./sync/inspector');
  const ssoIdentity = require('./sync/sso-identity');

  async function runScheduledSync() {
    console.log('[scheduler] Starting background sync...');
    try { await securityHub.syncAll(); } catch (err) { console.error('[scheduler] Security Hub sync error:', err.message); }
    try { await cloudtrail.syncAll(); } catch (err) { console.error('[scheduler] CloudTrail sync error:', err.message); }
    try { await resourceInventory.syncAll(); } catch (err) { console.error('[scheduler] Resource Inventory sync error:', err.message); }
    try { await costExplorer.syncAll(); } catch (err) { console.error('[scheduler] Cost Explorer sync error:', err.message); }
    try { await configCompliance.syncAll(); } catch (err) { console.error('[scheduler] Config Compliance sync error:', err.message); }
    try { await healthEvents.syncAll(); } catch (err) { console.error('[scheduler] Health Events sync error:', err.message); }
    try { await cloudtrailS3.syncAll(); } catch (err) { console.error('[scheduler] CloudTrail S3 sync error:', err.message); }
    try { await iamCredentials.syncAll(); } catch (err) { console.error('[scheduler] IAM Credentials sync error:', err.message); }
    try { await guardduty.syncAll(); } catch (err) { console.error('[scheduler] GuardDuty sync error:', err.message); }
    try { await trustedAdvisor.syncAll(); } catch (err) { console.error('[scheduler] Trusted Advisor sync error:', err.message); }
    try { await inspector.syncAll(); } catch (err) { console.error('[scheduler] Inspector sync error:', err.message); }
    try { await ssoIdentity.syncAll(); } catch (err) { console.error('[scheduler] SSO Identity sync error:', err.message); }
    console.log('[scheduler] Background sync complete');
  }

  // First sync after 30s startup delay, then every SYNC_INTERVAL_MS
  setTimeout(() => {
    runScheduledSync();
    setInterval(runScheduledSync, SYNC_INTERVAL_MS);
    console.log(`[scheduler] Sync scheduled every ${SYNC_INTERVAL_MS / 60000} minutes`);
  }, 30000);
});
