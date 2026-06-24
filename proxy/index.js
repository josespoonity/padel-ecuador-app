/**
 * Padel Ecuador — Spoonity Proxy (Firebase Cloud Functions entry point)
 * -------------------------------------------------------------
 * Deployed alongside Firebase Hosting; firebase.json rewrites
 * /api/spoonity/** and /health to this function, so the browser calls it
 * same-origin (no CORS) as e.g. https://padelecuador.spnty.co/api/spoonity/...
 *
 * Config comes from a `.env` file in this directory (functions v2 loads it
 * automatically) — NOT committed; see .env.example. Set real values with:
 *   firebase functions:secrets:set SPOONITY_BASE   (etc, for actual secrets)
 * or plain runtime env vars for non-secret config via .env.<PROJECT_ID>.
 * -------------------------------------------------------------
 */
import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './app.js';

const CONFIG = {
  BASE:         process.env.SPOONITY_BASE || 'https://api.spoonity.com',
  VENDOR:       parseInt(process.env.VENDOR || '2112777', 10),
  LANGUAGE:     parseInt(process.env.LANGUAGE || '3', 10),
  CONSENT_FULL: parseInt(process.env.CONSENT_FULL || '3', 10),
  // Once the production domain is final, set ALLOWED_ORIGIN to that exact
  // origin (e.g. https://padelecuador.spnty.co) instead of '*'.
  ORIGIN:       process.env.ALLOWED_ORIGIN || '*',
};

export const spoonityProxy = onRequest(
  { region: 'us-central1', cors: false }, // CORS is handled inside app.js itself
  createApp(CONFIG)
);
