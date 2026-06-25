# Padel Ecuador — Loyalty Web App · Agent Handoff

> Read this top to bottom before touching code. It captures the full state of the
> project, the architecture, what works, what's stubbed, and the exact next steps.

## 1. What this is

A mobile-first loyalty web app for **Padel Ecuador**, a padel club in Guayaquil,
Ecuador. It runs a points-to-rewards program backed by **Spoonity** (loyalty
platform). The app is a single self-contained HTML file that calls the Spoonity
Consumer API **directly from the browser** — no backend, no proxy. This is the
same pattern as the Buckhead Summer microsite, and it's what lets the whole thing
deploy to Firebase Hosting on the **free Spark plan** (no Cloud Functions = no Blaze).

- Audience: club members (consumers), Spanish-speaking.
- Tone: fun, gamified. Brand voice: *"Padel is the best therapy."*
- Brand assets: `brand/Padel_EC_BRAND.pdf`. Palette is PE blue `#1581C5`,
  PE yellow `#FFDE17`, near-black `#17181A`. Display font Fredoka, body Poppins,
  script accent Caveat. The racket-with-holes motif comes straight from the brand
  pattern and is reused as the headers' background and as the visits tracker.

## 2. Project layout

```
padel-ecuador-app/
├── app/
│   └── index.html              ← the entire web app (HTML+CSS+JS, one file)
├── firebase.json               ← static Hosting config (Spark plan, no functions)
├── .firebaserc                 ← Firebase project: padel-ecuador-d4842
├── docs-proxy-contract.md      ← Spoonity API reference (routes, payload shapes)
├── brand/
│   └── Padel_EC_BRAND.pdf       ← brand book
└── HANDOFF.md                  ← this file
```

> Historical note: an earlier version shipped a Node/Express proxy (`proxy/`) and a
> Firebase Cloud Function. That was removed — Spoonity allows browser CORS, so the
> proxy was unnecessary and it forced the Blaze plan. The app now calls the API
> directly, exactly like the Buckhead microsite. `docs-proxy-contract.md` is kept
> purely as a Spoonity endpoint/payload reference (ignore the "proxy" framing).

## 3. Architecture

```
Browser (app/index.html)  →  https://api.spoonity.com   (direct, no backend)
```

The browser calls `api.spoonity.com` directly — Spoonity permits browser CORS, so
no proxy is needed (verified against the live API; the Buckhead microsite ships the
same way). `vendor` is sent per-request from `CONFIG.VENDOR`; `session_key` is a
query param kept in `localStorage`. The single integration surface is `SpoonityAPI`
in `app/index.html`, pointed at `CONFIG.API_BASE = 'https://api.spoonity.com'`.

### Spoonity facts baked in
- Base: `https://api.spoonity.com` (Consumer API).
- Vendor: **2112777**. `language: 3` (Spanish). `contact_consent: 3` (email+SMS when T&C accepted).
- Auth: `POST /user/authenticate` returns `session_identifier`; it is passed as
  **query param** `?session_key=...` on every authenticated request (never a Bearer header).
- Registration returns no session → app calls `/user/authenticate` immediately after.
- `409` on register = email already exists. `PUT /user/profile` returns an empty 200 body.
- OTP for registration/reset is sent + validated by Spoonity via email automatically.

### The 4 currencies (programs) — ALL read from `/user/rewards/list`
| Currency | ID | Role in UI |
|---|---|---|
| Points | `10340` | Main program. `balance` = points. `data.spending_rules[].cost` groups the 3 tiers (500 / 1000 / 3000); each rule is a redeemable reward. |
| Welcome | `10341` | Special reward card on Home + Rewards, shown **only if `available > 0`** → confetti. |
| Birthday | `10342` | Special reward, shown **only if `available > 0`** → dedicated birthday animation (balloons + banner + gold confetti). |
| Visits | `10346` | Drives the racket: balls light up by `balance` toward `VISIT_GOAL` (12). |

Tiers are named **Saque** (500), **Volea** (1000), **Smash** (3000).

## 4. How the app code is organized (app/index.html)

All JS is in the final `<script>` block. Key pieces:

- `CONFIG` — toggles and IDs. **This is the only thing you flip to go live** (see §6).
- `SpoonityAPI` — single integration surface. Methods: `emailExists`, `register`,
  `authenticate`, `rewardsList`, `redeem`, `updateProfile`, `requestReset`.
  - When `CONFIG.DEMO_MODE === true`, every method returns mock payloads shaped
    **exactly** like the real endpoints (so the parser/UI are identical in both modes).
  - When `false`, methods `fetch()` against `CONFIG.API_BASE` (`https://api.spoonity.com`).
- `parseRewards(list)` — **the most likely thing you'll need to adjust.** Turns the
  `/user/rewards/list` response into the view model (points, tiers, visits,
  welcome/birthday availability). If real field names/nesting differ from the mock,
  fix them HERE; nothing else needs to change.
