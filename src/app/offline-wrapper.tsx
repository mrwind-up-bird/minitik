"use client";

import { useOfflineSync } from "@/apps/web/hooks/use-offline-sync";
import { OfflineIndicator } from "@/apps/web/components/mobile/offline-indicator";

export function OfflineWrapper() {
  const { isOnline, isSyncing, pendingDrafts, pendingActions, lastSyncedAt, triggerSync } =
    useOfflineSync();

  return (
    <OfflineIndicator
      isOnline={isOnline}
      isSyncing={isSyncing}
      pendingDrafts={pendingDrafts}
      pendingActions={pendingActions}
      lastSyncedAt={lastSyncedAt}
      onSyncClick={triggerSync}
    />
  );
}
