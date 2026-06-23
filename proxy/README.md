# Padel Ecuador — Proxy local de Spoonity

Proxy mínimo en Node + Express que conecta la web app con el Consumer API de
Spoonity (`https://api.spoonity.com`), resolviendo CORS y manteniendo el
`vendor` del lado servidor.

```
Navegador (web app PE)  →  este proxy (localhost:8787)  →  api.spoonity.com
```

## Requisitos
- Node 18+ (probado en Node 22). `fetch` ya viene incluido, sin dependencias extra salvo Express.

## Instalación y arranque

```bash
cd padel-proxy
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

## Conectar la web app

En `padel-ecuador-loyalty.html`, en el bloque `CONFIG`:

```js
const CONFIG = {
  DEMO_MODE: false,                                       // ← apaga los mocks
  PROXY_BASE: 'http://localhost:8787/api/spoonity',       // ← este proxy
  VENDOR: 2112777, LANGUAGE: 3, CONSENT_FULL: 3,
  CURRENCY: { POINTS:10340, WELCOME:10341, BIRTHDAY:10342, VISITS:10346 },
  VISIT_GOAL: 12
};
```

> Sirve el HTML desde un servidor estático (no `file://`) para que el navegador
> haga las llamadas correctamente. Por ejemplo:
> ```bash
> npx serve .        # o:  python3 -m http.server 3000
> ```
> Si quieres restringir CORS, pon ese origin en `ALLOWED_ORIGIN` del `.env`.

## Rutas expuestas (bajo `/api/spoonity`)

| Ruta | Método | Reenvía a |
|---|---|---|
| `/user/email/exists` | GET | `GET /user/email/exists` |
| `/user/register` | POST | `POST /user/register` (inyecta vendor/language/consent) |
| `/user/authenticate` | POST | `POST /user/authenticate` |
| `/user/rewards/list` | GET | `GET /user/rewards/list` |
| `/user/reward/redeem` | POST | `POST /user/reward/redeem` |
| `/user/profile` | PUT | `PUT /user/profile` (body vacío en 200) |
| `/user/password/reset` | POST | `POST /user/password/reset` |
| `/health` | GET | diagnóstico local |

## Monedas (programas)

| Moneda | ID | Uso |
|---|---|---|
| Puntos | 10340 | balance + `data.spending_rules` (tiers 500/1000/3000) |
| Bienvenida | 10341 | premio especial, visible si `available > 0` |
| Cumpleaños | 10342 | premio especial, visible si `available > 0` (animación) |
| Visitas | 10346 | pelotitas de la raqueta (meta 12) |

## Notas de seguridad para producción
- Este proxy es para **desarrollo local**. En producción, despliégalo detrás de
  HTTPS (Vercel/Cloudflare Workers/contenedor) y fija `ALLOWED_ORIGIN` al dominio real.
- El `session_key` viaja como query param hacia Spoonity (así lo exige su API);
  evita registrarlo en logs. Considera moverlo a cookie httpOnly si manejas la
  sesión del lado servidor.
- No expongas `/health` con datos sensibles en producción.
