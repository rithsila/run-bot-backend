# Security Audit Report — bhub-api

**Date:** 2026-03-21
**Auditor:** AI Security Engineer
**Scope:** Full codebase — application code, config, env, auth, integrations, dependencies

---

## Summary

| Severity | Count | Key Themes                                                                 |
| -------- | ----- | -------------------------------------------------------------------------- |
| Critical | 4     | Email verification disabled, timing-safe comparisons, useless device guard |
| High     | 6     | Token revocation gap, WebSocket auth bypass, SSRF, IP spoofing             |
| Medium   | 8     | Missing guards, JWT audience, CSRF binding, file validation                |
| Low      | 6     | Missing tests, incomplete blocklist, logging hygiene                       |

**Top 3 priorities:**

1. Re-enable email verification (C1)
2. Fix timing-safe comparisons in HMAC and API key guards (C2, C3)
3. Add JWT authentication to WebSocket gateway (H3, H4)

---

## CRITICAL

### C1. Email Verification Completely Disabled

**File:** `src/auth/auth.controller.ts:178-180`, `src/auth/auth.service.ts:282-317`

The `verifyEmail` handler body is empty (call commented out). The login-time email verification check is also commented out.

**Exploit:** Attacker signs up with `victim@company.com`, never verifies, gets full account access. Enables account squatting and impersonation.

**Impact:** Total loss of email ownership guarantee.

**How to fix:**

1. Uncomment `await this.auth.verifyEmail(dto.token)` in `auth.controller.ts:179`
2. Uncomment the email verification block in `auth.service.ts:282-317`
3. Uncomment the `verifyEmail` method in `auth.service.ts:412-437`

```typescript
// src/auth/auth.controller.ts — line 178
async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
  await this.auth.verifyEmail(dto.token); // ← uncomment this
}
```

```typescript
// src/auth/auth.service.ts — uncomment the verifyEmail method
async verifyEmail(rawToken: string): Promise<void> {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new BadRequestException('Invalid or expired token');
  }
  const tokenHash = sha256Hex(rawToken);
  const now = new Date();
  const rec = await this.verifyModel.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: false },
  );
  if (!rec) {
    throw new BadRequestException('Invalid or expired token');
  }
  await this.users.setEmailVerified(String(rec.userId), true);
}
```

3. Uncomment the login block that checks `emailVerified` (lines 282-317)

---

### C2. HMAC Signature Comparison is Not Timing-Safe

**File:** `src/auth/guard/hmac.guard.ts:33`

Uses `!==` for HMAC comparison. Vulnerable to timing attacks that leak the expected signature byte-by-byte.

**Impact:** Attacker can forge valid internal HMAC signatures and bypass service-to-service auth.

**How to fix:**

Replace line 33 in `hmac.guard.ts`:

```typescript
// BEFORE (vulnerable)
if (expect !== sig) throw new ForbiddenException('Bad signature');

// AFTER (safe)
const expectBuf = Buffer.from(expect, 'hex');
const sigBuf = Buffer.from(sig, 'hex');
if (
    expectBuf.length !== sigBuf.length ||
    !crypto.timingSafeEqual(expectBuf, sigBuf)
) {
    throw new ForbiddenException('Bad signature');
}
```

---

### C3. API Key Comparison is Not Timing-Safe + Single Shared Key

**File:** `src/auth/guard/api-key.guard.ts.ts:33`

Uses `!==` for API key comparison. Also, one `API_KEY` is shared across all KOL partners — if one leaks, all partner access is compromised.

**Impact:** Timing attack to extract the key. No individual partner revocation.

**How to fix (short-term):**

```typescript
// BEFORE
if (receivedKey.trim() !== validApiKey.trim()) {
    throw new UnauthorizedException('Invalid API key');
}

// AFTER
const a = Buffer.from(receivedKey.trim());
const b = Buffer.from(validApiKey.trim());
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new UnauthorizedException('Invalid API key');
}
```

Add `import * as crypto from 'crypto';` at top.

**How to fix (long-term):** Store per-partner API keys in the DB. Hash them with SHA-256. Look up by hash prefix, then timing-safe compare full hash.

---

