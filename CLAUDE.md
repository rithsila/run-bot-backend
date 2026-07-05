# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestJS backend API for "run-bot" — the slimmed remote-control telemetry and commands backend for MT5 Expert Advisors.

- **Database:** MongoDB with Mongoose ODM (`mongoose-paginate-v2` for pagination)
- **Cache/Queue:** Redis with BullMQ
- **Realtime:** Socket.IO with Redis adapter
- **Security:** JWT, API keys, Google OAuth, CSRF, HMAC, device fingerprinting

## Commands

```bash
pnpm install          # install dependencies
pnpm run dev          # development watch mode (alias for start:dev)
pnpm run build        # production build
pnpm run start:prod   # run production build

pnpm run test                         # unit tests
pnpm run test:watch                   # unit tests in watch mode
pnpm run test:cov                     # test coverage
pnpm run test:e2e                     # e2e tests
npx jest path/to/file.spec.ts         # run a single test file
npx jest --testNamePattern "my test"  # run tests matching a name

pnpm run lint    # lint and auto-fix
pnpm run format  # prettier format
```

## Architecture

### Bootstrap & Middleware Order (`src/main.ts`)

Middleware is applied in strict order — changing the order breaks things:

1. Body parsers (`/retailer` gets 1 MB limit; everything else 64 KB JSON / 16 KB URL-encoded). Both set `req.rawBody` for HMAC verification.
2. Content-Type enforcement — POST/PUT/PATCH must send `application/json` **except** `/trading/upload` and `/analyze-news` (multipart allowed)
3. `ValidationPipe` — `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`; error messages stripped in production
4. Helmet, HPP, compression, cookie-parser
5. `RequiredHeadersMiddleware` (`src/middleware/required-headers.middleware.ts`)

### Global Guards (`src/app.module.ts`)

Applied in order via `APP_GUARD`:
1. `ThrottlerGuard` — 10 req/min, keyed by `IP|sha256(device-id)`. Redis storage is **disabled in development** (`NODE_ENV !== 'development'`).
2. `JwtAuthGuard` — JWT auth; use `@Public()` decorator to opt out
3. `RolesGuard` — RBAC; use `@Roles()` decorator
4. `CsrfGuard` — CSRF for cookie-based auth; use `@SkipCsrf()` to opt out

### Module Map

| Module | Path | Notes |
|---|---|---|
| Auth | `src/auth/` | JWT (RS256/HS256/EdDSA), Google OAuth, email/password, API keys, device hash |
| User | `src/user/` | Profiles, roles (`src/user/user.enum.ts`), profile images |
| Memberships | `src/memberships/` | JOSE-token licenses, KOLs tier, referrals, IP blacklist |
| Subscriptions | `src/subscriptions/` | Subscription lifecycle |
| Orders | `src/order/` | Order processing |
| Products | `src/products/` | Product catalog |
| Coupons | `src/coupons/` | Discount codes |
| Trading Plans | `src/trading-plan/` | Plans with backtesting |
| Plan | `src/plan/` | Plan management |
| Trading Robots | `src/robots/trading/` | Automation; multipart upload via `/trading/upload` |
| Indicators | `src/indicator/` | Technical indicators |
| Analyze News | `src/analyze-news/` | News analysis (multipart allowed) |
| Realtime | `src/real-time/` | Socket.IO gateway, JWT handshake, Redis adapter |
| Queue | `src/queue/` | BullMQ workers; push notification producer |
| Web Push | `src/web-push-sub/` | VAPID push notification subscriptions |
| Mail | `src/mail/` | Nodemailer/Gmail SMTP |
| Storage | `src/storage/` | S3 file uploads |
| Retailer | `src/retailer/` | Retailer integration; raw body preserved for HMAC |
| Turnstile | `src/turnstile/` | Cloudflare Turnstile bot protection |
| Redis | `src/redis/` | Shared `REDIS` token (ioredis), consumed by throttler and Socket.IO |
| Console | `src/console/` | EA (Expert Advisor) remote control panel — see below |

### Console Module (`src/console/`)

Remote control panel for MT5 Expert Advisors connected via a Go bridge process.

**Architecture:** Browser ↔ run-bot-api (Socket.IO `/console`) ↔ Go bridge (ZMQ PUB/SUB)

