# Project Structure

## Tech Stack

| Layer          | Technology                               |
| -------------- | ---------------------------------------- |
| Framework      | NestJS (Express)                         |
| Language       | TypeScript                               |
| Database       | MongoDB + Mongoose                       |
| Cache/Queue    | Redis + BullMQ                           |
| Auth           | JWT (RS256), Google OAuth, API Key, CSRF |
| Realtime       | Socket.IO + Redis Adapter                |
| Storage        | AWS S3                                   |
| Email          | Gmail SMTP (Nodemailer)                  |
| Push           | Web Push (VAPID)                         |
| Video          | Mux                                      |
| Bot Protection | Cloudflare Turnstile                     |
| Logging        | Pino                                     |
| Security       | Helmet, HPP, Argon2, JOSE                |

---

## Directory Layout

```
bhub-api/
├── src/
│   ├── main.ts                    # App bootstrap
│   ├── app.module.ts              # Root module (all imports, global guards)
│   ├── app.controller.ts          # Health check endpoint
│   │
│   ├── config/                    # Environment validation & files
│   │   ├── env.validation.ts      # Joi schema for all env vars
│   │   └── env-files.ts           # .env file resolution
│   │
│   ├── auth/                      # Authentication module
│   │   ├── auth.controller.ts     # signup, login, google, logout, password reset
│   │   ├── auth.service.ts        # JWT issuance, password verification, lockout
│   │   ├── auth.module.ts
│   │   ├── email-verification-token.schema.ts
│   │   ├── password-reset-token.schema.ts
│   │   ├── signin-method.enum.ts
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts    # RS256 JWT from header/cookie
│   │   │   └── google.strategy.ts # Google OAuth2
│   │   ├── guard/
│   │   │   ├── jwt-auth.guard.ts  # Global JWT guard
│   │   │   ├── roles.guard.ts     # Role-based access
│   │   │   ├── csrf.guard.ts      # Double-submit CSRF
│   │   │   ├── api-key.guard.ts.ts # API key validation
│   │   │   ├── hmac.guard.ts      # Internal HMAC signing
│   │   │   ├── device-hash-guard.ts # Device fingerprint
│   │   │   ├── public.decorator.ts
│   │   │   └── skip-csrf.decorator.ts
│   │   ├── decorators/
│   │   │   └── roles.decorator.ts
│   │   └── dto/                   # login, signup, verify, reset DTOs
│   │
│   ├── user/                      # User management
│   │   ├── user.controller.ts     # Admin: list, delete, password, role
│   │   ├── user.service.ts        # Email canonicalization, lockout, MX check
│   │   ├── user.module.ts
│   │   ├── user.schema.ts
│   │   ├── user.enum.ts
│   │   └── dto/
│   │
│   ├── products/                  # Product catalog
│   │   ├── products.controller.ts
│   │   ├── products.service.ts
│   │   ├── products.module.ts
│   │   ├── product.schema.ts
│   │   └── dto/
│   │
│   ├── order/                     # Order management
│   │   ├── order.controller.ts
│   │   ├── order.service.ts
│   │   ├── order.module.ts
│   │   ├── order.schema.ts
│   │   └── dto/
│   │
│   ├── plan/                      # Pricing plans
│   │   ├── plan.controller.ts
│   │   ├── plan.service.ts
│   │   ├── plan.module.ts
│   │   ├── plan.schema.ts
│   │   ├── plan.enum.ts
│   │   └── dto/
│   │
│   ├── memberships/               # Membership management
│   │   ├── memberships.controller.ts      # Standard membership endpoints
│   │   ├── kols-memberships.controller.ts # KOL partner endpoints (API key auth)
│   │   ├── memberships.service.ts
│   │   ├── kols-memberships.service.ts
│   │   ├── jose.service.ts               # License key generation (JOSE/ES256)
│   │   ├── memberships.module.ts
│   │   ├── memberships.schema.ts
│   │   ├── membership-ip-blacklist.schema.ts
│   │   └── dto/
│   │
│   ├── subscriptions/             # Subscription tracking
│   │   ├── subscriptions.controller.ts
│   │   ├── subscriptions.service.ts
│   │   ├── subscriptions.module.ts
│   │   ├── subscriptions.schema.ts
│   │   └── dto/
│   │
│   ├── coupons/                   # Coupon/discount system
│   │   ├── coupons.controller.ts
│   │   ├── coupons.service.ts
│   │   ├── coupons.module.ts
│   │   ├── coupon.schema.ts
│   │   └── dto/
│   │
│   ├── trading-plan/              # Trading analysis publishing
│   │   ├── trading-plan.controller.ts
│   │   ├── trading-plan.service.ts
│   │   ├── trading-plan.module.ts
│   │   ├── trading-plan.schema.ts
│   │   ├── trading-plan.enum.ts
│   │   └── dto/
│   │
│   ├── analyze-news/              # Market news analysis
│   │   ├── analyze-news.controller.ts
│   │   ├── analyze-news.service.ts
│   │   ├── analyze-news.module.ts
│   │   ├── analyze-news.schema.ts
│   │   └── dto/
│   │
│   ├── retailer/                  # Retail sentiment (FXSSI cron)
│   │   ├── retailer.controller.ts
│   │   ├── retailer.service.ts
│   │   ├── retailer.module.ts
│   │   └── retailer.schema.ts
│   │
│   ├── robots/                    # Trading robots/EAs
│   │   ├── trading.controller.ts
│   │   ├── trading.service.ts
│   │   ├── trading.module.ts
│   │   ├── trading-robot.schema.ts
│   │   └── dto/
│   │
│   ├── indicator/                 # TradingView indicator access
│   │   ├── indicator.controller.ts
│   │   ├── indicator.service.ts
│   │   ├── indicator.module.ts
│   │   ├── indicator.schema.ts
│   │   └── dto/
│   │
│   ├── real-time/                 # WebSocket gateway
│   │   ├── realtime.controller.ts
│   │   ├── realtime.gateway.ts    # Socket.IO events
│   │   └── realtime.module.ts
│   │
│   ├── queue/                     # BullMQ job processing
│   │   ├── queue.module.ts
│   │   ├── push.producer.ts       # Enqueue push jobs
│   │   └── push.worker.ts         # Process push notifications
│   │
│   ├── web-push-sub/              # Web Push subscriptions
│   │   ├── web-push-sub.controller.ts
│   │   ├── web-push-sub.service.ts
│   │   ├── web-push-sub.module.ts
│   │   ├── web-push-sub.schema.ts
│   │   └── dto/
│   │
│   ├── mail/                      # Email service
│   │   ├── mail.controller.ts
│   │   ├── mail.service.ts
│   │   └── mail.module.ts
│   │
│   ├── redis/                     # Redis client + utilities
│   │   ├── redis.module.ts
│   │   └── redis.service.ts       # set/get/del, distributed locks, signals
│   │
│   ├── storage/                   # AWS S3 file storage
│   │   ├── storage.module.ts
│   │   └── aws-s3.service.ts
│   │
│   ├── turnstile/                 # Cloudflare Turnstile bot protection
│   │   ├── turnstile.controller.ts
│   │   ├── turnstile.service.ts
│   │   └── turnstile.module.ts
│   │
│   ├── middleware/
│   │   └── required-headers.middleware.ts  # x-request-id, CSRF check
│   │
│   └── common/                    # Shared utilities
│       ├── auth/                  # Auth types
│       ├── cookies/               # Cookie helpers
│       ├── crypto/                # sha256Hex
│       ├── http/                  # HttpErrorFilter, response types
│       ├── risk/                  # IP subnet extraction
│       └── persist-image.service.ts # URL → S3 image upload
│
├── test/                          # E2E tests
├── package.json
├── tsconfig.json
├── nest-cli.json
└── eslint.config.mjs
```

