# Project PRD (Product Requirements Document)

## Product Name

**bhub** - Trading-focused SaaS Platform

## Product Vision

bhub is a membership-based trading platform that provides tools, analysis, and automation for traders. It connects traders with expert analysis (KOLs), offers subscription-based access to premium tools, and provides automated trading solutions.

---

## Target Users

| Role              | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| **Trader (User)** | End users who subscribe to trading tools, view analysis, and use indicators |
| **Creator**       | KOLs/analysts who publish trading plans and market news                     |
| **Admin**         | Platform operators who manage users, memberships, products, and orders      |
| **KOL Partner**   | External partners who integrate via API key for membership management       |

---

## Core Features

### 1. Authentication & User Management

**What it does:**

- Email/password signup with email verification
- Google OAuth login
- JWT-based session (15 min access token via cookie)
- Account lockout after 5 failed login attempts (10 min)
- Password reset via email
- Bot protection via Cloudflare Turnstile
- Device fingerprinting for security

**User Roles:**

- `User` - Standard access
- `Creator` - Can publish trading plans and news
- `Admin` - Full platform management

---

### 2. Membership System

**What it does:**

- Users request membership with trading accounts
- Admin reviews and approves/rejects
- Approved members get license keys (JOSE/ES256 signed)
- License activation with account verification
- IP blacklist for abuse prevention
- Appeal process for rejected/ended memberships
- KOL partner integration for external membership requests

**Membership Flow:**

```
User requests → Admin reviews → Approved → License key issued → User activates
                              → Rejected → User can appeal
```

---

### 3. Product & Order System

**What it does:**

- Admin creates products with pricing tiers (monthly, quarterly, yearly, lifetime)
- Products can require TradingView username or license key
- Users create orders (with idempotency)
- Admin manages order status (INIT → UNPAID → PAID / CANCELLED / REFUNDED)
- Paid orders create/update subscriptions
- Billing period tracking with next-bill calculation

**Order Flow:**

```
User creates order → INIT → UNPAID → Admin confirms payment → PAID → Subscription created
                                    → CANCELLED / FAILED / REFUNDED
```

---

### 4. Subscription Management

**What it does:**

- Track active subscriptions per user per product
- Status tracking: Pending, Active, Paused, Cancelled
- Next billing date calculation
- Admin notes on subscriptions

---

### 5. Pricing Plans

**What it does:**

- Display pricing tiers to users
- Categories: Tools, Course, VPS
- Each plan has: title, price, billing period, payment URL, features
- Optional discount URLs and coupon support
- Marketing taglines for upselling

---

### 6. Coupon System

**What it does:**

- Members can request a coupon code
- Admin approves and sets discount percentage (0.01% - 100%)
- Users apply coupon codes for discounts
- Coupon lifecycle: Request → Active → Inactive/Expired
- Only verified members can request coupons

---

### 7. Trading Plans (Analysis)

**What it does:**

- Creators publish trading analysis for currency pairs
- Supported pairs: BTC/USDT, ETH/USDT, EUR/USD, EUR/GBP, XAU/USD, XAG/USD, US30/USD, NAS100/USD
- Direction: Bullish, Bearish, Neutral
- TradingView chart integration
- Real-time push notifications when new plans published
- Max 6 plans per creator (auto-cleanup)

---

### 8. Market News Analysis

**What it does:**

- Creators publish market news with impact assessment
- Thumbnail upload (file or URL → S3)
- Real-time notifications
- CRUD operations with pagination

---

### 9. Retail Sentiment (Retailer)

**What it does:**

- Automated cron job every 10 minutes
- Fetches retail trader sentiment from FXSSI
- Calculates buy/sell/neutral signals
- Push notifications on signal changes
- Public API (no auth required)

---

### 10. Trading Robots

**What it does:**

- Creators upload trading robots/EAs (MT4/MT5)
- Max 25MB file upload to S3
- Public download listing
- Version tracking

---

### 11. TradingView Indicator Access

**What it does:**

- Users request indicator access (must be verified member)
- Submit TradingView username
- Admin approves/rejects access
- One indicator request per user

---

### 12. Referral System

**What it does:**

- Admin creates referral links/codes
- Links associated with user owners
- Track which memberships came from referrals
- Paginated listing with search

---

### 13. Real-time Communication

**What it does:**

- Socket.IO WebSocket gateway
- Redis adapter for horizontal scaling
- Room-based messaging
- Events: content published badges, user notifications
- JWT authentication via handshake

---

### 14. Push Notifications

**What it does:**

- Web Push (VAPID) for browser notifications
- BullMQ queue for async processing
- Notify on: new trading plans, news, coupon updates, signal changes
- Per-device subscription management
- Concurrency limit (25 parallel sends)

---

### 15. File Storage

**What it does:**

- AWS S3 for all file uploads
- Trading robot files (25MB max)
- Thumbnails for news/trading plans (8MB max)
- URL-to-S3 image persistence (Google imgres proxy unwrapping)

---

## Security Requirements

| Feature          | Implementation                      |
| ---------------- | ----------------------------------- |
| Password hashing | Argon2                              |
| JWT signing      | RS256 (RSA key pair)                |
| License tokens   | JOSE ES256                          |
| CSRF protection  | Double-submit cookie pattern        |
| Rate limiting    | 10 req/min global, custom per route |
| Bot protection   | Cloudflare Turnstile                |
| Device tracking  | SHA256 device fingerprint           |
| Internal APIs    | HMAC signature verification         |
| Partner APIs     | API key authentication              |
| IP security      | Blacklist, subnet tracking          |
| Email security   | Disposable domain block, MX lookup  |
| Input validation | class-validator with whitelist      |

---

## Non-Functional Requirements

- **Response format:** Consistent `{ success, data, error, total? }` envelope
- **Pagination:** All list endpoints support page/limit via mongoose-paginate-v2
- **Logging:** Structured JSON (Pino) with request ID tracing
- **Error handling:** Production-safe error messages, detailed in dev
- **Scaling:** Redis-backed rate limiting, Socket.IO Redis adapter, BullMQ queues
- **Deployment:** Environment-based config, strict env validation on startup
