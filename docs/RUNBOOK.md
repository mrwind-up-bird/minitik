# minitik Operations Runbook

**Last Updated:** 2026-02-24
**Source of Truth:** `package.json`, `.env.example`, `prisma/schema.prisma`, `src/shared/infrastructure/`

---

## Table of Contents

- [Deployment](#deployment)
- [Infrastructure Overview](#infrastructure-overview)
- [Monitoring and Alerts](#monitoring-and-alerts)
- [Common Issues and Fixes](#common-issues-and-fixes)
- [Rollback Procedures](#rollback-procedures)
- [Maintenance Tasks](#maintenance-tasks)
- [Incident Response](#incident-response)

---

## Deployment

### Platform

minitik is deployed on **Vercel** as a Next.js 16 application. Vercel handles:
- Automatic deployments on push to `main`
- Preview deployments on pull requests
- Serverless function execution for API routes
- Edge network for static assets

### Environment Variables on Vercel

All variables from `.env.example` must be configured in the Vercel project settings under **Settings > Environment Variables**. Critical variables:

| Variable | Scope | Notes |
|----------|-------|-------|
| `DATABASE_URL` | Production, Preview | Use a connection pooler (e.g., Supabase pgbouncer or Neon pooler) for serverless |
| `REDIS_URL` | Production, Preview | Use a managed Redis (Upstash, Redis Cloud) |
| `MONGODB_URI` | Production, Preview | Use MongoDB Atlas |
| `NEXTAUTH_URL` | Production | Must match the production domain exactly |
| `NEXTAUTH_SECRET` | Production, Preview | Must be identical across all instances |
| `ENCRYPTION_KEY` | Production, Preview | Rotating this key invalidates all stored OAuth tokens |

### Deployment Flow

```
git push main
  -> Vercel detects push
  -> Runs `npm install` (triggers `postinstall` = `prisma generate`)
  -> Runs `next build`
  -> Deploys serverless functions + static assets
  -> Health check at the deployment URL
```

### Server External Packages

The following packages are externalized from the Next.js serverless bundle via `next.config.ts`:
- `@prisma/client`, `prisma`
- `ioredis`, `bullmq`
- `mongodb`
- `web-push`, `nodemailer`

This is required because these packages use native Node.js APIs that cannot be bundled into serverless functions.

### Database Migrations in Production

Prisma migrations are NOT run automatically on deploy. For schema changes:

```bash
# 1. Create migration locally
npm run db:migrate

# 2. Review the generated SQL in prisma/migrations/
# 3. Apply to production database manually or via CI:
DATABASE_URL="<production-url>" npx prisma migrate deploy
```

**WARNING**: `db:push` should never be used against production. It can drop columns and data. Always use `migrate deploy` for production.

---

## Infrastructure Overview

```
                    +------------------+
                    |    Vercel Edge   |
                    |  (Static + SSR)  |
                    +--------+---------+
                             |
                    +--------v---------+
                    | Next.js API Routes|
                    | (Serverless Fns)  |
                    +--+------+------+-+
                       |      |      |
           +-----------+  +---+  +---+-----------+
           |              |              |        |
   +-------v------+ +----v----+ +-------v--+ +---v-------+
   |  PostgreSQL   | |  Redis  | | MongoDB  | |   AWS S3  |
   | (Prisma ORM)  | | (ioredis)| | (Analytics)| | (Media)  |
   +-------+------+ +----+----+ +----------+ +-----------+
           |              |
   Users, Accounts,  BullMQ Queues:
   Content, Pubs,    - publish
   Jobs, Sessions    - analytics
                     - token-refresh
                     - dead-letter
                     +
                     Circuit Breaker
                     Rate Limiter state
```

### External Services

| Service | Purpose | Failure Impact |
|---------|---------|---------------|
| PostgreSQL | Primary data store | Full outage -- all CRUD operations fail |
| Redis | Queues, circuit breaker, rate limiter | Publishing queues stall, rate limiting degrades to allow-all |
| MongoDB | Analytics time-series | Analytics dashboard unavailable, publishing unaffected |
| AWS S3 | Media file storage | Upload and content serving fails, existing publishes unaffected |
| TikTok API | Content publishing | TikTok publishes fail, circuit breaker activates after 5 failures |
| Instagram API | Content publishing | Instagram publishes fail, circuit breaker activates after 5 failures |
| YouTube API | Content publishing | YouTube publishes fail, circuit breaker activates after 5 failures |

---

## Monitoring and Alerts

### Queue Metrics

The application exposes queue metrics via `src/shared/infrastructure/monitoring/queue-metrics.ts`. Call `getAllQueueMetrics()` to get:

```json
{
  "queues": [
    {
      "name": "publish",
      "counts": { "active": 2, "waiting": 5, "delayed": 10, "completed": 150, "failed": 3, "paused": 0 },
      "throughput": { "completedLastMinute": 4, "failedLastMinute": 0, "avgProcessingTimeMs": 2340 }
    }
  ],
  "totals": { "active": 3, "waiting": 7, "delayed": 12, "completed": 200, "failed": 5, "paused": 0 },
  "collectedAt": "2026-02-24T10:00:00.000Z"
}
```

Access via API at `GET /api/scheduling/stats`.

### Key Metrics to Watch

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|-------------------|--------|
| `publish` queue failed count | > 5 in 10 min | > 20 in 10 min | Check platform API status, inspect dead-letter queue |
| `publish` queue waiting | > 50 | > 200 | Check if worker is processing, Redis connectivity |
| `token-refresh` failed | > 3 in 1 hour | > 10 in 1 hour | Platform OAuth may be rate-limited or credentials expired |
| Circuit breaker OPEN | Any platform | Multiple platforms | Platform API outage, wait for auto-recovery (5 min) |
| Dead letter queue size | > 10 | > 50 | Inspect failed jobs, fix root cause, replay if needed |

### Circuit Breaker States

The circuit breaker for each platform (TikTok, Instagram, YouTube) transitions through:

```
CLOSED --[5 failures in 60s]--> OPEN --[300s cooldown]--> HALF_OPEN --[probe succeeds]--> CLOSED
                                                            |
                                                     [probe fails]
                                                            |
                                                           OPEN
```

Check circuit breaker status at `GET /api/platforms/health`.

### Redis Health Check

```bash
# Check Redis connectivity
redis-cli -u $REDIS_URL PING
# Expected: PONG

# Check BullMQ queue sizes
redis-cli -u $REDIS_URL KEYS "bull:*:waiting"
redis-cli -u $REDIS_URL LLEN "bull:publish:wait"

# Check circuit breaker state for a platform
redis-cli -u $REDIS_URL GET "circuit_breaker:tiktok:state"
```

### Database Health Check

```bash
# Check Postgres connectivity
DATABASE_URL="<url>" npx prisma db execute --stdin <<< "SELECT 1;"

# Check for long-running queries (connect via psql)
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '30 seconds';
```

---

## Common Issues and Fixes

### 1. "ENCRYPTION_KEY must be 32 bytes" Error

**Cause**: The `ENCRYPTION_KEY` environment variable is missing, empty, or not exactly 64 hex characters.

**Fix**:
```bash
# Generate a valid key
openssl rand -hex 32
# Set it in your .env or Vercel environment variables
```

**WARNING**: Changing the encryption key in production invalidates ALL stored OAuth tokens. All connected accounts will need to re-authenticate.

### 2. BullMQ Jobs Stuck in "waiting" State

**Cause**: No worker is processing the queue. In a Vercel serverless environment, BullMQ workers do not run persistently.

**Fix**:
- Ensure a separate worker process is running (not in Vercel serverless).
- For a Vercel-only setup, use cron-based job processing via Vercel Cron or an external scheduler that calls an API endpoint to process pending jobs.
- Check Redis connectivity: `redis-cli -u $REDIS_URL PING`.

### 3. Circuit Breaker Stuck OPEN

**Cause**: A platform API experienced 5+ failures within 60 seconds and the circuit opened.

**Fix**:
- Wait 5 minutes for automatic transition to HALF_OPEN.
- If the platform is healthy, manually reset:
```bash
redis-cli -u $REDIS_URL DEL "circuit_breaker:<platform>:state"
redis-cli -u $REDIS_URL DEL "circuit_breaker:<platform>:failures"
redis-cli -u $REDIS_URL DEL "circuit_breaker:<platform>:opened_at"
```
Replace `<platform>` with `tiktok`, `instagram`, or `youtube`.

### 4. OAuth Token Refresh Failures

**Cause**: Platform refresh tokens have expired, been revoked, or the OAuth app credentials changed.

**Symptoms**: Account status changes to `EXPIRED` or `ERROR` in the database.

**Fix**:
```sql
-- Check for accounts in error state
SELECT id, platform, status, "tokenExpiresAt"
FROM accounts
WHERE status IN ('EXPIRED', 'ERROR');
```
Users will need to reconnect their accounts through the OAuth flow.

### 5. MongoDB Analytics Collection Not Created

**Cause**: First connection to MongoDB did not complete the time-series collection setup.

**Fix**: The collection is auto-created on first connection via `getMongoDb()` in `src/shared/infrastructure/database/mongodb.ts`. Verify manually:
```bash
mongosh $MONGODB_URI/$MONGODB_DB --eval "db.analytics.stats()"
```

### 6. "Cannot schedule a job in the past" Error

**Cause**: The scheduled time, after timezone conversion to UTC, is in the past.

**Fix**: Verify the client is sending the correct timezone identifier (IANA format, e.g., `America/New_York`) and the scheduled time is in the future.

### 7. Prisma "prepared statement already exists" Error

**Cause**: Connection pooling conflicts in serverless. Multiple serverless function invocations share the global Prisma client but hit connection pool limits.

**Fix**: Use a connection pooler (PgBouncer, Supabase pooler, Neon pooler) and ensure `DATABASE_URL` points to the pooler endpoint. The Prisma client uses the `globalThis` singleton pattern (see `src/shared/infrastructure/database/postgres.ts`).

### 8. S3 Upload Failures

**Cause**: Incorrect AWS credentials, bucket policy, or CORS configuration.

**Fix**:
- Verify `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `AWS_S3_BUCKET` are set correctly.
- Ensure the IAM user has `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` permissions on the bucket.
- For browser-based uploads using presigned URLs, ensure the S3 bucket has appropriate CORS configuration.

---

## Rollback Procedures

### Application Rollback (Vercel)

Vercel maintains deployment history. To roll back:

1. Go to the Vercel dashboard > project > Deployments.
2. Find the last known-good deployment.
3. Click the three-dot menu > "Promote to Production".

This is instant and does not require a new build.

### Database Rollback

Prisma migrations are forward-only. To roll back a migration:

1. Write a reverse migration SQL manually.
2. Apply it:
```bash
DATABASE_URL="<production-url>" npx prisma db execute --file reverse-migration.sql
```
3. Update `prisma/schema.prisma` to match the reverted state.
4. Run `npx prisma migrate resolve --rolled-back <migration-name>` to mark the migration as rolled back.

**Always take a database backup before applying migrations to production.**

### Publishing Rollback

The publishing orchestrator supports rolling back published content:

- **API**: `DELETE /api/publishing/[contentId]` triggers the rollback flow.
- **What it does**: Marks publications as rolled back in the database and reverts content status to `DRAFT`.
- **Limitation**: Platform-specific delete API calls are not yet implemented in the adapters. The rollback currently only updates internal state.

### Queue Rollback / Drain

To clear stuck or poisoned jobs from a queue:

```bash
# Remove all waiting jobs from the publish queue
redis-cli -u $REDIS_URL DEL "bull:publish:wait"

# Remove all delayed jobs
redis-cli -u $REDIS_URL DEL "bull:publish:delayed"

# Or drain via BullMQ API (requires a Node.js script):
# import { publishQueue } from './src/shared/infrastructure/queues/queue-config';
# await publishQueue.drain();
```

---

## Maintenance Tasks

### Token Refresh (Recurring)

The function `refreshExpiringTokens()` in `src/domains/accounts/infrastructure/token-refresh.ts` scans for tokens expiring within 30 minutes and refreshes them. This should be called periodically via:
- A Vercel Cron Job calling a protected API endpoint, or
- An external scheduler (e.g., GitHub Actions cron, AWS EventBridge).

### Dead Letter Queue Inspection

Periodically inspect the dead-letter queue for patterns:

```bash
# Count dead-letter jobs
redis-cli -u $REDIS_URL LLEN "bull:dead-letter:failed"
```

If the dead-letter queue grows, inspect jobs to find the root cause before replaying.

### MongoDB Analytics TTL

Analytics data expires after 12 months (configured in `src/shared/infrastructure/database/mongodb.ts`). No manual cleanup is required. To verify:

```bash
mongosh $MONGODB_URI/$MONGODB_DB --eval "db.runCommand({listCollections: 1, filter: {name: 'analytics'}})"
```

### Dependency Updates

```bash
# Check for outdated packages
npm outdated

# Update Prisma (schema + client must match)
npm install prisma@latest @prisma/client@latest
npm run db:generate
```

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|---------|
| P1 | Full outage | Immediate | Database down, auth broken, all publishing fails |
| P2 | Partial outage | < 1 hour | One platform adapter failing, analytics unavailable |
| P3 | Degraded | < 4 hours | Slow queue processing, intermittent upload failures |
| P4 | Minor | Next business day | UI glitch, incorrect analytics count |

### P1 Playbook

1. Check Vercel deployment status (is the latest deploy healthy?).
2. Check database connectivity (Postgres, Redis, MongoDB).
3. If a bad deploy caused the issue, roll back via Vercel dashboard immediately.
4. If infrastructure is down, check the managed service status pages.
5. If the issue is in application code, identify the commit, revert, push to `main`.

### P2 Playbook (Platform Adapter Failure)

1. Check `GET /api/platforms/health` for circuit breaker status.
2. Check the platform's developer status page.
3. If the circuit breaker is OPEN, it will auto-recover in 5 minutes.
4. If the platform is down, no action needed -- the circuit breaker protects the system.
5. If the issue is in our adapter code, fix and deploy.

### Information to Gather

For any incident, collect:
- Timestamp of first occurrence
- Affected API routes or pages
- Queue metrics snapshot (`GET /api/scheduling/stats`)
- Circuit breaker states (`GET /api/platforms/health`)
- Recent deployment history (Vercel dashboard)
- Error logs from Vercel function logs