### C4. DeviceHashGuard is Security Theater

**File:** `src/auth/guard/device-hash-guard.ts`

Both `x-device-id` and `x-device-hash` come from the client. The guard just verifies `sha256(clientId) === clientHash`. Any attacker computes the hash themselves and passes the guard.

**Impact:** Zero security value. Any endpoint relying on this guard is effectively unprotected.

**How to fix:**

Option A: Remove the guard entirely — it adds no security.

Option B: Redesign as a server-side device fingerprint:

- On first login, generate a server-side device token, store it in DB linked to user + device metadata
- On subsequent requests, verify the token against DB
- Require re-auth when device changes

---

## HIGH

### H1. Password Reset Token Validity Mismatch + Race Condition

**File:** `src/auth/auth.service.ts:45-46` vs `src/auth/auth.service.ts:490-492`

`RESET_TTL_MS` is 20 minutes, but `resetPassword()` uses a 2-hour `createdAt` filter. Also `findOneAndDelete` creates a race where two concurrent requests with the same token could both succeed.

**Impact:** Tokens valid 6x longer than intended. Double-use possible under concurrency.

**How to fix:**

```typescript
// BEFORE
const record = await this.pwResetModel.findOneAndDelete({
    tokenHash: hashed,
    createdAt: { $gte: new Date(Date.now() - 1000 * 60 * 60 * 2) },
});

// AFTER — atomic single-use via usedAt flag
const now = new Date();
const record = await this.pwResetModel.findOneAndUpdate(
    {
        tokenHash: hashed,
        usedAt: null,
        expiresAt: { $gt: now },
    },
    { $set: { usedAt: now } },
    { new: false },
);
```

---

### H2. No Token Revocation on Password Change / Ban / Role Change

**File:** `src/auth/strategies/jwt.strategy.ts:65-84`

`validate()` never checks `passwordChangedAt`, `isBanned`, or current role against DB. A stolen JWT stays valid for up to 15 minutes after the account is banned or password changed.

**Impact:** Cannot immediately lock out compromised accounts.

**How to fix:**

Add a lightweight DB check in `validate()`:

```typescript
async validate(payload: AccessJwtPayload): Promise<AuthUser> {
  if (!payload?.sub) throw new UnauthorizedException('Invalid token');
  if (payload.typ && payload.typ !== 'access') throw new UnauthorizedException('Invalid token type');
  if (!payload.role) throw new UnauthorizedException('Invalid token');

  // NEW: verify account state
  const user = await this.userService.findById(payload.sub);
  if (!user) throw new UnauthorizedException('User not found');
  if (user.isBanned) throw new UnauthorizedException('Account banned');

  // Reject token if password was changed after token was issued
  if (user.passwordChangedAt && payload.iat) {
    const changedAtSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
    if (changedAtSec > payload.iat) {
      throw new UnauthorizedException('Password changed, please login again');
    }
  }

  return {
    userId: payload.sub,
    email: payload.email,
    role: user.role,  // use current role from DB, not token
    perms: payload.perms ?? [],
  };
}
```

> **Performance note:** Cache user state in Redis (TTL 30-60s) to avoid a DB hit on every request.

---

### H3. WebSocket Gateway Has No Authentication

**File:** `src/real-time/realtime.gateway.ts:30-35`

`handleConnection` reads `client.handshake.auth?.userId` and trusts it without JWT verification. Any client can claim to be any user.

**Impact:** Full information disclosure of real-time notifications for any user.

**How to fix:**

```typescript
async handleConnection(client: Socket) {
  try {
    const token =
      client.handshake.auth?.token ??
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      client.disconnect(true);
      return;
    }

    // Verify JWT using the same key/algorithm as HTTP
    const payload = await this.jwtService.verifyAsync(token, {
      publicKey: fromB64EnvOrThrow('JWT_ACCESS_PUBLIC_KEY_BASE64'),
      algorithms: ['RS256'],
    });

    client.data.userId = payload.sub;
    client.join(`user:${payload.sub}`);
  } catch {
    client.disconnect(true);
  }
}
```

Inject `JwtService` into the gateway.

---

### H4. WebSocket Room Injection