---

## Module Dependency Graph

```
AppModule (root)
├── AuthModule
│   ├── UserModule
│   ├── MailModule
│   ├── QueueModule
│   └── TurnstileModule
├── UserModule
├── PlanModule
├── ProductsModule
├── OrderModule
│   ├── ProductsModule
│   ├── WebPushSubModule
│   └── QueueModule
├── MembershipsModule
│   ├── WebPushSubModule
│   └── ReferralsModule
├── SubscriptionsModule
│   └── ProductsModule
├── CouponsModule
│   ├── WebPushSubModule
│   └── QueueModule
├── TradingPlanModule
│   ├── WebPushSubModule
│   ├── RealtimeModule
│   └── QueueModule
├── AnalyzeNewsModule
│   ├── WebPushSubModule
│   ├── RealtimeModule
│   └── QueueModule
├── RetailerModule
│   ├── WebPushSubModule
│   └── QueueModule
├── TradingModule (robots)
├── IndicatorModule
├── ReferralsModule
├── RealtimeModule
├── QueueModule
├── WebPushSubModule
├── MailModule
├── RedisModule (global)
├── StorageModule (global)
└── TurnstileModule
```

---

## Global Guards (applied in order)

1. **ThrottlerGuard** - 10 requests/minute per IP+device hash (Redis storage)
2. **JwtAuthGuard** - JWT authentication (skips `@Public` routes)
3. **RolesGuard** - Role-based access (`@Roles(Admin)`, etc.)
4. **CsrfGuard** - CSRF double-submit for POST/PUT/PATCH/DELETE with cookies

