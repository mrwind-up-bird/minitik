"use client";

import React from "react";

interface OfflineIndicatorProps {
  isOnline: boolean;
  isSyncing?: boolean;
  pendingActions?: number;
  pendingDrafts?: number;
  lastSyncedAt?: Date | null;
  onSyncClick?: () => void;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * A compact status bar that appears at the top of the screen when the device
 * is offline, syncing, or has pending items to upload.
 *
 * When online with no pending items it renders nothing (zero DOM overhead).
 */
export function OfflineIndicator({
  isOnline,
  isSyncing = false,
  pendingActions = 0,
  pendingDrafts = 0,
  lastSyncedAt,
  onSyncClick,
}: OfflineIndicatorProps) {
  const hasPending = pendingActions > 0 || pendingDrafts > 0;

  // Fully online and no pending — render nothing
  if (isOnline && !isSyncing && !hasPending) return null;

  const isOffline = !isOnline;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        "w-full px-4 py-2 flex items-center justify-between gap-3 text-sm",
        "transition-colors duration-300",
        isOffline
          ? "bg-neutral-800 text-neutral-100"
          : isSyncing
          ? "bg-violet-600 text-white"
          : "bg-amber-500 text-white",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Status icon */}
        {isOffline ? (
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M3.28 2.22a.75.75 0 00-1.06 1.06L5.44 6.5H3.75A2.75 2.75 0 001 9.25v1.5A2.75 2.75 0 003.75 13.5H4v.25A2.25 2.25 0 006.25 16h7.5A2.25 2.25 0 0016 13.75v-.25h.25A2.75 2.75 0 0019 10.75v-1.5A2.75 2.75 0 0016.25 6.5h-1.69l-1.72-1.72A8.014 8.014 0 0010 4a7.954 7.954 0 00-5.28 1.97L3.28 2.22zm5.9 5.9l5.1 5.1H6.25a.75.75 0 01-.75-.75V12.5h.5A2.75 2.75 0 008.75 9.75V9.5a.75.75 0 01.43-.68zM10 5.5c.65 0 1.28.1 1.87.28L4.75 12.9V9.25c0-.69.56-1.25 1.25-1.25h1.5V7.75C7.5 6.51 8.64 5.5 10 5.5z"
              clipRule="evenodd"
            />
          </svg>
        ) : isSyncing ? (
          <svg
            className="h-4 w-4 shrink-0 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        ) : (
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        )}

        {/* Message */}
        <span className="truncate font-medium">
          {isOffline
            ? "You're offline — changes will sync when reconnected"
            : isSyncing
            ? "Syncing…"
            : `${pendingDrafts + pendingActions} item${pendingDrafts + pendingActions !== 1 ? "s" : ""} pending sync`}
        </span>

        {/* Last synced */}
        {isOnline && lastSyncedAt && !isSyncing && (
          <span className="hidden sm:inline-block text-xs opacity-75 shrink-0">
            Last synced {timeAgo(lastSyncedAt)}
          </span>
        )}
      </div>

      {/* Sync now button */}
      {isOnline && !isSyncing && hasPending && onSyncClick && (
        <button
          type="button"
          onClick={onSyncClick}
          className="shrink-0 rounded-md bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
          style={{ minHeight: "44px", minWidth: "44px" }}
        >
          Sync now
        </button>
      )}
    </div>
  );
}
