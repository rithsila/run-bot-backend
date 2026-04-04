# BHub API - Project Context

## Project Overview

**BHub API** is a NestJS-based backend for a trading-focused SaaS platform. It provides membership management, trading tools, authentication, and real-time features.

### Tech Stack

| Category            | Technology                          |
| ------------------- | ----------------------------------- |
| **Framework**       | NestJS 11                           |
| **Language**        | TypeScript 5.7                      |
| **Database**        | MongoDB 8 + Mongoose                |
| **Cache/Queue**     | Redis + BullMQ                      |
| **Realtime**        | Socket.IO                           |
| **Auth**            | JWT, Google OAuth, API Keys         |
| **Security**        | Argon2, Helmet, CSRF, Rate Limiting |
| **Package Manager** | pnpm                                |

### Architecture

- **Modular design**: Each feature is a self-contained NestJS module
- **Global guards**: Throttling, JWT auth, Roles, CSRF protection
- **Security-first**: Multi-layered request validation and hardening
- **Event-driven**: BullMQ queues for background jobs
- **Realtime**: WebSocket support via Socket.IO with Redis adapter

## Building and Running

### Installation

```bash
pnpm install
```

### Development

```bash
# Start dev server (watch mode)
pnpm run start:dev

# Start with debug support
pnpm run start:debug
```

### Production

```bash
# Build
pnpm run build

# Run production build
pnpm run start:prod
```

### Testing

```bash
# Unit tests
pnpm run test

# Watch mode
pnpm run test:watch

# Coverage
pnpm run test:cov

# E2E tests
pnpm run test:e2e
```

### Code Quality

```bash
# Lint (auto-fix)
pnpm run lint

# Format
pnpm run format
```

## Project Structure

```
src/
├── auth/                 # Authentication (JWT, OAuth, API keys)
├── user/                 # User management
├── memberships/          # Membership & licensing system
├── coupons/              # Discount/coupon management
├── plan/                 # Trading plans
├── trading-plan/         # Trading plan logic
├── indicator/            # Trading indicators
├── robots/               # Trading automation
├── order/                # Order management
├── products/             # Product catalog
├── subscriptions/        # Subscription handling
├── retailer/             # Retailer integration
├── mail/                 # Email service
├── queue/                # BullMQ queue system
├── real-time/            # WebSocket/Socket.IO
├── redis/                # Redis connection & utilities
├── storage/              # File storage (S3)
├── web-push-sub/         # Web push notifications
├── turnstile/            # Cloudflare Turnstile
├── analyze-news/         # News analysis
├── config/               # Environment & config
├── common/               # Shared utilities
├── middleware/           # Custom middleware
├── app.module.ts         # Root module
├── main.ts               # Application bootstrap
└── app.controller.ts     # Root controller
```

## Module Pattern

Each feature module follows this structure:

```
feature/
├── feature.controller.ts    # HTTP endpoints
├── feature.service.ts       # Business logic
├── feature.module.ts        # Module definition
├── feature.schema.ts        # Mongoose schemas
└── dto/                     # DTOs with class-validator
```

## Key Configuration Files

| File                | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `nest-cli.json`     | NestJS CLI config                            |
| `tsconfig.json`     | TypeScript config (ES2023, NodeNext modules) |
| `eslint.config.mjs` | ESLint + Prettier integration                |
| `.prettierrc`       | Code formatting rules                        |
| `.env.example`      | Environment variable template                |

## Environment Setup

Copy `.env.example` to `.env.development` and configure:

```bash
# Core
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000

# Database
MONGO_URI=mongodb://127.0.0.1:27017/bhub

# Redis
REDIS_URL=redis://127.0.0.1:6379

# JWT (generate keys for RS256)
JWT_ISSUER=http://localhost:4000
JWT_AUDIENCE=bhub-api
JWT_ACCESS_ALG=RS256
JWT_ACCESS_PRIVATE_KEY_BASE64=<base64-encoded-private-key>
JWT_ACCESS_PUBLIC_KEY_BASE64=<base64-encoded-public-key>

# Mail (Gmail app password)
MAIL_FROM_EMAIL=dev@example.com
GMAIL_APP_PASSWORD=<app-password>

# OAuth
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<client-secret>

# AWS S3
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
AWS_REGION=ap-southeast-2
S3_BUCKET_NAME=bhub-dev-bucket
```

## Development Conventions

### Coding Style

- **Single quotes** for strings
- **Trailing commas** in multi-line structures
- **4-space indentation**
- **TypeScript strict mode** (with selective relaxations)

### Testing Practices

- Unit tests: `*.spec.ts` alongside source files
- E2E tests: `*.e2e-spec.ts` in `test/` directory
- Coverage target: 80% minimum

### API Response Format

All responses follow a consistent envelope:

```typescript
{
  success: boolean;
  data: T | null;
  error?: string | null;
  total?: number;  // for paginated responses
}
```

### Security Guidelines

1. Always use guards for protected routes
2. Validate all inputs with DTOs (`class-validator`)
3. Use CSRF tokens for cookie-based auth
4. Implement rate limiting for sensitive endpoints
5. Store secrets in environment variables only
6. Use device fingerprinting for tracking

## Common Tasks

### Adding a New Feature

1. Create module: `nest g module src/feature`
2. Generate service: `nest g service src/feature`
3. Generate controller: `nest g controller src/feature`
4. Define Mongoose schema
5. Create DTOs with validation
6. Add tests
7. Import module in `app.module.ts`

### Database Schema Changes

1. Update schema file in feature module
2. Create migration if needed
3. Update DTOs and validators
4. Test with existing data

### Adding Environment Variables

1. Add to `.env.example`
2. Update `src/config/env.validation.ts` with Joi schema
3. Access via `ConfigService`

## Troubleshooting

### Redis Connection Issues

```
❌ Redis connection failed
```

Ensure Redis is running: `redis-server` or check `REDIS_URL`

### JWT Key Errors

For RS256, generate keys:

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
# Base64 encode and add to .env
```

### Port Already in Use

Change `PORT` in `.env.development` or kill the process:

```bash
lsof -ti:4000 | xargs kill
```

## Documentation

Additional docs available in `docs/`:

- `project-prd.md` - Product requirements
- `project-structure.md` - Detailed structure guide
- `security-audit.md` - Security considerations
- `database-schema.md` - MongoDB schema documentation
- `setup-mongodb.md` - Database setup guide