---

## Request Lifecycle

```
Client Request
  → CORS check (allowed origins from FRONTEND_URL)
  → Global ThrottlerGuard (rate limit)
  → Body parsing (JSON 64KB, URL-encoded 16KB)
  → Content-Type validation (JSON or multipart)
  → RequiredHeadersMiddleware (x-request-id, CSRF)
  → Security headers (Helmet, HPP, Compression)
  → ValidationPipe (whitelist, transform, forbidNonWhitelisted)
  → JwtAuthGuard (authentication)
  → RolesGuard (authorization)
  → CsrfGuard (CSRF protection)
  → Route Handler
  → HttpErrorFilter (error formatting)
  → Response
```

---

## API Endpoints Summary

### Public (no auth)

- `GET /health` - Health check
- `POST /auth/signup` - Register (Turnstile protected)
- `POST /auth/login` - Login (Turnstile protected)
- `GET /auth/google` - Google OAuth start
- `GET /auth/google/callback` - Google OAuth callback
- `POST /auth/verify-email` - Verify email token
- `POST /auth/resend-verification` - Resend verification
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password
- `POST /memberships/activate` - Activate license key
- `POST /memberships/activate/free` - Activate free license
- `GET /trading/robots` - List trading robots
- `GET /retailer` - Get retail sentiment

### KOL Partners (API key auth)

- `GET /kols/memberships/user/:userId` - Get KOL membership
- `POST /kols/memberships/request` - Request KOL membership

### Authenticated User

- `GET /auth/me` - Current user profile
- `POST /auth/logout` - Logout
- `GET /plan` - List pricing plans
- `GET /products` - List products
- `GET /subscriptions/me` - My subscriptions
- `POST /orders` - Create order
- `POST /memberships/request` - Request membership
- `GET /memberships/me` - My membership
- `POST /coupons/request` - Request coupon
- `POST /coupons/apply` - Apply coupon
- `GET /trading-plan` - List trading plans
- `GET /analyze-news` - List market news
- `POST /indicator/request` - Request indicator access
- `POST /web-push-sub/subscribe` - Subscribe to push

### Admin Only

- `GET /user` - List all users
- `DELETE /user/:id` - Delete user
- `PATCH /user/:id/password` - Set user password
- `PATCH /user/:id/role` - Change user role
- `POST /plan` - Create plan
- `PATCH /plan/:id` - Update plan
- `DELETE /plan/:id` - Delete plan
- `POST /products` - Create product
- `PATCH /products/:id` - Update product
- `DELETE /products/:id` - Delete product
- `PATCH /orders/id/:id/status` - Update order status
- `GET /orders` - List all orders
- `PATCH /memberships/:id/admin` - Update membership
- `POST /memberships/:id/license` - Generate license key
- `PATCH /coupons/:id/status` - Update coupon status
- `GET /coupons` - List all coupons
- `PATCH /indicator/:id/admin` - Update indicator status
- `POST /referrals` - Create referral
- `PATCH /referrals/:id` - Update referral
- `DELETE /referrals/:id` - Delete referral

### Creator + Admin

- `POST /trading-plan` - Publish trading plan
- `PATCH /trading-plan/:id` - Update trading plan
- `DELETE /trading-plan/:id` - Delete trading plan
- `POST /analyze-news` - Publish news analysis
- `PATCH /analyze-news/:id` - Update news
- `DELETE /analyze-news/:id` - Delete news
- `POST /trading/robots` - Add trading robot
- `POST /trading/upload` - Upload robot file (25MB)
