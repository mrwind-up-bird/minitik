# Social Media Account Connection Wizard

## Context

The `/accounts` page has a flat `AccountConnection` component with connect/disconnect/refresh buttons. The OAuth PKCE infrastructure is fully working (initiate, token exchange, encryption, refresh, platform adapters). Users get no guidance on setting up developer apps before connecting. We need a step-by-step wizard that wraps the existing OAuth flow with platform-specific setup instructions.

---

## Wizard Flow

1. **Step 1 — Choose Platform**: Cards for TikTok, Instagram, YouTube with branding. Shows already-connected badges. Disabled if 5-account limit reached.
2. **Step 2 — Setup Guide**: Platform-specific numbered instructions (create developer app, enable APIs, configure redirect URI, get credentials). Links to developer portals. Required scopes listed.
3. **Step 3 — Connect**: Summary + "Connect to {Platform}" button. Calls existing `POST /api/accounts/initiate`, stores PKCE params + `wizard_active` in sessionStorage, redirects to provider.
4. **Step 4 — Success**: Checkmark, connected account details, "Connect Another" or "Done" buttons.

OAuth return: On redirect back to `/accounts`, page detects `wizard_active` in sessionStorage and renders wizard at step 4 after re-fetching accounts.

---

## Files to Create (8)

### `src/apps/web/components/account/wizard/platform-config.ts`
Shared constants: `PLATFORM_LABELS`, `PLATFORM_COLORS`, `PROVIDER_TO_PLATFORM`, `OAuthProvider` type.

### `src/apps/web/components/account/wizard/step-indicator.tsx`
Horizontal step progress: 4 circles connected by lines. Violet for completed/current, neutral for future. Responsive (hides labels on mobile).

### `src/apps/web/components/account/wizard/platform-picker.tsx`
Step 1. Three cards in `grid-cols-1 sm:grid-cols-3`. Platform icon + name + description. Green "Connected" badge if already linked. Clickable unless at 5-account limit.

### `src/apps/web/components/account/wizard/platform-setup-guide.tsx`
Step 2. Contains `SETUP_GUIDES` constant with per-platform content:

- **TikTok** (developers.tiktok.com): Create app, enable Login Kit + Content Posting API, add redirect URI, copy Client Key. Scopes: `user.info.basic`, `video.list`, `video.upload`.
- **Instagram** (developers.facebook.com): Create Consumer app, add Instagram Basic Display, configure redirect, copy App ID/Secret. Scopes: `user_profile`, `user_media`.
- **YouTube** (console.cloud.google.com): Create project, enable YouTube Data API v3, create OAuth credentials, configure consent screen. Scopes: `youtube.upload`, `youtube.readonly`.

Each step rendered as numbered list with circles. Code blocks for redirect URIs (with copy button). Tips in amber callout. "Back" and "I've completed setup, continue" buttons.

### `src/apps/web/components/account/wizard/use-oauth-connect.ts`
Shared hook extracting OAuth initiation logic from `AccountConnection`. Returns `{ connecting, error, initiateConnect }`. Stores PKCE params + optional `wizard_active`/`wizard_provider` in sessionStorage before redirect.

### `src/apps/web/components/account/wizard/oauth-connect-step.tsx`
Step 3. Summary card with platform name. "You'll be redirected to {platform}" message. "Connect to {Platform}" button using `useOAuthConnect` hook. Loading/error states.

### `src/apps/web/components/account/wizard/connection-success.tsx`
Step 4. Green checkmark icon, "Account Connected!" heading, platform badge, username if available. "Connect Another Account" and "Done" buttons.

### `src/apps/web/components/account/connection-wizard.tsx`
Main orchestrator. Manages `step` and `selectedProvider` state. Renders `WizardStepIndicator` + current step component. Handles step transitions. Props: `connectedPlatforms`, `accountCount`, `onComplete`, `onCancel`.

---

## File to Modify (1)

### `src/app/(app)/accounts/page.tsx`
- Add `view` state: `"list" | "wizard"`
- On mount, check `sessionStorage.getItem("wizard_active")` — if present, set view to `"wizard"`
- In list view: existing `AccountConnection` + "Connect New Account" button (violet, top-right)
- In wizard view: `<ConnectionWizard>` with `onComplete` (refetch + switch to list) and `onCancel` (switch to list)
- Hide connect button if account limit reached

---

## Styling

Follow existing patterns throughout:
- Primary: `bg-violet-600 hover:bg-violet-700 text-white`
- Cards: `rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900`
- Errors: `bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400`
- Dark mode: every color has `dark:` variant
- Responsive: mobile-first with `sm:` breakpoints

---

## Verification
1. `npm run build` — zero errors
2. `/accounts` shows connected accounts + "Connect New Account" button
3. Wizard step 1 shows three platform cards with correct branding
4. Step 2 shows platform-specific instructions with developer portal links
5. Step 3 initiates OAuth redirect (requires valid platform credentials)
6. On OAuth return, step 4 shows success with account details
7. "Done" returns to account list with new account visible
8. sessionStorage cleaned up after wizard completes
