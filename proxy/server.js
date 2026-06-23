/**
 * Padel Ecuador — Local Spoonity Proxy
 * -------------------------------------------------------------
 * Browser (web app)  ->  this proxy (localhost)  ->  api.spoonity.com
 *
 * Why a proxy:
 *   - Resolves CORS (the browser can't call api.spoonity.com cross-origin).
 *   - Keeps `vendor` injection and request shaping on the server.
 *   - Single place to handle Spoonity's quirks (empty PUT bodies, etc.).
 *
 * Run:
 *   cp .env.example .env   (edit if needed)
 *   npm install
 *   npm start              (or: npm run dev  for auto-reload)
 *
 * Then in padel-ecuador-loyalty.html set:
 *   CONFIG.DEMO_MODE = false
 *   CONFIG.PROXY_BASE = 'http://localhost:8787/api/spoonity'
 * -------------------------------------------------------------
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ---------- Minimal .env loader (no dependency) ---------- */
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
})();

const CONFIG = {
  PORT:         process.env.PORT || 8787,
  BASE:         process.env.SPOONITY_BASE || 'https://api.spoonity.com',
  VENDOR:       parseInt(process.env.VENDOR || '2112777', 10),
  LANGUAGE:     parseInt(process.env.LANGUAGE || '3', 10),
  CONSENT_FULL: parseInt(process.env.CONSENT_FULL || '3', 10),
  ORIGIN:       process.env.ALLOWED_ORIGIN || '*',
};

const app = express();
app.use(express.json());

/* ---------- CORS ---------- */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CONFIG.ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ---------- Helper: call Spoonity and normalize the response ---------- */
async function callSpoonity(method, pathname, { query = {}, body } = {}) {
  const url = new URL(CONFIG.BASE + pathname);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);

  const r = await fetch(url, init);
  // Some endpoints (e.g. PUT /user/profile) return empty 200 bodies.
  const text = await r.text();
  let data = {};
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  return { status: r.status, ok: r.ok, data };
}

function relay(res, result) {
  res.status(result.status).json(result.data);
}
function fail(res, err) {
  console.error('[proxy error]', err);
  res.status(502).json({ error: 'upstream_error', message: 'No se pudo contactar a Spoonity.' });
}

const V = String(CONFIG.VENDOR);

/* ============================================================
   ROUTES  (mounted under /api/spoonity)
   ============================================================ */

// 1) Email exists ----------------------------------------------------------
app.get('/api/spoonity/user/email/exists', async (req, res) => {
  try {
    const result = await callSpoonity('GET', '/user/email/exists', {
      query: { email: req.query.email, vendor: V },
    });
    relay(res, result);
  } catch (e) { fail(res, e); }
});

// 2) Register --------------------------------------------------------------
//    Forces vendor/language/consent server-side. Client sends profile fields.
app.post('/api/spoonity/user/register', async (req, res) => {
  try {
    const b = req.body || {};
    const body = {
      first_name:   b.first_name,
      last_name:    b.last_name,
      anonymous:    false,
      email_address:b.email_address,
      password:     b.password,
      terms:        true,
      vendor:       CONFIG.VENDOR,                 // integer
      language:     CONFIG.LANGUAGE,               // 3 = es
      cedula:       b.cedula,
      birthdate:    b.birthdate,                   // unix seconds (optional)
      contact_consent: b.contact_consent != null ? b.contact_consent : CONFIG.CONSENT_FULL,
    };
    const result = await callSpoonity('POST', '/user/register', { body });
    relay(res, result);
  } catch (e) { fail(res, e); }
});

// 3) Authenticate ----------------------------------------------------------
app.post('/api/spoonity/user/authenticate', async (req, res) => {
  try {
    const b = req.body || {};
    const result = await callSpoonity('POST', '/user/authenticate', {
      body: { email_address: b.email_address, password: b.password, vendor: V },
    });
    relay(res, result);
  } catch (e) { fail(res, e); }
});

// 4) Rewards list (the single source: points, tiers, specials, visits) -----
app.get('/api/spoonity/user/rewards/list', async (req, res) => {
  try {
    const result = await callSpoonity('GET', '/user/rewards/list', {
      query: { session_key: req.query.session_key, vendor: V },
    });
    relay(res, result);
  } catch (e) { fail(res, e); }
});

// 5) Redeem a reward -------------------------------------------------------
app.post('/api/spoonity/user/reward/redeem', async (req, res) => {
  try {
    const b = req.body || {};
    const result = await callSpoonity('POST', '/user/reward/redeem', {
      body: {
        session_key: b.session_key,
        vendor: CONFIG.VENDOR,
        currency: b.currency,
        spending_rule_id: b.spending_rule_id,
      },
    });
    relay(res, result);
  } catch (e) { fail(res, e); }
});

// 6) Update profile (email / password) -- returns empty 200 body -----------
app.put('/api/spoonity/user/profile', async (req, res) => {
  try {
    const result = await callSpoonity('PUT', '/user/profile', {
      query: { session_key: req.query.session_key || (req.body && req.body.session_key) },
      body: req.body || {},
    });
    relay(res, result);
  } catch (e) { fail(res, e); }
});

// 7) Password reset (Spoonity emails the OTP automatically) -----------------
app.post('/api/spoonity/user/password/reset', async (req, res) => {
  try {
    const b = req.body || {};
    const result = await callSpoonity('POST', '/user/password/reset', {
      body: { email_address: b.email_address, vendor: V },
    });
    relay(res, result);
  } catch (e) { fail(res, e); }
});

/* ---------- Health check ---------- */
app.get('/health', (_req, res) => res.json({ ok: true, vendor: CONFIG.VENDOR, base: CONFIG.BASE }));

app.listen(CONFIG.PORT, () => {
  console.log(`\n🎾  Padel Ecuador proxy escuchando en http://localhost:${CONFIG.PORT}`);
  console.log(`    → reenviando a ${CONFIG.BASE} (vendor ${CONFIG.VENDOR}, language ${CONFIG.LANGUAGE})`);
  console.log(`    En la app:  CONFIG.DEMO_MODE=false  ·  CONFIG.PROXY_BASE='http://localhost:${CONFIG.PORT}/api/spoonity'\n`);
});
