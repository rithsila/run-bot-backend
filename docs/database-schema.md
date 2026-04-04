# Database Schema

MongoDB with Mongoose ODM. All collections use timestamps (`createdAt`, `updatedAt`) unless noted.

---

## Collections Overview

| Collection                | Schema                 | Description                           |
| ------------------------- | ---------------------- | ------------------------------------- |
| `users`                   | User                   | Core user accounts                    |
| `emailverificationtokens` | EmailVerificationToken | Email verification tokens (TTL)       |
| `passwordresettokens`     | PasswordResetToken     | Password reset tokens (TTL)           |
| `products`                | Product                | Purchasable products/services         |
| `orders`                  | Order                  | Purchase orders                       |
| `plans`                   | Plan                   | Pricing plans displayed to users      |
| `memberships`             | Membership             | User membership records               |
| `membership_ip_blacklist` | MembershipIpBlacklist  | Blocked IPs for membership            |
| `referrals`               | Referral               | Referral links/codes                  |
| `subscriptions`           | Subscription           | Active user subscriptions             |
| `coupons`                 | Coupon                 | Discount coupon codes                 |
| `trading_plans`           | TradingPlan            | Published trading analysis            |
| `analyzenews`             | AnalyzeNews            | Market news analysis                  |
| `retailers`               | Retailer               | Retail sentiment data (no timestamps) |
| `trading_robots`          | TradingRobot           | Downloadable trading bots             |
| `indicators`              | Indicator              | TradingView indicator access requests |
| `web_push_subs`           | WebPushSub             | Browser push subscriptions            |

---

## Schema Details

### User

| Field               | Type     | Details                        |
| ------------------- | -------- | ------------------------------ |
| firstName           | String   | Required                       |
| lastName            | String   | Optional                       |
| email               | String   | Required, unique index         |
| emailCanonical      | String   | Normalized email, unique index |
| emailVerified       | Boolean  | Default false                  |
| photoURL            | String   | Profile image URL              |
| passwordHash        | String   | Argon2 hashed                  |
| signInMethod        | Enum     | `password`, `google`           |
| role                | Enum     | `Admin`, `Creator`, `User`     |
| lastActiveAt        | Date     |                                |
| lastLoginAt         | Date     |                                |
| failedLoginAttempts | Number   | Default 0                      |
| lockedUntil         | Date     | Account lock expiry            |
| passwordChangedAt   | Date     |                                |
| googleId            | String   | Sparse unique index            |
| isBanned            | Boolean  | Indexed                        |
| signupMeta          | Embedded | See below                      |

**SignupMeta (embedded):**
`deviceIdHash`, `ipHash`, `userAgent`, `referer`, `renderedAtMs`, `submittedAtMs`

**Indexes:** `email` (unique), `emailCanonical` (unique), `googleId` (sparse unique), `isBanned`

---

### EmailVerificationToken

| Field     | Type            | Details                 |
| --------- | --------------- | ----------------------- |
| userId    | ObjectId → User |                         |
| tokenHash | String          |                         |
| expiresAt | Date            | TTL index (auto-delete) |
| usedAt    | Date            |                         |
| issuedIp  | String          |                         |
| issuedUa  | String          |                         |

**Indexes:** TTL on `expiresAt`, `{ tokenHash, usedAt, expiresAt }`, `{ userId, usedAt, expiresAt }`

---

### PasswordResetToken

| Field     | Type            | Details   |
| --------- | --------------- | --------- |
| userId    | ObjectId → User |           |
| tokenHash | String          |           |
| expiresAt | Date            | TTL index |
| usedAt    | Date            |           |
| issuedIp  | String          |           |
| issuedUa  | String          |           |
| reason    | String          |           |

**Indexes:** TTL on `expiresAt`, `{ tokenHash, usedAt, expiresAt }`, `{ userId, usedAt, expiresAt }`

---

### Product

| Field                      | Type       | Details                        |
| -------------------------- | ---------- | ------------------------------ |
| name                       | String     |                                |
| description                | String     |                                |
| features                   | [String]   |                                |
| requireTradingViewUsername | Boolean    |                                |
| policy                     | String     |                                |
| requiresLicenseKey         | Boolean    |                                |
| payWayUrls                 | [Embedded] | `{ billPeriod, pricing, url }` |

