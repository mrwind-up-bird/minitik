/**
 * Sync Manager
 *
 * Coordinates background synchronisation when the device comes back online:
 *   1. Replay queued API actions (creates/updates/deletes queued while offline)
 *   2. Upload offline drafts to the server
 *   3. Register the Service Worker Background Sync API where available
 *
 * This module is browser-only.
 */

import {
  listQueuedActions,
  dequeueAction,
  updateQueuedActionAttempt,
  listUnsyncedDrafts,
  markDraftSynced,
  QueuedAction,
  OfflineDraft,
} from "./offline-storage";

const MAX_ATTEMPTS = 5;
const BG_SYNC_TAG = "minitik-bg-sync";

// ─── Service Worker registration ──────────────────────────────────────────────

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    // Listen for SW messages (e.g. SW_SYNC_READY from background sync event)
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_SYNC_READY") {
        runSync().catch(console.error);
      }
    });

    return registration;
  } catch (err) {
    console.error("[sync-manager] SW registration failed:", err);
    return null;
  }
}

/** Request a background sync via the SW Background Sync API. */
export async function requestBackgroundSync(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if ("sync" in registration) {
      await (registration as ServiceWorkerRegistration & {
        sync: { register: (tag: string) => Promise<void> };
      }).sync.register(BG_SYNC_TAG);
    }
  } catch {
    // Background sync not supported; fall back to online event handler
  }
}

// ─── Core sync logic ──────────────────────────────────────────────────────────

export interface SyncResult {
  actionsReplayed: number;
  actionsFailed: number;
  draftsUploaded: number;
  draftsFailed: number;
}

/**
 * Run a full sync cycle. Safe to call multiple times — concurrent calls
 * are serialised via a module-level lock.
 */
let syncInProgress = false;

export async function runSync(): Promise<SyncResult> {
  if (syncInProgress) return { actionsReplayed: 0, actionsFailed: 0, draftsUploaded: 0, draftsFailed: 0 };
  syncInProgress = true;

  try {
    const [actionResult, draftResult] = await Promise.all([
      replayQueuedActions(),
      uploadOfflineDrafts(),
    ]);

    return { ...actionResult, ...draftResult };
  } finally {
    syncInProgress = false;
  }
}

// ─── Queued action replay ─────────────────────────────────────────────────────

async function replayQueuedActions(): Promise<{
  actionsReplayed: number;
  actionsFailed: number;
}> {
  const actions = await listQueuedActions();
  let replayed = 0;
  let failed = 0;

  for (const action of actions) {
    if (action.attempts >= MAX_ATTEMPTS) {
      // Too many retries — discard to avoid infinite loop
      await dequeueAction(action.id);
      failed++;
      continue;
    }

    const success = await replayAction(action);
    if (success) {
      await dequeueAction(action.id);
      replayed++;
    } else {
      await updateQueuedActionAttempt(action.id, "network error");
      failed++;
    }
  }

  return { actionsReplayed: replayed, actionsFailed: failed };
}

async function replayAction(action: QueuedAction): Promise<boolean> {
  try {
    const response = await fetch(action.url, {
      method: action.method,
      headers: {
        "Content-Type": "application/json",
        ...(action.headers ?? {}),
      },
      body: action.body !== undefined ? JSON.stringify(action.body) : undefined,
    });

    // 2xx or 4xx (client errors we can't fix) → consider handled
    return response.ok || (response.status >= 400 && response.status < 500);
  } catch {
    return false;
  }
}

// ─── Offline draft upload ─────────────────────────────────────────────────────

async function uploadOfflineDrafts(): Promise<{
  draftsUploaded: number;
  draftsFailed: number;
}> {
  const drafts = await listUnsyncedDrafts();
  let uploaded = 0;
  let failed = 0;

  for (const draft of drafts) {
    const serverId = await pushDraftToServer(draft);
    if (serverId) {
      await markDraftSynced(draft.id, serverId);
      uploaded++;
    } else {
      failed++;
    }
  }

  return { draftsUploaded: uploaded, draftsFailed: failed };
}

async function pushDraftToServer(draft: OfflineDraft): Promise<string | null> {
  try {
    const response = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        description: draft.description,
        scheduledAt: draft.scheduledAt,
        offlineDraftId: draft.id,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return (data as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

// ─── Online/offline event wiring ──────────────────────────────────────────────

/**
 * Attach window online/offline listeners. Returns a cleanup function.
 * Call this once in a top-level layout component.
 */
export function attachConnectivityListeners(
  onOnline?: (result: SyncResult) => void,
  onOffline?: () => void
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleOnline = () => {
    runSync().then(onOnline).catch(console.error);
    requestBackgroundSync().catch(console.error);
  };

  const handleOffline = () => {
    onOffline?.();
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

export { BG_SYNC_TAG };