**Key pieces:**
- `ConsoleGateway` — Socket.IO gateway at `/console` namespace; handles both browser clients and bridge connections. Dual-token auth: RS256 JWT (browsers) or JOSE membership token (bridge).
- `ConsoleService` — REST-facing business logic; validates settings keys against `ALLOWED_SETTINGS_KEYS` whitelist before forwarding.
- `ConsoleScheduler` — `@Cron('*/30 * * * * *')` enqueues `check-heartbeat` jobs every 30 s.
- `HealthCheckProcessor` — BullMQ worker; marks instances offline after 5 min without telemetry and sends web-push alerts.
- **BullMQ queue disabled in development** (`NODE_ENV === 'development'`); scheduler/processor are not registered.

**Socket.IO events:**

| Direction | Event | Purpose |
|---|---|---|
| Bridge → Server | `bridge:register` | Bridge announces itself with `agentId` |
| Bridge → Server | `console:telemetry` | Tick data; cached in Redis at `ea:state:<agentId>` (TTL 60 s) |
| Bridge → Server | `console:ack` | Confirms a command was received |
| Bridge → Server | `console:status` / `console:offline` | Online/offline updates |
| Browser → Server | `client:subscribe` | Browser joins `agent:<agentId>` room; receives cached hydration |
| Browser → Server | `client:unsubscribe` | Browser leaves room |
| Server → Bridge | `bridge:command` | Sends verb+value (e.g. `KILL_SWITCH`, `MASTER_ENABLE`, `SETTINGS`) |
| Server → Browser | `console:telemetry` / `console:status` / `console:ack` / `console:hydrate` | Fan-out to room |

**MongoDB collections:** `ea-instances`, `ea-settings`, `ea-audit-logs`

### Auth Guards in `src/auth/guard/`

- `jwt-auth.guard.ts` — global; `@Public()` bypasses it
- `roles.guard.ts` — global; `@Roles()` sets required roles
- `csrf.guard.ts` — global; `@SkipCsrf()` bypasses it
- `hmac.guard.ts` — route-level; verifies `x-internal-signature` + `x-internal-timestamp`
- `api-key.guard.ts.ts` — route-level; verifies `x-api-key` header against `API_KEY` env
- `device-hash-guard.ts` — route-level; device fingerprint check

### API Response Format

Success responses use `ApiSuccess<T>` (`src/common/types/api-response.type.ts`):

```typescript
interface ApiSuccess<T = undefined> {
  success: true;
  statusCode: number;
  code: string;
  message: string;
  timestamp: string;
  path: string;
  data?: T;
}

type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};
```

Errors go through `HttpErrorFilter` (`src/common/http/http-error.filter.ts`).

### Logging

Uses `nestjs-pino`. In development, `pino-pretty` is applied for human-readable output. Fields `authorization`, `cookie`, and `password` are redacted. `/health` and `OPTIONS` requests are excluded from access logs.

### Environment Variables

All variables are validated at startup via Joi (`src/config/env.validation.ts`). Missing required vars crash the process immediately.

Key variables:

```
NODE_ENV, PORT, FRONTEND_URL, COOKIE_DOMAIN
MONGO_URI, REDIS_URL
JWT_ISSUER, JWT_AUDIENCE, JWT_ACCESS_ALG (RS256|HS256|EdDSA)
JWT_ACCESS_PRIVATE_KEY_BASE64, JWT_ACCESS_PUBLIC_KEY_BASE64  # RS256/EdDSA
JWT_ACCESS_SECRET                                             # HS256
JWT_ACCESS_TTL, PW_RESET_TTL_MIN
MAIL_FROM_EMAIL, GMAIL_APP_PASSWORD
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME
INTERNAL_HMAC_SECRET
PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY, PUSH_VAPID_SUBJECT
CF_TURNSTILE_SECRET
ISSUER, TOKEN_TTL_DAYS, SIGNING_KID, SIGNING_PRIVATE_JWK, PUBLIC_JWKS
API_KEY
```

JWT keys must be **Base64-encoded PEM** strings. `SIGNING_PRIVATE_JWK` and `PUBLIC_JWKS` must be valid JSON strings.

Environment file resolution: `.env.${NODE_ENV}` → `.env`