---

### Order

| Field               | Type               | Details                                                               |
| ------------------- | ------------------ | --------------------------------------------------------------------- |
| user                | ObjectId → User    |                                                                       |
| product             | ObjectId → Product |                                                                       |
| status              | Enum               | `INIT`, `UNPAID`, `PAID`, `CANCELLED`, `FAILED`, `REFUNDED`           |
| idempotencyKey      | String             |                                                                       |
| orderId             | String             |                                                                       |
| billPeriod          | Enum               | `MONTH`, `THREE_MONTHS`, `SIX_MONTHS`, `YEAR`, `LIFETIME`, `ONE_TIME` |
| amount              | Number             |                                                                       |
| bankAccountName     | String             |                                                                       |
| tradingViewUsername | String             |                                                                       |
| orderedAt           | Date               |                                                                       |
| expiredAt           | Date               |                                                                       |
| updatedBy           | ObjectId → User    |                                                                       |

**Indexes:** `{ user, idempotencyKey }` unique, `{ user, product, orderedAt }`, partial unique `{ user, product }` where status in [INIT, UNPAID]

---

### Plan

| Field            | Type     | Details                  |
| ---------------- | -------- | ------------------------ |
| title            | String   | Text index               |
| description      | String   | Text index               |
| price            | Number   |                          |
| billingPeriod    | Number   |                          |
| paymentUrl       | String   |                          |
| discountUrl      | String   |                          |
| category         | Enum     | `Tools`, `Course`, `VPS` |
| product          | String   |                          |
| features         | [String] | Text index               |
| marketingTagline | String   |                          |
| allowCoupons     | Boolean  |                          |

**Indexes:** `{ category, price }`, text on `title`, `description`, `features`

---

### Membership

| Field         | Type                | Details                                    |
| ------------- | ------------------- | ------------------------------------------ |
| email         | String              | Unique                                     |
| user          | ObjectId → User     |                                            |
| status        | Enum                | `Request`, `Verified`, `Rejected`, `Ended` |
| notes         | String              |                                            |
| referral      | ObjectId → Referral |                                            |
| adminNotes    | String              |                                            |
| accounts      | [Embedded]          | `{ account, isVerified }`                  |
| licenseKey    | String              |                                            |
| xForwardedFor | String              |                                            |
| updatedBy     | ObjectId → User     |                                            |

**Indexes:** `email` (unique), `{ user, status }`, `{ referral }`

---

### MembershipIpBlacklist

| Field  | Type   | Details |
| ------ | ------ | ------- |
| ip     | String | Unique  |
| reason | String |         |

---

### Referral

| Field | Type            | Details |
| ----- | --------------- | ------- |
| owner | ObjectId → User |         |
| link  | String          | Unique  |
| code  | String          | Unique  |

---

### Subscription

| Field      | Type               | Details                                    |
| ---------- | ------------------ | ------------------------------------------ |
| user       | ObjectId → User    |                                            |
| product    | ObjectId → Product |                                            |
| status     | Enum               | `Pending`, `Active`, `Paused`, `Cancelled` |
| nextBill   | Date               |                                            |
| notes      | String             |                                            |
| billPeriod | String             |                                            |

**Indexes:** `{ user, product }` unique

---

### Coupon

| Field     | Type            | Details                                                 |
| --------- | --------------- | ------------------------------------------------------- |
| code      | String          | Unique                                                  |
| percent   | Number          |                                                         |
| status    | Enum            | `Request`, `Active`, `Inactive`, `Scheduled`, `Expired` |
| createdBy | ObjectId → User |                                                         |
| notes     | String          |                                                         |

---

### TradingPlan

| Field         | Type            | Details                                                                      |
| ------------- | --------------- | ---------------------------------------------------------------------------- |
| pair          | Enum            | BTC/USDT, ETH/USDT, EUR/USD, EUR/GBP, XAU/USD, XAG/USD, US30/USD, NAS100/USD |
| direction     | Enum            | `Bearish`, `Neutral`, `Bullish`                                              |
| description   | String          |                                                                              |
| publishedBy   | ObjectId → User |                                                                              |
| thumbnailUrl  | String          |                                                                              |
| tradingViewId | String          |                                                                              |

