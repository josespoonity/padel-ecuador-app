/**
 * Padel Ecuador — Local Spoonity Proxy (standalone Node entry point)
 * -------------------------------------------------------------
 * Browser (web app)  ->  this proxy (localhost)  ->  api.spoonity.com
 *
 * Route logic lives in app.js (shared with the Firebase Functions entry point
 * in index.js) — this file only loads the local .env and starts the listener.
 *
 * Run:
 *   cp .env.example .env   (edit if needed)
 *   npm install
 *   npm start              (or: npm run dev  for auto-reload)
 *
 * Then in app/index.html set:
 *   CONFIG.DEMO_MODE = false
 *   CONFIG.PROXY_BASE = 'http://localhost:8787/api/spoonity'
 * -------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

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

const app = createApp(CONFIG);

app.listen(CONFIG.PORT, () => {
  console.log(`\n🎾  Padel Ecuador proxy escuchando en http://localhost:${CONFIG.PORT}`);
  console.log(`    → reenviando a ${CONFIG.BASE} (vendor ${CONFIG.VENDOR}, language ${CONFIG.LANGUAGE})`);
  console.log(`    En la app:  CONFIG.DEMO_MODE=false  ·  CONFIG.PROXY_BASE='http://localhost:${CONFIG.PORT}/api/spoonity'\n`);
});
