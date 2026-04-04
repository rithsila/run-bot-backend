---
name: bhub-project-context
description: BHub Trading Membership Platform - Full-stack project context including Next.js frontend and NestJS microservices backend. Use when working on the BHub trading platform website, membership system, dashboard features, authentication, or any feature spanning frontend (bhub-new-ui) and backend (bhub-api). Triggers on questions about VPN page, membership features, trading tools, robots, indicators, subscriptions, or any BHub-specific functionality.
---

# BHub Project Context

This skill provides AI agents with complete context about the BHub trading membership platform, covering both frontend and backend architecture.

## Project Overview

**BHub** is a trading-focused SaaS membership platform providing:
- Trading membership subscriptions
- Expert Advisor (EA) robots for automated trading
- TradingView indicators
- Real-time market data and news analysis
- Member-only trading tools and resources

**Planned Feature**: VPN page for VPS services (to be created at `/vpn` route in frontend)

## Project Structure

### Frontend: bhub-new-ui
- **Location**: `/Users/rithsila/Projects/bhub-new-ui`
- **Framework**: Next.js 16.1.6 + React 19.2.3
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **State**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod

### Backend: bhub-api
- **Location**: `/Users/rithsila/Projects/bhub-api`
- **Framework**: NestJS 11.x with Express
- **Language**: TypeScript 5.7+
- **Database**: MongoDB + Mongoose ODM
- **Cache/Queue**: Redis + BullMQ
- **Realtime**: Socket.IO + Redis Adapter

## Frontend Architecture

### Route Structure
```
app/
├── (auth)/              # Public auth pages
│   ├── forgot-password/
│   ├── register/
│   ├── reset-password/
│   └── verify-email/
├── (protected)/         # Authenticated pages
│   ├── dashboard/       # Main dashboard with tabs
│   │   ├── [tab]/      # Dynamic routing
│   │   ├── home/
│   │   ├── ib-referral/
│   │   ├── indicator/
│   │   ├── plan-bill/
│   │   ├── robots/
│   │   └── setting-packs/
│   ├── home/
│   ├── ib-referral/
│   ├── indicator/
│   ├── plan-bill/
│   ├── robots/
│   └── setting-packs/
├── api/                 # API routes (proxy to backend)
│   ├── auth/           # Auth endpoints
│   ├── backend/[...path]/  # Backend proxy
│   └── webhooks/
└── page.tsx            # Login page (default route)
```

### Key Patterns

**Backend Proxy Pattern**:
```typescript
// All API calls go through /api/backend/[...path]
import { clientApiJson } from "@/lib/clientApi";
const data = await clientApiJson<ResponseType>("/endpoint-path");
```

**Dashboard Tab Pattern**:
- Add tab in `components/dashboard/DashboardTabs.tsx`
- Create page at `app/(protected)/new-tab/page.tsx`
- Create panel at `components/dashboard/NewTabPanel.tsx`
- Add dynamic import in `components/dashboard/DashboardTabContent.tsx`

**Data Fetching**:
```typescript
// Custom hooks pattern in lib/hooks/
import { useQuery } from "@tanstack/react-query";
import { clientApiJson } from "@/lib/clientApi";

export function useFeature() {
  return useQuery({
    queryKey: ["feature"],
    queryFn: () => clientApiJson<FeatureType>("/feature"),
  });
}
```

## Backend Architecture

### Module Structure
```
src/
├── auth/               # Authentication (JWT, Google OAuth)
├── user/               # User management
├── products/           # Product catalog
├── order/              # Order/purchase management
├── plan/               # Pricing plans
├── memberships/        # Membership licensing
├── subscriptions/      # Subscription tracking
├── coupons/            # Discount coupons
├── trading-plan/       # Trading analysis publishing
├── analyze-news/       # Market news analysis
├── retailer/           # Retail sentiment data
├── robots/trading/     # Trading robots/EAs
├── indicator/          # TradingView indicator access
├── real-time/          # WebSocket gateway
└── queue/              # BullMQ job processing
```

### API Response Format
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

### Module Pattern
Each feature follows NestJS standard:
```
feature/
├── feature.controller.ts    # HTTP routes
├── feature.service.ts       # Business logic
├── feature.module.ts        # Module definition
├── feature.schema.ts        # Mongoose schema
└── dto/
    ├── create-feature.dto.ts
    └── update-feature.dto.ts
```

## VPN Page Requirements

**Planned Feature**: VPN/VPS service page for hosting trading bots

**Frontend Route**: `/vpn` (to be created in `app/(protected)/vpn/`)

**Suggested Implementation**:
1. Create page at `app/(protected)/vpn/page.tsx`
2. Create panel component at `components/dashboard/VPNPanel.tsx`
3. Add VPN tab to `components/dashboard/DashboardTabs.tsx`
4. Add backend module `src/vpn/` with controller, service, schema
5. Create TanStack Query hook at `lib/hooks/useVPN.ts`

**Related Backend Services**:
- VPS provisioning (referencing VPS Reseller project at `/Users/rithsila/Projects/VPS Reseller Implementation Plan`)
- Subscription integration with existing `subscriptions/` module
- Order processing via `order/` module

## Technology Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend Framework | Next.js 16 + React 19 |
| Frontend Styling | Tailwind CSS v4 + shadcn/ui |
| Frontend State | TanStack Query |
| Backend Framework | NestJS 11 |
| Backend Database | MongoDB + Mongoose |
| Cache/Queue | Redis + BullMQ |
| Realtime | Socket.IO |
| Auth | JWT (RS256), Google OAuth |
| File Storage | AWS S3 |
| Email | Gmail SMTP |

## Development Commands

**Frontend**:
```bash
cd /Users/rithsila/Projects/bhub-new-ui
npm run dev          # Development on localhost:3000
npm run build        # Production build
```

**Backend**:
```bash
cd /Users/rithsila/Projects/bhub-api
pnpm run dev         # Development with watch mode
pnpm run build       # Production build
pnpm run start:prod  # Production run
```

## Key File Locations

| Purpose | Frontend Path | Backend Path |
|---------|--------------|--------------|
| API Client | `lib/clientApi.ts` | N/A |
| Auth Utilities | `lib/authClient.ts` | `src/auth/` |
| Custom Hooks | `lib/hooks/` | N/A |
| UI Components | `components/ui/` | N/A |
| Dashboard Components | `components/dashboard/` | N/A |
| API Routes | `app/api/` | `src/` |

## Environment Variables

**Frontend** (`.env.local`):
```bash
BACKEND_URL=http://localhost:3001
```

**Backend** (`.env.development`):
```bash
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000
MONGO_URI=mongodb://127.0.0.1:27017/bhub
REDIS_URL=redis://127.0.0.1:6379
```

## Code Style

**Frontend**:
- Components: PascalCase (`VPNPanel.tsx`)
- Hooks: camelCase with `use` prefix (`useVPN.ts`)
- Path alias: `@/*` maps to project root
- Import order: React/Next → Third-party → UI components → Hooks/Utils → Types

**Backend**:
- Classes: PascalCase (`VPNService`, `VPNController`)
- Files: kebab-case (`vpn.controller.ts`)
- DTOs: Suffix with `Dto` (`CreateVPNDto`)
- Import order: NestJS → Third-party → Internal (`src/`) → Relative
