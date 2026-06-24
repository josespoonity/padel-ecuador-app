# Padel Ecuador — Proxy de Spoonity

Proxy en Node + Express que conecta la web app con el Consumer API de
Spoonity (`https://api.spoonity.com`), resolviendo CORS y manteniendo el
`vendor` del lado servidor. Las mismas rutas corren de dos formas, sin
duplicar código (ver `app.js`):

- **Local / desarrollo:** `server.js` levanta un servidor Node normal en `localhost:8787`.
- **Producción (Firebase):** `index.js` expone la misma app como Cloud Function,
  desplegada junto al sitio en Firebase Hosting (ver §Despliegue en Firebase).

```
Navegador  →  proxy (localhost:8787  ó  Cloud Function vía Hosting rewrite)  →  api.spoonity.com
```

## Estructura

| Archivo | Qué hace |
|---|---|
| `app.js` | Todas las rutas (la lógica real) — sin `.listen()`, sin carga de `.env`. |
| `server.js` | Entry point local: carga `.env`, arma `CONFIG`, llama `createApp(CONFIG).listen(...)`. |
| `index.js` | Entry point para Firebase Functions: arma `CONFIG` desde `process.env`, exporta `spoonityProxy`. |

## Desarrollo local

```bash
cd proxy
cp .env.example .env        # ajusta si hace falta
npm install
npm start                   # o: npm run dev  (auto-reload)
```

Verás:

```
🎾  Padel Ecuador proxy escuchando en http://localhost:8787
    → reenviando a https://api.spoonity.com (vendor 2112777, language 3)
```

Prueba rápida: `curl http://localhost:8787/health`

En `app/index.html`, en el bloque `CONFIG`:

```js
const CONFIG = {
  DEMO_MODE: false,
  PROXY_BASE: 'http://localhost:8787/api/spoonity',   // ← este proxy local
  VENDOR: 2112777, LANGUAGE: 3, CONSENT_FULL: 3, ...
};
```

> Sirve el HTML desde un servidor estático (no `file://`) para que el navegador
> haga las llamadas correctamente, ej. `npx serve app` o `python3 -m http.server 8123 -d app`.
> Si la CSP del HTML restringe `connect-src`, asegúrate de que incluya el origen del proxy.

## Despliegue en Firebase (producción)

Requiere el plan **Blaze** (pago por uso) — Cloud Functions necesita salir a
internet para llamar a `api.spoonity.com`, y eso no está permitido en el plan
gratuito Spark.

```bash
npm install -g firebase-tools     # o usa: npx firebase-tools <comando>
firebase login
# Edita .firebaserc en la raíz del repo: reemplaza el project ID placeholder
# por el ID real de tu proyecto Firebase (console.firebase.google.com).
firebase deploy
```

Esto despliega:
- **Hosting** — sirve `app/` como el sitio estático.
- **Function `spoonityProxy`** (`proxy/`, ver `firebase.json` → `functions.source`) —
  el Hosting rewrite manda `/api/spoonity/**` y `/health` a esta función, así el
  navegador llama todo **mismo origen** (sin problema de CORS).

Configura `proxy/.env` (no se commitea) con los valores reales antes de
desplegar — Functions v2 lo carga automáticamente. Una vez el dominio de
producción esté fijo, pon `ALLOWED_ORIGIN` a ese dominio exacto (no `*`).

En `app/index.html`, para producción:
```js
PROXY_BASE: '/api/spoonity',   // ruta relativa — mismo origen via el rewrite de Hosting
```

## Rutas expuestas (bajo `/api/spoonity`)

| Ruta | Método | Notas |
|---|---|---|
| `/user/email/exists` | GET | |
| `/user/cedula/exists` | GET | |
| `/user/register` | POST | inyecta vendor/language/consent server-side |
| `/user/authenticate` | POST | |
| `/user/profile` | GET | solo `session_key`, sin `vendor` (así lo exige la API real) |
| `/user/profile` | PUT | fuerza `vendor` server-side |
| `/user/password` | PUT | cambiar contraseña (requiere `current_password`) |
| `/user/password-reset/reset` | POST | Spoonity envía el token por email |
| `/user/password-reset/apply` | POST | solo `token` + `password`, sin vendor |
| `/user/reward/list` | GET | catálogo + balances (singular, no `rewards`) |
| `/user/reward/redeem` | POST | |
| `/user/token/request` | POST | token de pago/QR |
| `/vendor/:vendorId/customers/:userId/history` | GET | `:vendorId` se ignora — siempre se usa el `VENDOR` del servidor |
| `/health` | GET | diagnóstico |

> Apple/Google Wallet **no** pasan por este proxy — es un link fijo de enrollment
> (`https://spoonity-passkit.onrender.com/enroll/{id}?v={vendor}`) que el cliente
> abre directo; confirmado que `/user/wallet/apple` y `/user/wallet/google` no
> existen en la API real de Spoonity.

## Monedas (programas)

| Moneda | ID | Uso |
|---|---|---|
| Puntos | 10340 | balance + `data.spending_rules` (tiers 500/1000/3000) |
| Bienvenida | 10341 | premio especial, visible si `available > 0` |
| Cumpleaños | 10342 | premio especial, visible si `available > 0` (animación) |
| Visitas | 10346 | racha de visitas (raqueta) |

## Notas de seguridad para producción
- Fija `ALLOWED_ORIGIN` al dominio real una vez esté definido — hoy es `*` por defecto.
- Agrega rate limiting (ej. `express-rate-limit`) en `/user/authenticate`,
  `/user/email/exists`, `/user/cedula/exists` y `/user/password-reset/reset` —
  sin esto, cualquiera puede usar el proxy como relay para fuerza bruta o
  bombardeo de emails de reset.
- El `session_key` viaja como query param hacia Spoonity (así lo exige su API);
  evita registrarlo en logs.
- No expongas `/health` con datos sensibles en producción.