**File:** `src/real-time/realtime.gateway.ts:49-53`

`join` event accepts any room name. Attacker joins `user:{victimId}` to eavesdrop.

**Impact:** Combined with H3, any user can receive another user's notifications.

**How to fix:**

```typescript
@SubscribeMessage('join')
onJoin(@ConnectedSocket() client: Socket, @MessageBody() dto: JoinRoomDto) {
  const userId = client.data.userId;

  // Block joining other users' rooms
  if (dto.room.startsWith('user:') && dto.room !== `user:${userId}`) {
    client.emit('error', { message: 'Cannot join another user room' });
    return;
  }

  client.join(dto.room);
  client.emit('joined', { room: dto.room });
}
```

---

### H5. SSRF via Server-Side URL Fetching

**File:** `src/storage/aws-s3.service.ts:153-154`, `src/common/persist-image.service.ts:39-82`

Both services fetch arbitrary user-supplied URLs server-side with no allowlist.

**Exploit:** `http://169.254.169.254/latest/meta-data/iam/security-credentials/` steals AWS IAM creds.

**Impact:** Cloud credential theft, internal service access, network scan.

**How to fix:**

Create a URL validation utility:

```typescript
// src/common/security/url-validator.ts
import { URL } from 'url';
import { lookup } from 'dns/promises';

const BLOCKED_CIDRS = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
    /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./, // link-local, CGNAT
];

export async function assertSafeUrl(raw: string): Promise<URL> {
    const url = new URL(raw);
    if (url.protocol !== 'https:') {
        throw new Error('Only HTTPS URLs allowed');
    }

    // Resolve hostname to IP and check against blocked ranges
    const { address } = await lookup(url.hostname);
    if (BLOCKED_CIDRS.some((rx) => rx.test(address))) {
        throw new Error('URL resolves to a private/internal address');
    }

    return url;
}
```

Call `assertSafeUrl(sourceUrl)` before every `fetch()` in both services.

---

### H6. `trust proxy` Enables IP Spoofing

**File:** `src/main.ts:23`

`app.set('trust proxy', 1)` trusts the first proxy hop. Without a guaranteed reverse proxy, clients can spoof `X-Forwarded-For`.

**Impact:** Rate limit bypass, IP blacklist evasion, log poisoning.

**How to fix:**

```typescript
// Only trust specific proxy IPs
app.set('trust proxy', ['loopback', '10.0.0.0/8']); // adjust to your infra
```

Or use environment variable:

```typescript
const trustedProxies = config.get<string>('TRUSTED_PROXIES') || 'loopback';
app.set('trust proxy', trustedProxies);
```

---

## MEDIUM

### M1. `forgotPassword` and `resetPassword` Missing TurnstileGuard

**File:** `src/auth/auth.controller.ts:259-276`, `src/auth/auth.controller.ts:278-286`

Both have `@TurnstileAction(...)` but no `@UseGuards(TurnstileGuard)`. The Turnstile token is never verified.

**Impact:** Bots can spam password reset emails. Brute-force reset tokens.

**How to fix:**

Add the guard decorator:

```typescript
@Public()
@TurnstileAction('forgot-password')
@UseGuards(TurnstileGuard)       // ← ADD THIS
@Post('forgot-password')
@HttpCode(HttpStatus.OK)
@Throttle({ default: { limit: 3, ttl: 60_000 } })
async forgotPassword(...) { ... }

@Public()
@TurnstileAction('reset-password')
@UseGuards(TurnstileGuard)       // ← ADD THIS
@SkipCsrf()
@Post('reset-password')
@HttpCode(HttpStatus.OK)
async resetPassword(...) { ... }
```

---

### M2. JWT `audience` Claim Never Used

**File:** `src/config/env.validation.ts:50`, `src/auth/auth.service.ts:507-531`, `src/auth/strategies/jwt.strategy.ts:50-62`

`JWT_AUDIENCE` is validated to exist but never passed to signing or verification.

**Impact:** Cross-service token confusion if the same key is shared.

**How to fix:**

In `auth.service.ts` `signAccessToken()`:

