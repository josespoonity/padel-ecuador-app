# Padel Ecuador · Contrato del Proxy Spoonity

Guía para implementar el backend proxy (Claude Code). La web app ya está lista y
solo necesita que `CONFIG.DEMO_MODE = false` y `CONFIG.PROXY_BASE` apunte al proxy.

## Por qué un proxy (y no llamar a api.spoonity.com directo)

1. **CORS** — el navegador bloquea llamadas cross-origin a `api.spoonity.com`.
2. **Seguridad** — el `session_key` y el `vendor` no deben vivir expuestos en el cliente
   más de lo necesario; el proxy los mantiene del lado servidor cuando aplica.

> El MCP de Spoonity CX **no** cumple este rol: vive dentro de Claude, no es un
> servidor HTTP que la web app pueda invocar. El proxy es infraestructura propia
> (Vercel / Cloudflare Workers / endpoint en Spoonity).

```
Navegador (web app PE)  →  Proxy (mismo dominio, /api/spoonity/*)  →  https://api.spoonity.com
```

## Constantes

| Parámetro | Valor |
|---|---|
| Endpoint Spoonity | `https://api.spoonity.com` |
| Vendor | `2112777` |
| language | `3` (español) |
| contact_consent | `3` (email + SMS, si aceptan T&C) |
| Sesión | `?session_key=<KEY>` como **query param** en cada request autenticado |

## Monedas (programas)

| Moneda | ID | Uso en la app |
|---|---|---|
| Puntos | `10340` | Programa principal. `balance` = puntos. `data.spending_rules[].cost` agrupa los 3 tiers (500 / 1000 / 3000). Cada rule es un premio canjeable. |
| Bienvenida | `10341` | Premio especial. Visible en Home + Premios **solo si `available > 0`** → confetti. |
| Cumpleaños | `10342` | Premio especial. Visible **solo si `available > 0`** → animación de cumpleaños dedicada. |
| Visitas | `10346` | Llena las pelotitas de la raqueta según `balance` (meta = 12 visitas, ajustable en `CONFIG.VISIT_GOAL`). |

## Rutas que el proxy debe exponer

Todas devuelven JSON. El proxy reenvía a Spoonity añadiendo `vendor` y el `session_key` cuando aplica.

| Ruta proxy | Método | Reenvía a Spoonity | Notas |
|---|---|---|---|
| `/api/spoonity/user/email/exists` | GET | `GET /user/email/exists?email&vendor` | `{ exists: bool }` |
| `/api/spoonity/user/register` | POST | `POST /user/register` | Body abajo. No devuelve sesión. |
| `/api/spoonity/user/authenticate` | POST | `POST /user/authenticate` | Devuelve `{ session_identifier, user }`. |
| `/api/spoonity/user/rewards/list` | GET | `GET /user/rewards/list?session_key&vendor` | **Fuente única** de puntos, tiers, premios, especiales y visitas. |
| `/api/spoonity/user/reward/redeem` | POST | `POST /user/reward/redeem` | Body: `{ session_key, vendor, currency, spending_rule_id }`. |
| `/api/spoonity/user/profile` | PUT | `PUT /user/profile?session_key` | Cambiar email / contraseña. Responde 200 con **body vacío**. |
| `/api/spoonity/user/password/reset` | POST | `POST /user/password/reset` | Spoonity envía el OTP por email automáticamente. |

### Body de registro (lo que arma la app)

```json
{
  "first_name": "María José",
  "last_name": "Andrade Vera",
  "anonymous": false,
  "email_address": "maria@email.com",
  "password": "******",
  "terms": true,
  "vendor": 2112777,
  "language": 3,
  "cedula": "0912345678",
  "birthdate": 1234567890,
  "contact_consent": 3
}
```

Tras un registro exitoso (no trae sesión), la app llama de inmediato a
`/user/authenticate` para obtener el `session_identifier`. Un `409` = email ya existe.

## Forma esperada de `/user/rewards/list`

Un nodo **por moneda**. La app agrupa los `spending_rules` de la moneda 10340 por `cost`:

```json
[
  {
    "currency": { "id": 10340, "name": "Puntos" },
    "balance": 1250,
    "data": {
      "spending_rules": [
        { "id": 5001, "name": "Llavero Padel EC", "cost": 500,  "available": 1 },
        { "id": 5006, "name": "Gorra Padel EC",   "cost": 1000, "available": 1 },
        { "id": 5011, "name": "Clase de pádel 1:1","cost": 3000, "available": 1 }
      ]
    }
  },
  {
    "currency": { "id": 10341, "name": "Bienvenida" },
    "balance": 1, "available": 1,
    "data": { "spending_rules": [ { "id": 6001, "name": "Premio de Bienvenida", "cost": 0, "available": 1 } ] }
  },
  {
    "currency": { "id": 10342, "name": "Cumpleaños" },
    "balance": 0, "available": 0,
    "data": { "spending_rules": [ { "id": 6002, "name": "Regalo de Cumpleaños", "cost": 0, "available": 0 } ] }
  },
  {
    "currency": { "id": 10346, "name": "Visitas" },
    "balance": 7,
    "data": { "spending_rules": [] }
  }
]
```

El parser (`parseRewards` en la app) lee:
- `points` ← balance de 10340; `tiers` ← agrupación de `spending_rules` por `cost`.
- `welcomeAvailable` / `birthdayAvailable` ← `available` (o `balance`) de 10341 / 10342.
- `visits` ← balance de 10346.

> Si la forma real difiere (nombres de campos, anidación), solo se ajusta
> `parseRewards()` — el resto de la app no cambia.

## Para activar producción

En `padel-ecuador-loyalty.html`, bloque `CONFIG`:

```js
const CONFIG = {
  DEMO_MODE: false,                  // ← apaga los mocks
  PROXY_BASE: '/api/spoonity',       // ← tu proxy
  VENDOR: 2112777, LANGUAGE: 3, CONSENT_FULL: 3,
  CURRENCY: { POINTS:10340, WELCOME:10341, BIRTHDAY:10342, VISITS:10346 },
  VISIT_GOAL: 12
};
```

## Gotchas de Spoonity ya contemplados en la app

- `session_key` siempre como **query param**, nunca header `Authorization`.
- Datos de usuario anidados en `response.user.*`.
- `PUT /user/profile` responde **body vacío** (la app no intenta `.json()` en vacío).
- `vendor` es entero en algunos bodies; la app lo envía como número.
- OTP de registro/reset lo gestiona Spoonity por email automáticamente.
- En DEMO el OTP es `123456` y el login demo es `demo@padelecuador.com` / `demo123`.

## Wallet (pendiente backend)

El botón de Wallet hoy es demo. En producción el proxy genera el `.pkpass`
(Apple) o el link de Google Wallet con `member`, balances de monedas y el QR del
socio (vendor 2112777). Punto de enganche marcado en `addToWallet()`.
