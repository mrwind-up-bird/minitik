# Next Up — OAuth Callback + Auth Consistency

## Status: Connection Wizard done, OAuth flow broken end-to-end

The wizard UI is complete (8 files, 4-step flow) but OAuth cannot finish — the callback route doesn't exist. Also, 3 out of 5 route handlers use a fake `x-user-id` header instead of real session auth.

---

## Task 1 — OAuth Callback Route (CRITICAL)

### Problem
OAuth providers redirect to `/api/accounts/callback/{provider}?code=X&state=Y` after user authorizes. That route doesn't exist — **404**.

Configured in `src/domains/accounts/infrastructure/oauth-providers.ts` lines 51, 61, 74:
```
${baseUrl}/api/accounts/callback/tiktok
${baseUrl}/api/accounts/callback/instagram
${baseUrl}/api/accounts/callback/youtube
```

### What Exists
- `initiateOAuthFlow()` in `src/domains/accounts/application/account-service.ts` — generates PKCE params + auth URL
- `connectAccount()` in same file — exchanges code for tokens, encrypts, saves to DB
- `handleConnectAccount()` in `src/apps/api/routes/accounts.ts` — expects `{ provider, code, codeVerifier, platformAccountId, platformUsername }` in POST body

### Fix — Create `/api/accounts/callback/[provider]/route.ts`

Server-side GET handler that:
1. Reads `code` and `state` from query params
2. Validates `provider` param is `tiktok | instagram | youtube`
3. Since PKCE `codeVerifier` is stored client-side (sessionStorage), this route can't exchange the code server-side directly

**Two approaches:**
- **Option A (simpler)**: Redirect to `/accounts?code={code}&state={state}` — let the client-side page extract params, retrieve `codeVerifier` from sessionStorage, POST to `/api/accounts` to complete the exchange
- **Option B (server-side)**: Store `codeVerifier` in an encrypted httpOnly cookie during initiate, read it back in callback, exchange server-side, redirect to `/accounts` with success flag

Option A is simpler and matches the existing sessionStorage-based PKCE pattern.

### Files
| File | Action |
|------|--------|
| `src/app/api/accounts/callback/[provider]/route.ts` | **Create** — GET handler, validate provider, redirect to `/accounts?code=&state=` |
| `src/app/(app)/accounts/page.tsx` | **Modify** — on mount, detect `code` + `state` URL params, retrieve `codeVerifier` from sessionStorage, POST to `/api/accounts`, show wizard success |

---

## Task 2 — Fix Route Authentication (CRITICAL)

### Problem
Three route handlers authenticate via `req.headers.get("x-user-id")` which the frontend never sends. These routes silently return 401 or operate without real user identity.

| File | Line | Current |
|------|------|---------|
| `src/apps/api/routes/scheduling.ts` | 27-28 | `req.headers.get("x-user-id")` |
| `src/apps/api/routes/content.ts` | 22-23 | `req.headers.get("x-user-id")` |
| `src/apps/api/routes/analytics.ts` | 17-18 | `req.headers.get("x-user-id")` |

### What Works
`src/apps/api/routes/accounts.ts` uses:
```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/apps/web/app/api/auth/[...nextauth]/route";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}
```

### Fix
Replace the `getUserId()` function in each of the 3 files with the `getServerSession` pattern from `accounts.ts`. ~5 lines changed per file.

---

## Task 3 — Deduplicate NextAuth Config (MEDIUM)

### Problem
Two identical NextAuth route files (187 lines each):
- `src/app/api/auth/[...nextauth]/route.ts` (active — in the app router)
- `src/apps/web/app/api/auth/[...nextauth]/route.ts` (unused duplicate)

### Fix
Delete the duplicate at `src/apps/web/app/api/auth/[...nextauth]/route.ts`. Ensure all imports reference the active one.

---

## Backlog (not blocking)

These are real but lower priority:

| Item | File | Notes |
|------|------|-------|
| TikTok analytics returns zeros | `src/domains/platforms/infrastructure/adapters/tiktok-adapter.ts:93` | Stub: `// replace with real TikTok Research API call` |
| TikTok video upload incomplete | Same file, line 179 | Initiates upload but doesn't stream video file |
| ffmpeg thumbnail generation | `src/domains/content/infrastructure/video-processor.ts:221` | `throw new Error("not yet implemented")` |

---

## Files Changed Summary

| File | Change | Priority |
|------|--------|----------|
| `src/app/api/accounts/callback/[provider]/route.ts` | **Create** — OAuth callback redirect | CRITICAL |
| `src/app/(app)/accounts/page.tsx` | **Modify** — handle code/state from URL | CRITICAL |
| `src/apps/api/routes/scheduling.ts` | **Modify** — switch to getServerSession | CRITICAL |
| `src/apps/api/routes/content.ts` | **Modify** — switch to getServerSession | CRITICAL |
| `src/apps/api/routes/analytics.ts` | **Modify** — switch to getServerSession | CRITICAL |
| `src/apps/web/app/api/auth/[...nextauth]/route.ts` | **Delete** — duplicate | MEDIUM |

## Verification
1. `npm run build` — zero errors
2. OAuth flow: initiate → provider → callback → `/accounts` with code in URL → token exchange → wizard success
3. `GET /api/content` returns real data (not 401)
4. `POST /api/scheduling` creates a job when logged in (not 401)
5. `GET /api/analytics/dashboard` returns metrics (not 401)