---

### AnalyzeNews

| Field        | Type   | Details                         |
| ------------ | ------ | ------------------------------- |
| title        | String |                                 |
| description  | String |                                 |
| pair         | Enum   | Same as TradingPlan pairs       |
| impact       | Enum   | `Bearish`, `Neutral`, `Bullish` |
| thumbnailUrl | String |                                 |

---

### Retailer (no timestamps)

| Field    | Type   | Details                  |
| -------- | ------ | ------------------------ |
| pair     | String |                          |
| avgLeft  | Number |                          |
| avgRight | Number |                          |
| signal   | String | `buy`, `sell`, `neutral` |
| runAt    | Date   |                          |

**Indexes:** `{ pair, runAt }` unique, `{ pair, runAt: -1 }`

---

### TradingRobot

| Field       | Type   | Details      |
| ----------- | ------ | ------------ |
| name        | String |              |
| description | String |              |
| version     | String |              |
| platform    | Enum   | `MT4`, `MT5` |
| fileSize    | Number |              |
| downloadUrl | String |              |

---

### Indicator

| Field      | Type            | Details                           |
| ---------- | --------------- | --------------------------------- |
| user       | ObjectId → User | Unique                            |
| username   | String          | TradingView username              |
| status     | Enum            | `Request`, `Verified`, `Rejected` |
| notes      | String          |                                   |
| adminNotes | String          |                                   |
| updatedBy  | ObjectId → User |                                   |

**Indexes:** `{ user, status }`, `{ user }` unique

---

### WebPushSub

| Field          | Type            | Details |
| -------------- | --------------- | ------- |
| userId         | ObjectId → User |         |
| endpoint       | String          |         |
| p256dh         | String          |         |
| auth           | String          |         |
| expirationTime | Number          |         |
| deviceId       | String          |         |
| userAgent      | String          |         |
| ipHint         | String          |         |
| active         | Boolean         |         |
| lastFailedAt   | Date            |         |

**Indexes:** `{ userId, endpoint }` unique

---

## Entity Relationship Diagram

```
User (central entity)
 ├── EmailVerificationToken.userId → User
 ├── PasswordResetToken.userId → User
 ├── Membership.user → User
 ├── Order.user → User
 ├── Referral.owner → User
 ├── Subscription.user → User
 ├── Coupon.createdBy → User
 ├── Indicator.user → User
 ├── TradingPlan.publishedBy → User
 ├── WebPushSub.userId → User
 ├── Order.updatedBy → User
 ├── Membership.updatedBy → User
 └── Indicator.updatedBy → User

Product
 ├── Order.product → Product
 └── Subscription.product → Product

Referral
 └── Membership.referral → Referral
```

---

## Enums Reference

| Enum               | Values                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Role               | `Admin`, `Creator`, `User`                                                                   |
| SignInMethod       | `password`, `google`                                                                         |
| PlanCategory       | `Tools`, `Course`, `VPS`                                                                     |
| PlanProducts       | `Indicator`, `ToolsBox`, `Course`, `VPS`                                                     |
| Pair               | `BTC/USDT`, `ETH/USDT`, `EUR/USD`, `EUR/GBP`, `XAU/USD`, `XAG/USD`, `US30/USD`, `NAS100/USD` |
| Direction          | `Bearish`, `Neutral`, `Bullish`                                                              |
| CouponStatus       | `Request`, `Active`, `Inactive`, `Scheduled`, `Expired`                                      |
| BillPeriod         | `MONTH`, `THREE_MONTHS`, `SIX_MONTHS`, `YEAR`, `LIFETIME`, `ONE_TIME`                        |
| MembershipStatus   | `Request`, `Verified`, `Rejected`, `Ended`                                                   |
| OrderStatus        | `INIT`, `UNPAID`, `PAID`, `CANCELLED`, `FAILED`, `REFUNDED`                                  |
| IndicatorStatus    | `Request`, `Verified`, `Rejected`                                                            |
| TradingPlatform    | `MT4`, `MT5`                                                                                 |
| SubscriptionStatus | `Pending`, `Active`, `Paused`, `Cancelled`                                                   |
