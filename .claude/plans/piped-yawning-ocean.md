# Next Up — Cleanup & Platform Adapter Completion

## Completed
- Dashboard stats: real counts for drafts/scheduled/published
- Publishing pipeline: job processor calls real platform adapters
- Connection wizard: 4-step UI (platform picker, setup guide, OAuth connect, success)
- OAuth callback route: `/api/accounts/callback/[provider]` handles provider redirects
- Platform user info: auto-fetches user profile after token exchange
- Route auth: all 6 route handlers use `getServerSession` (no more fake `x-user-id`)

---

## Task 1 — Deduplicate NextAuth Config (LOW)

### Problem
Two identical NextAuth config files exist:
- `src/app/api/auth/[...nextauth]/route.ts` — active app router route
- `src/apps/web/app/api/auth/[...nextauth]/route.ts` — duplicate, but this is the one all route handlers import from

All 6 route handlers import `authOptions` from `@/apps/web/app/api/auth/[...nextauth]/route`. The file at `src/app/api/auth/` is the older duplicate that can be removed.

### Fix
Delete `src/app/api/auth/[...nextauth]/route.ts`. The canonical auth config lives at `src/apps/web/app/api/auth/[...nextauth]/route.ts` and is already correctly referenced everywhere.

### Files
| File | Action |
|------|--------|
| `src/app/api/auth/[...nextauth]/route.ts` | **Delete** |

---

## Task 2 — TikTok Video Upload (MEDIUM)

### Problem
`src/domains/platforms/infrastructure/adapters/tiktok-adapter.ts` line ~179 only calls `/v2/post/publish/video/init/` to initiate an upload but never streams the actual video file. Comments say:
```
// Real implementation would:
// 1. Upload video to TikTok via their upload URL
// 2. Poll for upload completion
// 3. Publish with caption/privacy settings
```

### Fix
Complete the `callTikTokPublishApi` method:
1. Call init endpoint to get `upload_url`
2. Stream video file from S3 to TikTok's upload URL
3. Poll publish status until complete or failed
4. Return real `platformPostId` from response

---

## Task 3 — TikTok Analytics (MEDIUM)

### Problem
`src/domains/platforms/infrastructure/adapters/tiktok-adapter.ts` line ~93:
```typescript
// Stub — replace with real TikTok Research API call
return { platformPostId, views: 0, likes: 0, comments: 0, shares: 0, fetchedAt: new Date() };
```

### Fix
Implement real TikTok Research API call to fetch video metrics (views, likes, comments, shares) for a given `platformPostId`.

---

## Task 4 — ffmpeg Thumbnail Generation (LOW)

### Problem
`src/domains/content/infrastructure/video-processor.ts` line ~212:
```typescript
throw new Error("ffmpeg thumbnail generation not yet implemented");
```

Called from `generateThumbnail()` which has a try/catch wrapper that gracefully returns `{ generated: false }` on failure, so this doesn't crash the app — thumbnails just never generate.

### Fix
Implement the function:
1. Get presigned URL for the video from S3
2. Run `ffmpeg -ss <timestamp> -i <url> -frames:v 1 -q:v 2 output.jpg`
3. Upload resulting JPEG to the thumbnail S3 key

---

## Backlog

| Item | Notes |
|------|-------|
| No test suite | Project has zero tests — no `.test.ts` or `.spec.ts` files |
| Instagram/YouTube adapter stubs | May have similar incomplete sections (not yet audited in detail) |

---

## Verification
1. `npm run build` — zero errors
2. After Task 1: auth still works, no broken imports
3. After Task 2: TikTok publish job uploads real video, returns `platformPostId`
4. After Task 3: Analytics page shows real TikTok metrics
5. After Task 4: Uploaded videos get auto-generated thumbnails
