# Next Up — Instagram Fix + Platform Delete + Security Hardening

## Completed
- Dashboard stats: real counts for drafts/scheduled/published
- Publishing pipeline: job processor calls real platform adapters
- Connection wizard: 4-step UI (platform picker, setup guide, OAuth connect, success)
- OAuth callback route: `/api/accounts/callback/[provider]` handles provider redirects
- Platform user info: auto-fetches user profile after token exchange
- Route auth: all route handlers use `getServerSession` (no more fake `x-user-id`)
- Deduplicated NextAuth config (deleted `src/app/api/auth/[...nextauth]/route.ts`)
- TikTok adapter: full video upload (chunked from S3) + real analytics via Display API
- YouTube adapter: full resumable chunked upload from S3 + real analytics
- ffmpeg thumbnail generation: extract frame → upload JPEG to S3
- `putObject` added to s3-storage for small file uploads
- Test suite: vitest with 66 tests across 5 files (video-processor, platform-user-info, oauth-providers, account-service, scheduling-service)

## Adapter Status

| Adapter | publishContent | getAnalytics | Notes |
|---------|---------------|-------------|-------|
| TikTok | DONE | DONE | Full chunked upload + poll status |
| Instagram | BUG | DONE | `video_url` receives S3 key instead of public URL |
| YouTube | DONE | DONE | Resumable chunked upload, returns real video ID |

Instagram `shares` hardcoded to 0 (Graph API doesn't expose it). YouTube `shares` hardcoded to 0 (API doesn't expose it). Both are platform limitations, not bugs.

---

## Task 1 — Fix Instagram Video URL (CRITICAL)

### Problem
`src/domains/platforms/infrastructure/adapters/instagram-adapter.ts` line 198:
```typescript
video_url: content.filePath, // Must be a public URL in production
```

Instagram's Graph API requires `video_url` to be a publicly accessible URL. Currently `content.filePath` is an S3 object key (e.g. `content/user-1/abc/video.mp4`), not a URL. Publishing to Instagram will fail.

### Fix
Same pattern as TikTok/YouTube adapters:
1. Import `getPresignedDownloadUrl` from `s3-storage`
2. Generate a presigned URL from the S3 key before passing to the Graph API
3. Presigned URLs are valid for 1 hour (default), which is enough for Instagram to fetch the video

### Files
| File | Action |
|------|--------|
| `src/domains/platforms/infrastructure/adapters/instagram-adapter.ts` | **Modify** — replace `content.filePath` with presigned S3 URL |

---

## Task 2 — Add Platform Delete Methods (MEDIUM)

### Problem
`src/domains/publishing/application/publishing-orchestrator.ts` lines 320-322:
```typescript
// Platform-specific delete: adapters do not expose delete yet, so we
// mark as rolled back in DB and emit event. A delete API call would go here.
// e.g. await platformService.deletePost(platformAccount, pub.platformPostId);
```

The rollback feature (5-minute window after publish) only updates DB records — it never actually deletes the post from the platform. The `PlatformAdapter` interface doesn't include a `deletePost` method.

### Fix
1. Add `deletePost(account, platformPostId)` to the `PlatformAdapter` interface in `platform-adapter.ts`
2. Implement in each adapter:
   - **TikTok**: `POST /v2/post/delete/` with `publish_id`
   - **Instagram**: `DELETE /{media-id}` via Graph API
   - **YouTube**: `DELETE /youtube/v3/videos?id={videoId}`
3. Wire it into the rollback logic in `publishing-orchestrator.ts`

### Files
| File | Action |
|------|--------|
| `src/domains/platforms/domain/platform-adapter.ts` | **Modify** — add `deletePost` to interface |
| `src/domains/platforms/infrastructure/adapters/tiktok-adapter.ts` | **Modify** — implement `deletePost` |
| `src/domains/platforms/infrastructure/adapters/instagram-adapter.ts` | **Modify** — implement `deletePost` |
| `src/domains/platforms/infrastructure/adapters/youtube-adapter.ts` | **Modify** — implement `deletePost` |
| `src/domains/publishing/application/publishing-orchestrator.ts` | **Modify** — call adapter delete in rollback |

---

## Task 3 — Add Admin Check to Queue Stats (HIGH)

### Problem
`src/apps/api/routes/scheduling.ts` line 169:
```typescript
// In production: restrict to admin roles. Currently any authenticated user can view aggregate stats
```

The queue statistics endpoint (`GET /api/scheduling/stats`) returns aggregate job metrics across all users. Any authenticated user can access it — no role check.

### Fix
1. Check user role from session (add `role` field to JWT callback if not already present)
2. Return 403 if user is not an admin
3. Consider adding a simple `isAdmin` flag on the User model or a roles table

### Files
| File | Action |
|------|--------|
| `src/apps/api/routes/scheduling.ts` | **Modify** — add admin role check |

---

## Backlog

| Item | Priority | Notes |
|------|----------|-------|
| Replace SHA-256 password hash with bcrypt | MEDIUM | `src/apps/web/app/api/auth/[...nextauth]/route.ts` line 10 — SHA-256 is not suitable for passwords |
| Surface content optimization warnings | LOW | Publishing orchestrator computes warnings (truncated titles, reduced hashtags) but doesn't return them to the user |
| Add auth middleware for app routes | LOW | NextAuth JWT handles it, but explicit middleware could protect `/api/*` |
| Expand test coverage | LOW | Add tests for publishing-orchestrator, analytics-service, platform adapters |