```typescript
const opts = {
    algorithm: this.JWT_ALG,
    expiresIn: this.ACCESS_TTL_SEC,
    issuer: this.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE, // ← ADD
};
```

In `jwt.strategy.ts`:

```typescript
const opts: StrategyOptions = {
    // ...existing options...
    audience: cfg.get<string>('JWT_AUDIENCE') || undefined, // ← ADD
};
```

---

### M3. Redis URL with Password Logged at Startup

**File:** `src/main.ts:123`

If `REDIS_URL` contains a password (e.g., `redis://:secret@host:6379`), it appears in logs.

**How to fix:**

```typescript
// BEFORE
logger.log(
    `✅ Redis connected: ${pong} (URL=${process.env.REDIS_URL || '...'})`,
);

// AFTER
const redisHost = (() => {
    try {
        return new URL(process.env.REDIS_URL || '').host;
    } catch {
        return 'unknown';
    }
})();
logger.log(`✅ Redis connected: ${pong} (host=${redisHost})`);
```

---

### M4. No File Type Validation for Robot Uploads

**File:** `src/robots/trading/trading.controller.ts:71-97`

Accepts any file type up to 25MB. No MIME type or extension check.

**Impact:** Malicious executables stored on S3 and served to users.

**How to fix:**

Add a file filter to the interceptor:

```typescript
@UseInterceptors(
  FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_ROBOT_FILE_BYTES },
    fileFilter: (_req, file, cb) => {
      const allowed = ['.ex4', '.ex5', '.mq4', '.mq5', '.zip'];
      const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (!ext || !allowed.includes(ext)) {
        return cb(new BadRequestException('Only MT4/MT5 robot files allowed'), false);
      }
      cb(null, true);
    },
  }),
)
```

---

### M5. User Controller Uses Wrong Property for Acting User

**File:** `src/user/user.controller.ts:49`

`req?.user?._id` should be `req?.user?.userId`. The JWT strategy sets `userId`, not `_id`. This makes the admin self-demotion check always fail.

**How to fix:**

```typescript
// BEFORE
actingUserId: req?.user?._id,
actingUserRole: req?.user?.role,

// AFTER
actingUserId: req?.user?.userId,
actingUserRole: req?.user?.role,
```

---

### M6. `emailVerified` Hardcoded to `false` in `/auth/me`

**File:** `src/auth/auth.controller.ts:159`

Always returns `emailVerified: false` regardless of actual status.

**How to fix:**

```typescript
// BEFORE
emailVerified: false,

// AFTER
emailVerified: user.emailVerified ?? false,
```

---

### M7. CSRF Cookie Uses `sameSite: 'none'` in Production

**File:** `src/common/cookies/cookie.util.ts:10`

`sameSite: 'none'` means CSRF cookies are sent on cross-origin requests, weakening double-submit protection.

**How to fix:**

```typescript
// BEFORE
sameSite: isProd ? "none" : "lax",

// AFTER — use 'lax' unless you truly need cross-origin cookie sending
sameSite: isProd ? "lax" : "lax",
```

If you need cross-origin cookies (e.g., API on different subdomain), keep `none` but bind the CSRF token to the JWT.

---

### M8. `enableImplicitConversion` in ValidationPipe

**File:** `src/main.ts:92`

`enableImplicitConversion: true` can cause unexpected type coercion (`"0"` → `0`, `"false"` → `false`).

**How to fix:**

Remove the flag and use explicit `@Type()` decorators on DTOs:

```typescript
// main.ts
transformOptions: { enableImplicitConversion: false },

// In DTOs that need number conversion:
import { Type } from 'class-transformer';

@Type(() => Number)
@IsNumber()
page?: number;
```

---

## LOW

### L1. No `.env.example` Template

No `.env.example` exists. Increases risk of misconfiguration.

**How to fix:** Create `/.env.example` listing all required variables without actual secrets:

```env
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000
MONGO_URI=mongodb://localhost:27017/bhub
REDIS_URL=redis://localhost:6379
JWT_ALG=RS256
JWT_ISSUER=https://your-domain.com
JWT_AUDIENCE=bhub-api
JWT_ACCESS_PRIVATE_KEY_BASE64=
JWT_ACCESS_PUBLIC_KEY_BASE64=
# ... etc
```

