# AGENTS.md

This file provides essential information for AI coding agents working on this codebase.

## Project Overview

**bhub-backend-v2** is a NestJS-based REST API and WebSocket server for a trading-focused SaaS platform. The platform provides membership management, trading tools, authentication, and real-time market data features.

### Key Characteristics

- **Framework:** NestJS 11.x with Express
- **Language:** TypeScript 5.7+
- **Database:** MongoDB with Mongoose ODM
- **Cache/Queue:** Redis with BullMQ
- **Real-time:** Socket.IO with Redis adapter
- **Package Manager:** pnpm

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | NestJS (Express platform) |
| Language | TypeScript (ES2023 target) |
| Database | MongoDB + Mongoose |
| Cache/Queue | Redis + BullMQ |
| Authentication | JWT (RS256), Google OAuth, API Key, CSRF |
| Realtime | Socket.IO + Redis Adapter |
| File Storage | AWS S3 |
| Email | Gmail SMTP (Nodemailer) |
| Push Notifications | Web Push (VAPID) |
| Video | Mux |
| Bot Protection | Cloudflare Turnstile |
| Logging | Pino |
| Security | Helmet, HPP, Argon2, JOSE |

## Build and Development Commands

```bash
# Install dependencies
pnpm install

# Development (watch mode)
pnpm run dev
# or
pnpm run start:dev

# Production build
pnpm run build

# Production run
pnpm run start:prod

# Lint and auto-fix
pnpm run lint

# Format code
pnpm run format
```

## Testing Commands

```bash
# Unit tests
pnpm run test

# Watch mode for tests
pnpm run test:watch

# Test coverage
pnpm run test:cov

# Debug tests
pnpm run test:debug

# E2E tests
pnpm run test:e2e
```

**Note:** The project currently has no unit test files (`.spec.ts`) in the `src/` directory. E2E tests should be placed in the `test/` directory with `.e2e-spec.ts` suffix.

## Project Structure

```
src/
├── main.ts                    # Application bootstrap
├── app.module.ts              # Root module with global guards
├── app.controller.ts          # Health check endpoint
│
├── config/                    # Environment configuration
│   ├── env.validation.ts      # Joi schema for env var validation
│   └── env-files.ts           # .env file resolution logic
│
├── auth/                      # Authentication module
│   ├── auth.controller.ts     # signup, login, google OAuth, logout
│   ├── auth.service.ts        # JWT issuance, password handling
│   ├── strategies/            # JWT and Google strategies
│   ├── guard/                 # JWT, CSRF, Roles, API key guards
│   ├── dto/                   # Request validation DTOs
│   └── *.schema.ts            # Token schemas
│
├── user/                      # User management
├── products/                  # Product catalog
├── order/                     # Order/purchase management
├── plan/                      # Pricing plans
├── memberships/               # Membership licensing system
├── subscriptions/             # Subscription tracking
├── coupons/                   # Discount coupon system
├── trading-plan/              # Trading analysis publishing
├── analyze-news/              # Market news analysis
├── retailer/                  # Retail sentiment data
├── robots/trading/            # Trading robots/EAs
├── indicator/                 # TradingView indicator access
├── real-time/                 # WebSocket gateway
├── queue/                     # BullMQ job processing
├── web-push-sub/              # Web push subscriptions
├── mail/                      # Email service
├── redis/                     # Redis client module
├── storage/                   # AWS S3 storage
├── turnstile/                 # Cloudflare Turnstile bot protection
├── middleware/                # Express middleware
└── common/                    # Shared utilities
    ├── auth/                  # Auth helpers
    ├── cookies/               # Cookie utilities
    ├── crypto/                # Hashing utilities
    ├── http/                  # HTTP filters and types
    ├── types/                 # TypeScript type definitions
    ├── utils/                 # General utilities
    └── validators/            # Custom validators
```

## Module Pattern

Each feature module follows the standard NestJS pattern:

```
feature/
├── feature.controller.ts      # HTTP route handlers
├── feature.service.ts         # Business logic
├── feature.module.ts          # Module definition
├── feature.schema.ts          # Mongoose schema (if database)
├── feature.enum.ts            # Enums (optional)
└── dto/                       # Data Transfer Objects
    ├── create-feature.dto.ts
    └── update-feature.dto.ts
```

## Code Style Guidelines

### TypeScript Configuration

- **Module:** `nodenext` with `nodenext` resolution
- **Target:** ES2023
- **Strict null checks:** Enabled
- **Source maps:** Enabled for debugging
- **Decorator metadata:** Enabled (for NestJS)

### Prettier Configuration

```json
{
    "singleQuote": true,
    "trailingComma": "all",
    "tabWidth": 4
}
```

