/**
 * Padel Ecuador — Spoonity proxy (Express app factory)
 * -------------------------------------------------------------
 * Pure route definitions, no .listen() and no env-file loading here —
 * those live in the two entry points that use this:
 *   - server.js (local dev: `npm start`, plain Node)
 *   - index.js  (Firebase Cloud Functions deploy)
 * Keeping the routes in one place means both entry points stay in sync
 * automatically instead of drifting.
 * -------------------------------------------------------------
 */
import express from 'express';

export function createApp(CONFIG) {
  const app = express();
  app.use(express.json());

  /* ---------- Security headers ----------
     This server only ever returns JSON (never renders HTML), so there's nothing to
     clickjack here — still set the basics for defense in depth. */
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

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
  app.get('/api/spoonity/user/reward/list', async (req, res) => {
    try {
      const result = await callSpoonity('GET', '/user/reward/list', {
        query: { session_key: req.query.session_key, vendor: V, page: req.query.page, limit: req.query.limit },
      });
      relay(res, result);
    } catch (e) { fail(res, e); }
  });

  // 4b) Cedula exists (mirrors email/exists) ----------------------------------
  app.get('/api/spoonity/user/cedula/exists', async (req, res) => {
    try {
      const result = await callSpoonity('GET', '/user/cedula/exists', {
        query: { cedula: req.query.cedula, vendor: V },
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

  // 5b) Read profile -- GET /user/profile?session_key=... (no vendor param per spec)
  app.get('/api/spoonity/user/profile', async (req, res) => {
    try {
      const result = await callSpoonity('GET', '/user/profile', {
        query: { session_key: req.query.session_key },
      });
      relay(res, result);
    } catch (e) { fail(res, e); }
  });

  // 6) Update profile (email / password) -- returns empty 200 body -----------
  //    Force vendor server-side like every other route below — never trust a
  //    client-supplied vendor, or a caller could attempt to write into another
  //    vendor's account scope.
  app.put('/api/spoonity/user/profile', async (req, res) => {
    try {
      const result = await callSpoonity('PUT', '/user/profile', {
        query: { session_key: req.query.session_key || (req.body && req.body.session_key) },
        body: { ...(req.body || {}), vendor: V },
      });
      relay(res, result);
    } catch (e) { fail(res, e); }
  });

  // 7) Password reset request (Spoonity emails the token automatically) ------
  app.post('/api/spoonity/user/password-reset/reset', async (req, res) => {
    try {
      const b = req.body || {};
      const result = await callSpoonity('POST', '/user/password-reset/reset', {
        body: { email_address: b.email_address, vendor: CONFIG.VENDOR },
      });
      relay(res, result);
    } catch (e) { fail(res, e); }
  });

  // 7b) Password reset apply — the emailed token authorizes the password change,
  //     so no vendor/session is needed or accepted here.
  app.post('/api/spoonity/user/password-reset/apply', async (req, res) => {
    try {
      const b = req.body || {};
      const result = await callSpoonity('POST', '/user/password-reset/apply', {
        body: { token: b.token, password: b.password },
      });
      relay(res, result);
    } catch (e) { fail(res, e); }
  });

  // 8) Change password (requires current password + an active session) ------
  app.put('/api/spoonity/user/password', async (req, res) => {
    try {
      const b = req.body || {};
      const result = await callSpoonity('PUT', '/user/password', {
        query: { session_key: req.query.session_key },
        body: { current_password: b.current_password, password: b.password, vendor: CONFIG.VENDOR },
      });
      relay(res, result);
    } catch (e) { fail(res, e); }
  });

  // 9) Payment/QR token request -----------------------------------------------
  app.post('/api/spoonity/user/token/request', async (req, res) => {
    try {
      const b = req.body || {};
      const result = await callSpoonity('POST', '/user/token/request', {
        query: { session_key: req.query.session_key },
        body: { vendor: CONFIG.VENDOR, style: b.style || 'QR CODE', token_type: b.token_type != null ? b.token_type : 2 },
      });
      relay(res, result);
    } catch (e) { fail(res, e); }
  });

  // Wallet enrollment is handled client-side as a direct link to Spoonity's passkit
  // service (https://spoonity-passkit.onrender.com/enroll/{id}?v={vendor}) — not an
  // API call through this proxy. /user/wallet/apple and /user/wallet/google were
  // removed: confirmed against the real Spoonity API that neither route exists
  // ("No route found ... Method Not Allowed" for both GET and POST).

  // 12) Transaction history -----------------------------------------------------
  //     Vendor is forced from CONFIG, never trusted from the URL the client built,
  //     so a tampered request can't read another vendor's transaction data.
  app.get('/api/spoonity/vendor/:vendorId/customers/:userId/history', async (req, res) => {
    try {
      const result = await callSpoonity('GET', `/vendor/${CONFIG.VENDOR}/customers/${encodeURIComponent(req.params.userId)}/history`, {
        query: { session_key: req.query.session_key, page: req.query.page, limit: req.query.limit },
      });
      relay(res, result);
    } catch (e) { fail(res, e); }
  });

  /* ---------- Health check ---------- */
  app.get('/health', (_req, res) => res.json({ ok: true, vendor: CONFIG.VENDOR, base: CONFIG.BASE }));

  return app;
}