- `render()` / `renderSpecials()` / `renderRacket()` — DOM rendering.
- Redemption: `redeemPoints`, `redeemSpecial`, `openRedeemModal`. The redeem modal
  shows the **member QR** (`PADELEC|member|cedula`) — the same QR used to accumulate —
  plus the returned code as backup.
- Rewards per tier render as a horizontal **carousel** (scroll-snap) with dot indicators (`syncDots`).
- `fireBirthday()` — the special birthday animation.

### Screens / flow
Login → Register (4 steps: credentials → name+cédula → OTP → birthday) → App.
Also: forgot-password (email → OTP → new password). App tabs: Home, Premios (tiers
carousel), QR ("Sumar puntos" — member QR + Wallet CTA), VIP (informational), Cuenta
(edit email/password, FAQ, WhatsApp, logout).

### Validation
- Ecuadorian cédula validated with the real check-digit algorithm (`validCedula`).
- Email format, password ≥ 6, email match on register.

## 5. Current state — what works vs. stubbed

**Working (in DEMO_MODE):** full auth flow, registration, tiers/rewards carousel,
points counter, racket/visits, welcome + birthday specials with animations,
redemption modal with member QR, account edits, Wallet preview modal.
Demo creds: `demo@padelecuador.com` / `demo123`; OTP `123456`. Demo account has
1,250 pts, 7 visits, birthday reward active.

**Stubbed / not yet real:**
- **Live Spoonity calls** — wired (`DEMO_MODE:false`, direct to `api.spoonity.com`),
  but not yet validated against real responses with a member on vendor 2112777.
- **`parseRewards` against real payload** — verify field names/nesting (see §7).
- **Wallet** (`addToWallet`) — uses Spoonity's hosted passkit enroll link
  (`spoonity-passkit.onrender.com/enroll/{id}?v={vendor}`), so no backend needed.
  Verify the enrollment id/flow against a real account.
- **VIP** — informational page only; not wired to a currency (wasn't in scope of the 4 currencies).
- **Transactions/history** — removed; not available from `/user/rewards/list`. Add later if Spoonity exposes a transactions endpoint.

## 6. Going live & deploying (no Blaze)

The app is already wired for live, direct API calls (`CONFIG.DEMO_MODE: false`,
`CONFIG.API_BASE: 'https://api.spoonity.com'`). To flip back to the offline demo,
set `DEMO_MODE: true`. There is no proxy to run.

**Local test** (serve over http://, not file://, so fetch/CORS behave):
```bash
cd app && npx serve .     # or: python3 -m http.server 3000
```

**Deploy to Firebase Hosting (free Spark plan):**
```bash
firebase deploy --only hosting   # project padel-ecuador-d4842 (see .firebaserc)
```
`firebase.json` serves the `app/` dir as static files with security headers + a CSP
that pins `connect-src` to `https://api.spoonity.com`. No `functions` block, so
Firebase never asks you to upgrade to Blaze.

## 7. Immediate next steps (suggested order)

1. **Validate the real `/user/rewards/list` shape.** With a real test member, open
   DevTools → Network → `rewards/list` → Response. Compare to the mock in
   `SpoonityAPI._buildRewardsList` / the contract doc. Adjust `parseRewards()` only.
2. **Confirm redeem semantics.** Verify `POST /user/reward/redeem` body
   (`session_key, vendor, currency, spending_rule_id`) and the returned `code` field
   name. Adjust `SpoonityAPI.redeem` + `openRedeemModal` if needed.
3. **Watch the Network tab** while testing — confirm each call returns 200 and the
   payload matches the mock shape; adjust `parseRewards()` if field names differ.
4. **Verify Wallet enrollment** — confirm the `spoonity-passkit.onrender.com` enroll
   link works for a real member (it's a direct link, no backend to build).
5. **Deploy** — `firebase deploy --only hosting` (Spark plan). Security headers + CSP
   are already set in `firebase.json`.

## 8. Known gotchas (already handled, don't regress)
- `session_key` is a **query param**, never a header.
- User data is nested under `response.user.*` on authenticate.
- `PUT /user/profile` → empty 200 body; don't call `.json()` blindly (handled in `_safeJson`).
- `vendor` is sent per-request from `CONFIG.VENDOR` (integer in bodies, query param on GETs).
  `/user/reward/list` needs it explicitly — easy to forget since `/user/profile` doesn't.

## 9. Open questions for the client / product owner
- Real `spending_rules` IDs, names, costs, and `available` logic per currency on
  vendor 2112777 (the app currently mocks 15 rules: 5 per tier).
- Exact VIP mechanic (is there a VIP currency/tier in Spoonity, or is it a manual flag?).
- Wallet pass design fields (what to show on the pass).
- WhatsApp business number (placeholder `593999999999` in the Cuenta page).

---
*Built iteratively with the user (Jose, CRO @ Spoonity). The app reuses the same
registration/auth pattern (and the direct, proxy-free API approach) as the Buckhead
Summer Dine Around project. Demo mode is fully functional offline; production just
needs real Spoonity test credentials on vendor 2112777.*
