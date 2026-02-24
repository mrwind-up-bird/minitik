# Contributing to minitik

**Last Updated:** 2026-02-24
**Source of Truth:** `package.json`, `.env.example`, `prisma/schema.prisma`

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Architecture Overview](#architecture-overview)
- [Development Workflow](#development-workflow)
- [API Routes Reference](#api-routes-reference)
- [Database](#database)
- [Queue System](#queue-system)
- [Testing Procedures](#testing-procedures)
- [Code Style and Conventions](#code-style-and-conventions)

---

## Prerequisites

- **Node.js** >= 20
- **PostgreSQL** >= 15 (primary database)
- **Redis** >= 7 (BullMQ queues, circuit breaker, rate limiter)
- **MongoDB** >= 7 (analytics time-series data)
- **npm** (package manager)

---

## Environment Setup

```bash
# 1. Clone the repository
git clone <repo-url> && cd minitik

# 2. Install dependencies (runs `prisma generate` via postinstall)
npm install

# 3. Copy environment template and fill in values
cp .env.example .env

# 4. Push Prisma schema to your local Postgres database
npm run db:push

# 5. (Optional) Seed the database with sample data
npm run db:seed

# 6. Start the development server
npm run dev
```

The dev server starts at `http://localhost:3000`.

---

## Environment Variables

All variables are defined in `.env.example`. Copy it to `.env` and fill in the values.

### Database

| Variable | Required | Format | Purpose |
|----------|----------|--------|---------|
| `DATABASE_URL` | Yes | `postgresql://user:password@host:5432/minitik?schema=public` | PostgreSQL connection string for Prisma |
| `MONGODB_URI` | Yes | `mongodb://host:27017` | MongoDB connection string for analytics |
| `MONGODB_DB` | No | String (default: `minitik_analytics`) | MongoDB database name |
| `REDIS_URL` | Yes | `redis://host:6379` | Redis connection for BullMQ queues, circuit breaker, and rate limiter |

### Authentication

| Variable | Required | Format | Purpose |
|----------|----------|--------|---------|
| `NEXTAUTH_URL` | Yes | URL (e.g., `http://localhost:3000`) | NextAuth base URL for callbacks |
| `NEXTAUTH_SECRET` | Yes | Random string (32+ chars) | NextAuth session encryption secret |
| `ENCRYPTION_KEY` | Yes | 64 hex characters (32 bytes) | AES-256-GCM key for encrypting OAuth tokens at rest |

### Platform OAuth Credentials

| Variable | Required | Format | Purpose |
|----------|----------|--------|---------|
| `TIKTOK_CLIENT_KEY` | For TikTok | String | TikTok developer app client key |
| `TIKTOK_CLIENT_SECRET` | For TikTok | String | TikTok developer app client secret |
| `INSTAGRAM_CLIENT_ID` | For Instagram | String | Meta/Instagram app client ID |
| `INSTAGRAM_CLIENT_SECRET` | For Instagram | String | Meta/Instagram app client secret |
| `GOOGLE_CLIENT_ID` | For YouTube | String | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For YouTube | String | Google OAuth client secret |

### AWS S3 (Media Storage)

| Variable | Required | Format | Purpose |
|----------|----------|--------|---------|
| `AWS_REGION` | Yes | AWS region (e.g., `us-east-1`) | S3 bucket region |
| `AWS_ACCESS_KEY_ID` | Yes | String | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | String | AWS IAM secret key |
| `AWS_S3_BUCKET` | Yes | String (e.g., `minitik-uploads`) | S3 bucket name for uploaded media |

### Web Push Notifications (VAPID)

| Variable | Required | Format | Purpose |
|----------|----------|--------|---------|
| `VAPID_PUBLIC_KEY` | For push | VAPID public key | Web Push public key (shared with browser) |
| `VAPID_PRIVATE_KEY` | For push | VAPID private key | Web Push private key (server-side only) |
| `VAPID_SUBJECT` | For push | `mailto:` URI | Contact email for push service operators |

### Generating Secrets

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate ENCRYPTION_KEY (32 bytes = 64 hex chars)
openssl rand -hex 32

# Generate VAPID keys
npx web-push generate-vapid-keys
```

---

## Available Scripts

All scripts are defined in `package.json` and run via `npm run <script>`.

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `next dev` | Start Next.js development server with hot reload |
| `build` | `next build` | Create optimized production build |
| `start` | `next start` | Start production server (requires `build` first) |
| `lint` | `eslint` | Run ESLint across the codebase |
| `postinstall` | `prisma generate` | Auto-generates Prisma client after `npm install` |
| `db:generate` | `prisma generate` | Regenerate Prisma client from schema |
| `db:push` | `prisma db push` | Push schema changes directly to database (no migration history) |
| `db:migrate` | `prisma migrate dev` | Create and apply a migration (development only) |
| `db:seed` | `npx tsx prisma/seed.ts` | Seed the database with sample data |
| `db:studio` | `prisma studio` | Open Prisma Studio GUI at `http://localhost:5555` |

---

## Architecture Overview

minitik uses domain-driven design with a hexagonal (ports and adapters) layout.

```
src/
  app/                          # Next.js 16 App Router
    (app)/                      # Authenticated app pages
      accounts/                 # Connected platform accounts
      analytics/                # Performance analytics
      content/                  # Content library
      schedule/                 # Scheduling calendar
      upload/                   # Upload new content
    (auth)/                     # Auth pages (login)
    api/                        # API route handlers
  domains/                      # Domain-driven bounded contexts
    accounts/                   # Platform account management
      application/              #   account-service.ts
      domain/                   #   (domain types)
      infrastructure/           #   oauth-providers, token-encryption, token-refresh
    analytics/                  # Performance metrics
      application/              #   analytics-service.ts
      infrastructure/           #   analytics-collector, exporter, repository, time-series-processor
    content/                    # Media content management
      infrastructure/           #   s3-storage, upload-service, video-processor
    platforms/                  # Platform adapter layer
      application/              #   platform-service.ts
      domain/                   #   platform-adapter.ts (interface + enums)
      infrastructure/           #   circuit-breaker, rate-limiter
        adapters/               #   tiktok-adapter, instagram-adapter, youtube-adapter
    publishing/                 # Cross-platform publish orchestration
      application/              #   publishing-orchestrator.ts
      domain/                   #   publishing-result.ts
      infrastructure/           #   content-optimizer, publishing-tracker
    scheduling/                 # Job scheduling
      application/              #   scheduling-service.ts
      infrastructure/           #   job-scheduler, job-processor
  shared/
    infrastructure/
      auth/                     # magic-link-adapter.ts (NextAuth)
      database/                 # postgres.ts, redis.ts, mongodb.ts, index.ts
        postgres.ts             #   Prisma client singleton
        redis.ts                #   ioredis singleton + BullMQ connection factory
        mongodb.ts              #   MongoDB client with time-series collection init
      monitoring/               # queue-metrics.ts
      pwa/                      # notification-service, offline-storage, sync-manager
      queues/                   # queue-config.ts (BullMQ queue definitions)
      websocket/                # publishing-events, upload-events
```

### Key Patterns

- **Token encryption**: All OAuth tokens are encrypted at rest using AES-256-GCM before being stored in Postgres. See `src/domains/accounts/infrastructure/token-encryption.ts`.
- **Circuit breaker**: Per-platform circuit breaker backed by Redis. Opens after 5 failures in 60 seconds, stays open for 5 minutes, then transitions to half-open for a probe. See `src/domains/platforms/infrastructure/circuit-breaker.ts`.
- **Rate limiter**: Sliding-window rate limiter backed by Redis 1-minute buckets. Configured at 50% of each platform's API limit. Includes adaptive throttling. See `src/domains/platforms/infrastructure/rate-limiter.ts`.
- **Publishing orchestrator**: Parallel multi-platform publishing with real-time WebSocket events, rollback support, and per-publication tracking. See `src/domains/publishing/application/publishing-orchestrator.ts`.
- **Job scheduling**: BullMQ delayed jobs with DST-aware timezone conversion, deduplication, and priority mapping. See `src/domains/scheduling/infrastructure/job-scheduler.ts`.

---

## Development Workflow

### Branch Naming

Use descriptive branch names:
- `feat/short-description` -- new features
- `fix/short-description` -- bug fixes
- `refactor/short-description` -- code restructuring

### Making Changes

1. Create a feature branch from `main`.
2. Make changes following the domain-driven structure.
3. Run `npm run lint` to check for lint errors.
4. Run `npm run build` to verify the production build succeeds.
5. Open a pull request against `main`.

### Adding a New Platform Adapter

1. Create `src/domains/platforms/infrastructure/adapters/<platform>-adapter.ts`.
2. Implement the `PlatformAdapter` interface from `src/domains/platforms/domain/platform-adapter.ts`.
3. Register the adapter in `src/domains/platforms/application/platform-service.ts`.
4. Add OAuth credentials to `.env.example` and this document.
5. Add rate-limit configuration to `src/domains/platforms/infrastructure/rate-limiter.ts`.
6. Add the platform enum value in `prisma/schema.prisma`.

### Adding a New API Route

1. Create route file under `src/app/api/<domain>/route.ts`.
2. Use the appropriate domain service from `src/domains/<domain>/application/`.
3. Authenticate requests via NextAuth session.
4. Return consistent JSON responses.

---

## API Routes Reference

All routes live under `src/app/api/`.

### Accounts

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/accounts` | List connected accounts |
| GET | `/api/accounts/[id]` | Get account details |
| POST | `/api/accounts/initiate` | Begin OAuth flow for a platform |
| GET | `/api/accounts/oauth` | OAuth callback handler |

### Content

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/content` | List content / create new content |
| GET/PATCH/DELETE | `/api/content/[id]` | Get, update, or delete content |

### Publishing

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/publishing` | Publish content to selected accounts |
| GET | `/api/publishing/[id]` | Get publishing status for a content item |

### Scheduling

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/scheduling` | List scheduled jobs / create new schedule |
| GET/DELETE | `/api/scheduling/[id]` | Get or cancel a scheduled job |
| POST | `/api/scheduling/bulk` | Bulk schedule operations |
| GET | `/api/scheduling/jobs/[id]` | Get BullMQ job state for a scheduled job |
| GET | `/api/scheduling/stats` | Queue statistics |

### Analytics

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/analytics/dashboard` | Dashboard aggregate stats |
| GET | `/api/analytics/content/[id]` | Analytics for a specific content item |
| POST | `/api/analytics/refresh` | Trigger analytics refresh |
| GET | `/api/analytics/export` | Export analytics data |

### Platforms

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/platforms/health` | Platform adapter health / circuit breaker status |

### Auth

| Method | Route | Purpose |
|--------|-------|---------|
| * | `/api/auth/[...nextauth]` | NextAuth catch-all (login, callback, session) |

---

## Database

### Prisma Schema

The schema is at `prisma/schema.prisma`. Key models:

| Model | Table | Purpose |
|-------|-------|---------|
| `User` | `users` | Application users with subscription tier |
| `Session` | `sessions` | NextAuth sessions |
| `Account` | `accounts` | Connected platform accounts (OAuth tokens encrypted) |
| `Content` | `contents` | Uploaded media content |
| `Publication` | `publications` | Per-platform publish records |
| `ScheduledJob` | `scheduled_jobs` | BullMQ job references with scheduling metadata |
| `VerificationToken` | `verification_tokens` | Magic link verification tokens |
| `NotificationSubscription` | `notification_subscriptions` | Web Push subscriptions |

### Key Enums

- `Platform`: `TIKTOK`, `INSTAGRAM`, `YOUTUBE`
- `AccountStatus`: `CONNECTING`, `CONNECTED`, `EXPIRED`, `REVOKED`, `ERROR`
- `ContentStatus`: `DRAFT`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED`, `FAILED`
- `PublicationStatus`: `QUEUED`, `PUBLISHING`, `PUBLISHED`, `FAILED`
- `JobStatus`: `PENDING`, `ACTIVE`, `COMPLETED`, `FAILED`, `CANCELLED`
- `JobPriority`: `LOW`, `NORMAL`, `HIGH`
- `SubscriptionTier`: `FREE`, `PRO`, `BUSINESS`

### MongoDB (Analytics)

Analytics data is stored in a MongoDB time-series collection (`analytics`) with:
- `timeField`: `timestamp`
- `metaField`: `metadata` (contains `contentId`, `accountId`, `platform`, `userId`)
- `granularity`: `hours`
- TTL: 12 months
- Indexes on `metadata.contentId`, `metadata.accountId`, `metadata.platform`, `metadata.userId` (each with `timestamp` descending)

### Schema Changes

```bash
# Development: push schema directly (no migration file)
npm run db:push

# Development: create a migration file for versioned changes
npm run db:migrate

# After any schema change, regenerate the client
npm run db:generate
```

---

## Queue System

BullMQ queues are defined in `src/shared/infrastructure/queues/queue-config.ts`.

| Queue | Purpose | Max Attempts | Backoff |
|-------|---------|-------------|---------|
| `publish` | Content publishing jobs | 3 | Exponential (2s base) |
| `analytics` | Analytics collection jobs | 3 | Exponential (2s base) |
| `token-refresh` | OAuth token refresh | 5 | Exponential (2s base) |
| `dead-letter` | Failed jobs for inspection | 1 | None |

All queues share these defaults:
- Remove on complete: keep last 100
- Remove on fail: keep last 50
- Dead letter queue keeps last 200

Redis connections for BullMQ use a dedicated factory (`createBullConnection`) with `maxRetriesPerRequest: null` as required by BullMQ.

### Rate Limits by Platform

| Platform | Limit | Window |
|----------|-------|--------|
| TikTok | 50 requests | 1 hour |
| Instagram | 100 requests | 1 hour |
| YouTube | 5,000 quota units | 24 hours |

These are configured at 50% of each platform's actual API limits to provide safety margin.

---

## Testing Procedures

### Build Verification

```bash
# Lint the codebase
npm run lint

# Build for production (catches type errors and build issues)
npm run build
```

### Local End-to-End Testing

1. Ensure Postgres, Redis, and MongoDB are running locally.
2. Push the schema: `npm run db:push`
3. Seed data: `npm run db:seed`
4. Start the dev server: `npm run dev`
5. Verify at `http://localhost:3000`:
   - Login flow works (magic link via NextAuth)
   - Account connection flow initiates OAuth
   - Content upload creates records
   - Scheduling creates BullMQ delayed jobs
   - Publishing sends content to connected platforms
   - Analytics dashboard loads

### Database Inspection

```bash
# Open Prisma Studio to inspect Postgres data
npm run db:studio

# Connect to Redis CLI to inspect queues
redis-cli -u $REDIS_URL
> KEYS bull:*
> LLEN bull:publish:wait

# Connect to MongoDB to inspect analytics
mongosh $MONGODB_URI/$MONGODB_DB
> db.analytics.find().sort({timestamp: -1}).limit(5)
```

---

## Code Style and Conventions

- **TypeScript strict mode** is enabled.
- **Path aliases**: `@/*` maps to `./src/*`.
- **Domain boundaries**: Domain code should not import from other domains directly. Cross-domain communication goes through application services.
- **Infrastructure**: Database clients, queue configs, and external service adapters live in `infrastructure/` directories.
- **No default exports** from domain/application modules (except database singletons).
- **Error handling**: Domain-specific error classes extend `Error` with a `name` property (e.g., `PublishingValidationError`, `PublishingAuthorizationError`).