### ESLint Rules

- `@typescript-eslint/no-explicit-any`: Off
- `@typescript-eslint/no-floating-promises`: Warn
- `@typescript-eslint/no-unsafe-argument`: Warn

### Naming Conventions

- **Classes:** PascalCase (e.g., `UserService`, `AuthController`)
- **Interfaces/Types:** PascalCase (e.g., `ApiSuccess`, `AuthRequest`)
- **Methods:** camelCase (e.g., `findById`, `createUser`)
- **Variables:** camelCase (e.g., `userId`, `accessToken`)
- **Constants:** UPPER_SNAKE_CASE for true constants
- **Files:** kebab-case (e.g., `auth.controller.ts`, `jwt-auth.guard.ts`)
- **DTOs:** Suffix with `Dto` (e.g., `SignupDto`, `LoginDto`)
- **Schemas:** Suffix with `Schema` for schema factory (e.g., `UserSchema`)

### Import Organization

Group imports in this order:
1. Core NestJS modules
2. Third-party libraries
3. Internal modules (absolute paths with `src/`)
4. Relative paths

Example:
```typescript
// Core NestJS
import { Controller, Get } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

// Third-party
import { Model } from 'mongoose';

// Internal
import { UserService } from 'src/user/user.service';
import { ApiSuccess } from 'src/common/types/api-response.type';

// Relative
import { AuthService } from './auth.service';
```

## API Response Format

All API responses use a consistent envelope:

```typescript
interface ApiSuccess<T> {
    success: true;
    statusCode: number;
    code: string;           // Machine-readable code
    message: string;        // Human-readable message
    timestamp: string;      // ISO 8601 timestamp
    path: string;           // Request path
    data?: T;              // Response payload
}

interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}
```

## Security Architecture

### Request Flow (in order)

1. **CORS** - Origin validation against `FRONTEND_URL`
2. **ThrottlerGuard** - Rate limiting (10 req/min per IP+device)
3. **Body Parsing** - JSON (64KB), URL-encoded (16KB)
4. **Content-Type Validation** - JSON required for POST/PUT/PATCH
5. **RequiredHeadersMiddleware** - `x-request-id`, CSRF check
6. **Security Headers** - Helmet, HPP, Compression
7. **ValidationPipe** - DTO validation and transformation
8. **JwtAuthGuard** - JWT authentication (skips `@Public()` routes)
9. **RolesGuard** - Role-based authorization
10. **CsrfGuard** - CSRF protection for state-changing operations

### Authentication Methods

1. **JWT (RS256)** - Primary authentication via cookie or Authorization header
2. **Google OAuth** - OAuth2 flow for Google sign-in
3. **API Key** - For KOL partner integrations (`x-api-key` header)
4. **HMAC** - Internal service-to-service authentication

### Required Headers

- `x-request-id` - Request tracing (auto-generated if missing)
- `x-csrf-token` - CSRF token for cookie-based auth
- `x-device-id` or `x-client-device-id` - Device tracking

### Decorators for Access Control

- `@Public()` - Skip JWT authentication
- `@SkipCsrf()` - Skip CSRF check
- `@Roles(Role.Admin)` - Require specific role
- `@Throttle()` - Custom rate limiting

## Database Patterns

### Schema Conventions

- All schemas use `timestamps: true` (createdAt, updatedAt)
- Use `@Prop()` decorator for all fields
- Create indexes for frequently queried fields
- Use sparse indexes for optional unique fields

### Example Schema

```typescript
@Schema({ timestamps: true })
export class Example {
    @Prop({ required: true, trim: true })
    name: string;

    @Prop({ unique: true, index: true })
    slug: string;

    @Prop({ type: Date })
    deletedAt?: Date;
}

export const ExampleSchema = SchemaFactory.createForClass(Example);
ExampleSchema.plugin(paginate);
```

### Common Fields

- `createdAt` / `updatedAt` - Automatic timestamps
- `deletedAt` - Soft delete marker (if implemented)
- `updatedBy` - Reference to admin who made last change
- `isBanned` / `status` - State management

## Environment Variables

Environment files are resolved in this order:
1. `.env.${NODE_ENV}` (e.g., `.env.development`)
2. `.env`

### Required Variables

See `.env.example` for all variables. Key ones include:

```bash
NODE_ENV=development|production
PORT=4000
FRONTEND_URL=http://localhost:3000
MONGO_URI=mongodb://127.0.0.1:27017/bhub
REDIS_URL=redis://127.0.0.1:6379

# JWT (RS256 requires keys, HS256 requires secret)
JWT_ISSUER=http://localhost:4000
JWT_AUDIENCE=bhub-api
JWT_ACCESS_ALG=RS256
JWT_ACCESS_TTL=900
JWT_ACCESS_PRIVATE_KEY_BASE64=<base64-encoded-PEM>
JWT_ACCESS_PUBLIC_KEY_BASE64=<base64-encoded-PEM>

# Email
MAIL_FROM_EMAIL=dev@example.com
GMAIL_APP_PASSWORD=<16-char-app-password>

# Google OAuth
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<client-secret>
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# AWS S3
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
AWS_REGION=ap-southeast-2
S3_BUCKET_NAME=bhub-dev-bucket

# Security
INTERNAL_HMAC_SECRET=<min-16-chars>
API_KEY=<api-key-for-kol-access>
CF_TURNSTILE_SECRET=<turnstile-secret>

# Web Push
PUSH_VAPID_PUBLIC_KEY=<vapid-public>
PUSH_VAPID_PRIVATE_KEY=<vapid-private>
```

All environment variables are validated on startup using Joi schema in `src/config/env.validation.ts`.

## Testing Instructions

### Unit Tests

Place unit test files alongside source files with `.spec.ts` suffix:
```
src/user/user.service.spec.ts
```

### E2E Tests

Place E2E tests in `test/` directory with `.e2e-spec.ts` suffix:
```
test/auth.e2e-spec.ts
```

### Jest Configuration

Unit tests use configuration from `package.json`:
- Root dir: `src`
- Test regex: `.*\.spec\.ts$`
- Coverage directory: `../coverage`

E2E tests use `test/jest-e2e.json`:
- Root dir: `.`
- Test regex: `.e2e-spec.ts$`

### Writing Tests

Follow NestJS testing patterns:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';

describe('UserService', () => {
    let service: UserService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [UserService],
        }).compile();

        service = module.get<UserService>(UserService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
```

## Security Considerations

### Authentication

- Use Argon2 for password hashing
- JWT tokens use RS256 (asymmetric) by default
- Access tokens have 15-minute TTL by default
- CSRF protection for cookie-based auth

### Input Validation

- All inputs validated via DTOs with `class-validator`
- Global `ValidationPipe` with whitelist enabled
- `forbidNonWhitelisted: true` rejects unexpected fields

### Rate Limiting

- Default: 10 requests per minute per IP+device
- Redis-backed storage in production
- Custom `@Throttle()` decorator for route-specific limits

### Data Protection

- Pino redacts: `authorization`, `cookie`, `password` fields
- Helmet for security headers
- HPP for HTTP Parameter Pollution protection
- Compression for responses > 1KB

### Secrets Management

- All secrets in environment variables
- Base64-encoded PEM format for keys
- Minimum length requirements for secrets (see env validation)
- No hardcoded credentials

## Common Tasks

### Adding a New Module

1. Create directory under `src/`
2. Create files: `*.module.ts`, `*.controller.ts`, `*.service.ts`
3. Add module to `AppModule` imports
4. Create DTOs in `dto/` subdirectory
5. Create schema if database entity needed

### Adding a New Endpoint

1. Add method to controller with appropriate HTTP decorator
2. Use DTO for request body validation
3. Apply guards as needed (`@Public()`, `@Roles()`, etc.)
4. Apply throttling for public endpoints
5. Return `ApiSuccess<T>` format

### Adding a Database Schema

1. Create schema file with `@Schema()` decorator
2. Define fields with `@Prop()` decorators
3. Add indexes for query fields
4. Export `*Schema` from module
5. Inject with `@InjectModel()` in service

## External Services

- **MongoDB:** Primary database (connection via `MONGO_URI`)
- **Redis:** Caching, queues, Socket.IO adapter
- **AWS S3:** File storage for uploads
- **Gmail SMTP:** Email delivery
- **Google OAuth:** Social authentication
- **Cloudflare Turnstile:** Bot protection
- **Mux:** Video streaming (if used)

## Troubleshooting

### Common Issues

1. **Environment validation fails:** Check all required env vars in `.env.development`
2. **MongoDB connection fails:** Verify `MONGO_URI` and ensure MongoDB is running
3. **Redis connection fails:** Non-fatal, but throttling won't work without Redis
4. **JWT validation fails:** Check `JWT_ACCESS_PUBLIC_KEY_BASE64` is correctly base64-encoded

### Debug Mode

Set `JWT_DEBUG_PAYLOAD=1` to log JWT payloads (development only).

## References

- [NestJS Documentation](https://docs.nestjs.com)
- [Mongoose Documentation](https://mongoosejs.com)
- [Project Structure Details](./docs/project-structure.md)
- [Database Schema](./docs/database-schema.md)
- [CLAUDE.md](./CLAUDE.md) - Additional context for Claude Code
