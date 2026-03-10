/**
 * vsrp-sandbox backend: proxies public APIs, logs to RDS
 * Routes: /api/health, /api/dog, /api/bored, /api/joke, /api/chuck, /api/dadjoke, /api/ghibli, /api/weather
 * Public APIs from https://github.com/public-apis/public-apis
 */
const express = require('express');
const { logEvent } = require('./db');
const accountsRouter = require('./routes/accounts');

const app = express();
const PORT = process.env.PORT || 3000;
const PROXY_TIMEOUT_MS = 5000;

app.use(express.json());

// Health Dashboard routes
app.use('/api/accounts', accountsRouter);

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
});
