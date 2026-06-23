# Padel Ecuador — Loyalty Web App · Agent Handoff

> Read this top to bottom before touching code. It captures the full state of the
> project, the architecture, what works, what's stubbed, and the exact next steps.

## 1. What this is

A mobile-first loyalty web app for **Padel Ecuador**, a padel club in Guayaquil,
Ecuador. It runs a points-to-rewards program backed by **Spoonity** (loyalty
platform). The app is a single self-contained HTML file; a small Node/Express
proxy connects it to the Spoonity Consumer API.

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
├── proxy/
│   ├── server.js               ← Express proxy → api.spoonity.com
│   ├── package.json            ← only dep is express; Node 18+ (native fetch)
│   ├── .env.example            ← copy to .env
│   ├── .gitignore
│   └── README.md               ← proxy run instructions
├── docs-proxy-contract.md      ← the API/proxy contract (routes, payload shapes)
├── brand/
│   └── Padel_EC_BRAND.pdf       ← brand book
└── HANDOFF.md                  ← this file
```

## 3. Architecture

```
Browser (app/index.html)  →  proxy (localhost:8787)  →  https://api.spoonity.com
```

The browser **cannot** call `api.spoonity.com` directly (CORS + token hygiene).
The proxy resolves CORS and injects `vendor` server-side. The Spoonity MCP
connector is NOT a substitute — it lives inside Claude, not as an HTTP server the
app can call.

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
  - When `false`, methods `fetch()` against `CONFIG.PROXY_BASE`.
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
- **Live Spoonity calls** — needs the proxy running + `DEMO_MODE:false` + real test
  account on vendor 2112777. Not yet validated against real responses.
- **`parseRewards` against real payload** — verify field names/nesting (see §7).
- **Wallet** (`addToWallet`) — demo only. Production needs the proxy to generate the
  Apple `.pkpass` / Google Wallet link. Hook point marked in the function.
- **VIP** — informational page only; not wired to a currency (wasn't in scope of the 4 currencies).
- **Transactions/history** — removed; not available from `/user/rewards/list`. Add later if Spoonity exposes a transactions endpoint.

## 6. Going live (the switch)

1. Run the proxy:
   ```bash
   cd proxy && cp .env.example .env && npm install && npm start
   # health check: curl http://localhost:8787/health
   ```
2. In `app/index.html`, `CONFIG` block:
   ```js
   DEMO_MODE: false,
   PROXY_BASE: 'http://localhost:8787/api/spoonity',
   ```
3. Serve the app over http:// (NOT file://):
   ```bash
   cd app && npx serve .     # or: python3 -m http.server 3000
   ```
4. Smoke test the wiring directly:
   ```bash
   curl "http://localhost:8787/api/spoonity/user/email/exists?email=test@example.com"
   ```

## 7. Immediate next steps (suggested order)

1. **Validate the real `/user/rewards/list` shape.** With a real test member, open
   DevTools → Network → `rewards/list` → Response. Compare to the mock in
   `SpoonityAPI._buildRewardsList` / the contract doc. Adjust `parseRewards()` only.
2. **Confirm redeem semantics.** Verify `POST /user/reward/redeem` body
   (`session_key, vendor, currency, spending_rule_id`) and the returned `code` field
   name. Adjust `SpoonityAPI.redeem` + `openRedeemModal` if needed.
3. **Add proxy request logging** while testing (status + response snippet per upstream call) — quick debugging aid.
4. **Wallet backend** — implement `.pkpass` / Google Wallet generation behind a new
   proxy route, then wire `addToWallet`.
5. **Harden for deploy** — move proxy behind HTTPS, set `ALLOWED_ORIGIN` to the real
   domain, keep `session_key` out of logs (consider httpOnly cookie).

## 8. Known gotchas (already handled, don't regress)
- `session_key` is a **query param**, never a header.
- User data is nested under `response.user.*` on authenticate.
- `PUT /user/profile` → empty 200 body; don't call `.json()` blindly (handled in `_safeJson`).
- `vendor` is an integer in some bodies; proxy sends it correctly per route.
- Node 18+ required for the proxy (native `fetch`). Tested on Node 22.

## 9. Open questions for the client / product owner
- Real `spending_rules` IDs, names, costs, and `available` logic per currency on
  vendor 2112777 (the app currently mocks 15 rules: 5 per tier).
- Exact VIP mechanic (is there a VIP currency/tier in Spoonity, or is it a manual flag?).
- Wallet pass design fields (what to show on the pass).
- WhatsApp business number (placeholder `593999999999` in the Cuenta page).

---
*Built iteratively with the user (Jose, CRO @ Spoonity). The app reuses the same
registration/auth pattern as the Buckhead Summer Dine Around project. Demo mode is
fully functional offline; production needs the proxy + real Spoonity test credentials.*