---

### L2. `console.warn`/`console.error` Used Instead of Logger

**Files:** `http-error.filter.ts:22,42`, `coupons.service.ts:126`, `retailer.service.ts:127`, others.

Bypasses Pino redaction and structured logging.

**How to fix:** Inject/instantiate `Logger` and replace all `console.*` calls:

```typescript
// BEFORE
console.warn('[AnalyzeNews.create] push enqueue failed:', e);

// AFTER
this.logger.warn(`push enqueue failed: ${(e as Error)?.message}`);
```

---

### L3. Disposable Email Blocklist is Incomplete

**File:** `src/user/user.service.ts:28-37`

Only 8 domains. Includes `mail.com` (legitimate). Thousands of disposable services exist.

**How to fix:**

```bash
pnpm add disposable-email-domains
```

```typescript
import disposable from 'disposable-email-domains';
const disposableSet = new Set(disposable);

private isDisposable(domain: string): boolean {
  return disposableSet.has(domain);
}
```

Remove `mail.com` from the hardcoded list.

---

### L4. Zero Test Coverage

No `.spec.ts` or `.e2e-spec.ts` files exist.

**How to fix:** Start with security-critical tests:

```bash
# Create test files for critical paths
touch src/auth/auth.service.spec.ts
touch src/auth/guard/csrf.guard.spec.ts
touch src/auth/guard/hmac.guard.spec.ts
touch test/auth.e2e-spec.ts
```

Priority tests:

- Login with wrong password triggers lockout
- Expired/used tokens are rejected
- Role guard blocks unauthorized access
- CSRF guard blocks mismatched tokens

---

### L5. Google Strategy Reads `process.env` Directly

**File:** `src/auth/strategies/google.strategy.ts:9-13`

Bypasses `ConfigService` and its validation.

**How to fix:**

```typescript
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(cfg: ConfigService) {
        super({
            clientID: cfg.get<string>('GOOGLE_CLIENT_ID'),
            clientSecret: cfg.get<string>('GOOGLE_CLIENT_SECRET'),
            callbackURL: cfg.get<string>('GOOGLE_CALLBACK_URL'),
            scope: ['profile', 'email'],
        });
    }
}
```

---

### L6. No Audit Trail for Admin Actions

Admin actions only log to Pino (lost on log rotation).

**How to fix:** Create an audit collection:

```typescript
// src/common/audit/audit.schema.ts
@Schema({ timestamps: true })
export class AuditLog {
    @Prop({ required: true }) action: string; // 'user.delete', 'role.change', etc.
    @Prop({ required: true }) actorId: string; // admin user ID
    @Prop() targetId?: string; // affected resource ID
    @Prop({ type: Object }) details?: Record<string, any>;
    @Prop() ip?: string;
}
```

---

## Fix Priority Order

| Order | ID  | Effort | Risk Reduction              |
| ----- | --- | ------ | --------------------------- |
| 1     | C2  | 5 min  | Prevents HMAC forgery       |
| 2     | C3  | 5 min  | Prevents API key extraction |
| 3     | C1  | 10 min | Restores email ownership    |
| 4     | H3  | 30 min | Secures WebSocket           |
| 5     | H4  | 10 min | Prevents room eavesdropping |
| 6     | M1  | 2 min  | Enables bot protection      |
| 7     | H1  | 10 min | Fixes reset token logic     |
| 8     | H5  | 30 min | Blocks SSRF                 |
| 9     | M5  | 1 min  | Fixes admin self-check      |
| 10    | M6  | 1 min  | Fixes verification display  |
| 11    | H2  | 45 min | Enables instant revocation  |
| 12    | H6  | 5 min  | Hardens IP trust            |
| 13    | M3  | 5 min  | Prevents credential leak    |
| 14    | C4  | 5 min  | Removes false security      |
| 15    | M2  | 5 min  | Prevents token confusion    |
| 16    | M4  | 10 min | Blocks malicious uploads    |
| 17    | M7  | 5 min  | Strengthens CSRF            |
| 18    | M8  | 20 min | Prevents type coercion      |
