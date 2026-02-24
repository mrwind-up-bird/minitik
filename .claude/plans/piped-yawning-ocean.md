# Social Media Account Integration Wizards

## Context

minitik has a complete OAuth PKCE infrastructure (token encryption, refresh, rate limiting, circuit breakers, platform adapters) but the actual connection flow is broken: the OAuth redirect URIs point to `/api/accounts/callback/{platform}` which **don't exist**. The frontend has simple connect buttons but no guided setup flow. Users who haven't configured their developer credentials get no guidance.

**Goal:** Build step-by-step connection wizards for TikTok, Instagram, and YouTube that guide users from developer setup through OAuth connection to verification, and fix the missing callback handler.

---

## Architecture Overview

### Current Flow (broken)
1. Click "Connect TikTok" → POST `/api/accounts/initiate` → get `authorizationUrl`
2. Store `codeVerifier` + `state` in sessionStorage
3. Redirect to TikTok OAuth
4. TikTok redirects to `/api/accounts/callback/tiktok` → **404 (doesn't exist)**

### New Flow (wizard)
1. User opens `/accounts/connect` → wizard Step 1: pick platform
2. Step 2: setup guide (developer portal instructions, links, required env vars)
3. Step 3: click "Connect" → initiates OAuth → redirects to provider
4. Provider redirects to `/accounts/connect/callback?code=X&state=Y` (client page)
5. Callback page reads `state` from URL → retrieves `provider` + `codeVerifier` from sessionStorage
6. POSTs to `POST /api/accounts/connect` → server exchanges code, fetches user profile, encrypts tokens, saves account
7. Redirect to wizard Step 4: success confirmation with account details

---

## Files to Change

### NEW Files

#### 1. `src/app/(app)/accounts/connect/page.tsx` — Connection Wizard (~250 lines)
Multi-step wizard with 4 steps:
- **Step 1: Choose Platform** — Cards for TikTok, Instagram, YouTube. Show which are already connected. Disable if at limit (5).
- **Step 2: Setup Guide** — Platform-specific instructions with:
  - TikTok: Link to https://developers.tiktok.com/, steps to create app, enable Login Kit + Content Posting API, add redirect URI, get Client Key/Secret
  - Instagram: Link to https://developers.facebook.com/, create Consumer app, add Instagram Basic Display, configure redirect, get App ID/Secret
  - YouTube: Link to https://console.cloud.google.com/, enable YouTube Data API v3, create OAuth credentials, configure consent screen, add redirect URI, get Client ID/Secret
  - Each shows the exact redirect URI to register: `{NEXTAUTH_URL}/accounts/connect/callback`
  - Collapsible "I've already set this up" option to skip
- **Step 3: Connect** — Button that initiates OAuth. Shows loading state during redirect.
- **Step 4: Success/Error** — Reached via redirect from callback page. Shows connected account details or error message.

UI: Use existing Tailwind patterns (violet-600 primary, rounded-xl cards, dark mode support). Horizontal step indicator at top.

#### 2. `src/app/(app)/accounts/connect/callback/page.tsx` — OAuth Callback Handler (~80 lines)
Client page that:
- Reads `code` and `state` from URL search params
- Retrieves `codeVerifier` and `provider` from sessionStorage (keyed by `state`)
- Shows a loading spinner ("Connecting your account...")
- POSTs to `/api/accounts/connect` with `{ provider, code, codeVerifier }`
- On success: redirects to `/accounts/connect?step=success&platform={PLATFORM}`
- On error: redirects to `/accounts/connect?step=error&message={error}`
- Cleans up sessionStorage entries

#### 3. `src/app/api/accounts/connect/route.ts` — Server-side Connect Endpoint (~15 lines)
Thin route file that calls the new `handleConnectWithCode` handler.

#### 4. `src/domains/accounts/infrastructure/platform-user-info.ts` — Fetch User Profile (~90 lines)
New module that fetches user info from each platform using an access token:
- `fetchPlatformUserInfo(provider, accessToken)` → `{ platformAccountId, platformUsername }`
- TikTok: GET `https://open.tiktokapis.com/v2/user/info/` with Bearer token → extract `open_id` and `display_name`
- Instagram: GET `https://graph.instagram.com/v19.0/me?fields=id,username` → extract `id` and `username`
- YouTube: GET `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true` → extract `channelId` and `title`

### MODIFIED Files

#### 5. `src/domains/accounts/application/account-service.ts` — Add `connectWithCode()` (~30 lines added)
New function that combines: code exchange → user info fetch → account save.
```typescript
export async function connectWithCode(params: {
  userId: string;
  provider: OAuthProvider;
  code: string;
  codeVerifier: string;
}): Promise<AccountSummary>
```
Internally calls `exchangeCodeForTokens()` → `fetchPlatformUserInfo()` → existing `connectAccount()` logic (upsert with encrypted tokens).

#### 6. `src/apps/api/routes/accounts.ts` — Add `handleConnectWithCode` handler (~30 lines)
New handler that validates `{ provider, code, codeVerifier }` (no `platformAccountId` required) and calls `connectWithCode()`.

#### 7. `src/domains/accounts/infrastructure/oauth-providers.ts` — Update redirect URIs (~3 lines)
Change all three redirect URIs from `/api/accounts/callback/{platform}` to `/accounts/connect/callback`.

#### 8. `src/app/(app)/accounts/page.tsx` — Add "Connect Account" button linking to wizard (~5 lines)
Replace inline connect buttons with a link to `/accounts/connect`.

#### 9. `src/apps/web/components/account/account-connection.tsx` — Replace connect section (~10 lines)
Replace the inline "Connect a platform" buttons section with a single "Connect New Account" link to `/accounts/connect`.

---

## Platform Setup Guides (content for Step 2)

### TikTok
1. Go to [TikTok Developer Portal](https://developers.tiktok.com/)
2. Create a new app (or select existing)
3. Under **Products**, enable **Login Kit** and **Content Posting API**
4. Under **Configuration**, add redirect URI: `{your-domain}/accounts/connect/callback`
5. Copy your **Client Key** and **Client Secret**
6. Set in `.env`: `TIKTOK_CLIENT_ID=<client_key>` and `TIKTOK_CLIENT_SECRET=<secret>`
7. Note: App must be approved for "Content Posting API" scope to publish videos

### Instagram
1. Go to [Meta Developer Console](https://developers.facebook.com/)
2. Create a new app (type: **Consumer**)
3. Add the **Instagram Basic Display** product
4. Under **Instagram Basic Display > Basic Display**, add redirect URI: `{your-domain}/accounts/connect/callback`
5. Copy your **Instagram App ID** and **Instagram App Secret**
6. Set in `.env`: `INSTAGRAM_CLIENT_ID=<app_id>` and `INSTAGRAM_CLIENT_SECRET=<secret>`
7. Note: For Reels publishing, app needs **Instagram Content Publishing** permission (requires App Review)

### YouTube
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **YouTube Data API v3** under APIs & Services
4. Under **Credentials**, create an **OAuth 2.0 Client ID** (type: Web application)
5. Add authorized redirect URI: `{your-domain}/accounts/connect/callback`
6. Configure the **OAuth consent screen** (External, add youtube.upload and youtube.readonly scopes)
7. Copy **Client ID** and **Client Secret**
8. Set in `.env`: `YOUTUBE_CLIENT_ID=<client_id>` and `YOUTUBE_CLIENT_SECRET=<secret>`
9. Note: While in "Testing" mode, only test users added to the consent screen can connect

---

## Team Structure

Three parallel work streams:

### Agent 1: Backend (general-purpose, worktree)
- Create `platform-user-info.ts` (fetch user profiles from each platform)
- Add `connectWithCode()` to `account-service.ts`
- Add `handleConnectWithCode` to `accounts.ts` route handler
- Create `src/app/api/accounts/connect/route.ts`
- Update redirect URIs in `oauth-providers.ts`

### Agent 2: Frontend (general-purpose, worktree)
- Build the connection wizard page (`accounts/connect/page.tsx`)
- Build the callback handler page (`accounts/connect/callback/page.tsx`)
- Update `accounts/page.tsx` and `account-connection.tsx` to link to wizard
- Include setup guides content and step indicator UI

### Agent 3: Security Review + Build Verification
- Review all new code for security issues (CSRF, token handling, XSS)
- Verify `npm run build` passes
- Check that sessionStorage cleanup happens properly
- Verify error handling covers all edge cases

---

## Verification
1. `npm run build` — zero errors
2. Navigate to `/accounts` → see "Connect New Account" button
3. Click → opens wizard at `/accounts/connect`
4. Select TikTok → see setup guide with developer portal link
5. Click "Connect" → redirected to TikTok OAuth (requires valid credentials)
6. After OAuth → callback page exchanges code → success step shows account
7. Back at `/accounts` → new account visible in list
8. Repeat for Instagram and YouTube
9. Security: sessionStorage cleaned after callback, tokens encrypted in DB, PKCE verified
