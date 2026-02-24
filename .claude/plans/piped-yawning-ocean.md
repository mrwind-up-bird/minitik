# Next Up — YouTube Upload + Test Suite

## Completed
- Dashboard stats: real counts for drafts/scheduled/published
- Publishing pipeline: job processor calls real platform adapters
- Connection wizard: 4-step UI (platform picker, setup guide, OAuth connect, success)
- OAuth callback route: `/api/accounts/callback/[provider]` handles provider redirects
- Platform user info: auto-fetches user profile after token exchange
- Route auth: all route handlers use `getServerSession` (no more fake `x-user-id`)
- Deduplicated NextAuth config (deleted `src/app/api/auth/[...nextauth]/route.ts`)
- TikTok adapter: full video upload (chunked from S3) + real analytics via Display API
- ffmpeg thumbnail generation: extract frame → upload JPEG to S3
- `putObject` added to s3-storage for small file uploads

## Adapter Status

| Adapter | publishContent | getAnalytics | Notes |
|---------|---------------|-------------|-------|
| TikTok | DONE | DONE | Full chunked upload + poll status |
| Instagram | DONE | DONE | Two-step Graph API (create container → publish) |
| YouTube | INCOMPLETE | DONE | Only initiates resumable upload session, never streams video bytes |

Instagram `shares` hardcoded to 0 (Graph API doesn't expose it). YouTube `shares` hardcoded to 0 (API doesn't expose it). Both are platform limitations, not bugs.

---

## Task 1 — Complete YouTube Video Upload (MEDIUM)

### Problem
`src/domains/platforms/infrastructure/adapters/youtube-adapter.ts` line ~246:
```typescript
// In production, content.filePath would be streamed to uploadUrl.
// Here we just verify the session was created successfully.
// The actual byte transfer is handled separately (e.g., by the content service).
```

The method calls `POST /upload/youtube/v3/videos` to create a resumable upload session and gets an `uploadUrl`, but never streams the video file to it. Returns the upload URL as a temporary `platformPostId`.

### Fix
After getting the `uploadUrl` from the init call:
1. Get a presigned download URL for the video from S3 (same pattern as TikTok adapter)
2. Stream the video to YouTube's `uploadUrl` via PUT with `Content-Type: video/*`
3. YouTube responds with the final video resource including the real video ID
4. Return the real video ID as `platformPostId`

YouTube resumable uploads support single-request upload (PUT entire file) for files under ~5MB, or chunked upload (PUT with `Content-Range`) for larger files. Use chunked for consistency.

### Files
| File | Action |
|------|--------|
| `src/domains/platforms/infrastructure/adapters/youtube-adapter.ts` | **Modify** — complete `callYouTubeUploadApi` with actual file streaming |

---

## Task 2 — Add Test Suite (HIGH)

### Problem
The project has zero test files. No `.test.ts`, `.spec.ts`, or test framework configured.

### Scope
Start with unit tests for the most critical service functions:

1. **Account service** (`src/domains/accounts/application/account-service.ts`)
   - `connectAccount` — token exchange + DB upsert
   - `initiateOAuthFlow` — generates valid PKCE params
   - Account limit enforcement

2. **Scheduling service** (`src/domains/scheduling/application/scheduling-service.ts`)
   - `schedulePost` — creates job + DB records
   - `cancelScheduledJob` — cancellation logic

3. **Platform user info** (`src/domains/accounts/infrastructure/platform-user-info.ts`)
   - `fetchPlatformUserInfo` — each provider returns correct shape

4. **Video processor** (`src/domains/content/infrastructure/video-processor.ts`)
   - `validateMimeType`, `validateExtension`, `validateForPlatform` — pure functions, easy to test

### Setup
- Install vitest (or jest) as dev dependency
- Add `test` script to `package.json`
- Create `__tests__/` directories next to source files or a top-level `tests/` directory

---

## Backlog

| Item | Priority | Notes |
|------|----------|-------|
| Add auth middleware for app routes | LOW | NextAuth JWT handles it, but explicit middleware could protect `/api/*` |
| Instagram `filePath` must be public URL | LOW | Comment in adapter notes this — may need presigned URL pass-through |
| Consolidate `.memory/` checkpoint files | LOW | 13 checkpoints today — could prune older ones |
