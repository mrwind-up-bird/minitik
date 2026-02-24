"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  attachConnectivityListeners,
  registerServiceWorker,
  runSync,
  SyncResult,
} from "@/shared/infrastructure/pwa/sync-manager";
import {
  saveDraft,
  enqueueAction,
  getStorageStats,
  OfflineDraft,
  QueuedAction,
} from "@/shared/infrastructure/pwa/offline-storage";

export interface OfflineSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  pendingDrafts: number;
  pendingActions: number;
  lastSyncResult: SyncResult | null;
  lastSyncError: string | null;
}

export interface OfflineSyncActions {
  /** Save a content draft to IndexedDB. */
  saveDraftOffline: (draft: OfflineDraft) => Promise<void>;
  /** Queue an API action to be replayed when back online. */
  queueAction: (action: Omit<QueuedAction, "id" | "queuedAt" | "attempts">) => Promise<void>;
  /** Manually trigger a sync cycle. */
  triggerSync: () => Promise<void>;
}

export function useOfflineSync(): OfflineSyncState & OfflineSyncActions {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState(0);
  const [pendingActions, setPendingActions] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const isMounted = useRef(true);

  const refreshStats = useCallback(async () => {
    try {
      const stats = await getStorageStats();
      if (!isMounted.current) return;
      setPendingDrafts(stats.unsyncedDrafts);
      setPendingActions(stats.queuedActions);
    } catch {
      // IndexedDB unavailable in some contexts (SSR, private mode)
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    setLastSyncError(null);
    try {
      const result = await runSync();
      if (!isMounted.current) return;
      setLastSyncResult(result);
      setLastSyncedAt(new Date());
      await refreshStats();
    } catch (err) {
      if (!isMounted.current) return;
      setLastSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      if (isMounted.current) setIsSyncing(false);
    }
  }, [isSyncing, isOnline, refreshStats]);

  const saveDraftOffline = useCallback(async (draft: OfflineDraft) => {
    await saveDraft(draft);
    await refreshStats();
  }, [refreshStats]);

  const queueAction = useCallback(
    async (action: Omit<QueuedAction, "id" | "queuedAt" | "attempts">) => {
      await enqueueAction(action);
      await refreshStats();
    },
    [refreshStats]
  );

  // Register SW and attach connectivity listeners on mount
  useEffect(() => {
    isMounted.current = true;

    registerServiceWorker().catch(console.error);
    refreshStats();

    const cleanup = attachConnectivityListeners(
      (result) => {
        if (!isMounted.current) return;
        setIsOnline(true);
        setIsSyncing(false);
        setLastSyncResult(result);
        setLastSyncedAt(new Date());
        refreshStats();
      },
      () => {
        if (!isMounted.current) return;
        setIsOnline(false);
      }
    );

    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, [refreshStats]);

  // Poll storage stats every 30s when online to reflect changes from other tabs
  useEffect(() => {
    if (!isOnline) return;
    const id = setInterval(refreshStats, 30_000);
    return () => clearInterval(id);
  }, [isOnline, refreshStats]);

  return {
    isOnline,
    isSyncing,
    lastSyncedAt,
    pendingDrafts,
    pendingActions,
    lastSyncResult,
    lastSyncError,
    saveDraftOffline,
    queueAction,
    triggerSync,
  };
}
