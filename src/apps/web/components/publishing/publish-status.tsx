"use client";

import { useEffect, useRef, useState } from "react";
import { Platform, PublicationStatus } from "@prisma/client";
import {
  PublishingEvent,
  PUBLISHING_EVENT_TYPES,
  parsePublishingEvent,
} from "@/shared/infrastructure/websocket/publishing-events";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformPublicationState {
  publicationId: string;
  platform: Platform;
  accountId: string;
  status: "queued" | "publishing" | "success" | "failed";
  platformPostId?: string;
  publishedAt?: string;
  error?: string;
  durationMs?: number;
}

interface PublishStatusProps {
  contentId: string;
  /** Initial list of publications from server (SSR). Can be empty for live-only mode. */
  initialPublications?: Array<{
    publicationId: string;
    platform: Platform;
    accountId: string;
    status: PublicationStatus;
    platformPostId?: string | null;
    publishedAt?: Date | null;
    error?: string | null;
  }>;
  /** Called when all platforms finish (success or fail) */
  onComplete?: (outcome: "success" | "partial" | "failed") => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<Platform, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
};

const STATUS_COLORS: Record<PlatformPublicationState["status"], string> = {
  queued: "text-gray-500",
  publishing: "text-blue-600",
  success: "text-green-600",
  failed: "text-red-600",
};

const STATUS_LABELS: Record<PlatformPublicationState["status"], string> = {
  queued: "Queued",
  publishing: "Publishing...",
  success: "Published",
  failed: "Failed",
};

function dbStatusToLocal(status: PublicationStatus): PlatformPublicationState["status"] {
  switch (status) {
    case "QUEUED": return "queued";
    case "PUBLISHING": return "publishing";
    case "PUBLISHED": return "success";
    case "FAILED": return "failed";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PublishStatus({
  contentId,
  initialPublications = [],
  onComplete,
}: PublishStatusProps) {
  const [platforms, setPlatforms] = useState<PlatformPublicationState[]>(
    initialPublications.map((p) => ({
      publicationId: p.publicationId,
      platform: p.platform,
      accountId: p.accountId,
      status: dbStatusToLocal(p.status),
      platformPostId: p.platformPostId ?? undefined,
      publishedAt: p.publishedAt?.toISOString(),
      error: p.error ?? undefined,
    }))
  );
  const [outcome, setOutcome] = useState<"success" | "partial" | "failed" | null>(null);
  const [isLive, setIsLive] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to SSE endpoint for real-time updates
    const es = new EventSource(`/api/publishing/${contentId}/events`);
    esRef.current = es;
    setIsLive(true);

    es.onmessage = (msgEvent) => {
      try {
        const event: PublishingEvent = parsePublishingEvent(msgEvent.data);
        handleEvent(event);
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      setIsLive(false);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [contentId]);

  function handleEvent(event: PublishingEvent) {
    switch (event.type) {
      case PUBLISHING_EVENT_TYPES.PLATFORM_QUEUED:
        setPlatforms((prev) => {
          const exists = prev.find((p) => p.publicationId === event.publicationId);
          if (exists) return prev;
          return [
            ...prev,
            {
              publicationId: event.publicationId,
              platform: event.platform,
              accountId: event.accountId,
              status: "queued",
            },
          ];
        });
        break;

      case PUBLISHING_EVENT_TYPES.PLATFORM_PUBLISHING:
        setPlatforms((prev) =>
          prev.map((p) =>
            p.publicationId === event.publicationId
              ? { ...p, status: "publishing" }
              : p
          )
        );
        break;

      case PUBLISHING_EVENT_TYPES.PLATFORM_SUCCESS:
        setPlatforms((prev) =>
          prev.map((p) =>
            p.publicationId === event.publicationId
              ? {
                  ...p,
                  status: "success",
                  platformPostId: event.platformPostId,
                  publishedAt: event.publishedAt,
                  durationMs: event.durationMs,
                }
              : p
          )
        );
        break;

      case PUBLISHING_EVENT_TYPES.PLATFORM_FAILED:
        setPlatforms((prev) =>
          prev.map((p) =>
            p.publicationId === event.publicationId
              ? { ...p, status: "failed", error: event.error }
              : p
          )
        );
        break;

      case PUBLISHING_EVENT_TYPES.COMPLETED:
        setOutcome(event.outcome);
        setIsLive(false);
        esRef.current?.close();
        onComplete?.(event.outcome);
        break;

      default:
        break;
    }
  }

  const allDone =
    platforms.length > 0 &&
    platforms.every((p) => p.status === "success" || p.status === "failed");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Publishing Status</h3>
        {isLive && (
          <span className="flex items-center gap-1.5 text-xs text-blue-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Live
          </span>
        )}
      </div>

      {platforms.length === 0 && (
        <p className="text-sm text-gray-500">Waiting for publishing to start…</p>
      )}

      <ul className="space-y-2">
        {platforms.map((p) => (
          <li
            key={p.publicationId}
            className="flex items-start justify-between rounded-lg border p-3"
          >
            <div className="flex items-center gap-2">
              {p.status === "publishing" && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              )}
              <span className="text-sm font-medium">{PLATFORM_LABELS[p.platform]}</span>
            </div>
            <div className="text-right">
              <p className={`text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                {STATUS_LABELS[p.status]}
              </p>
              {p.status === "success" && p.platformPostId && (
                <p className="text-xs text-gray-400">ID: {p.platformPostId}</p>
              )}
              {p.status === "success" && p.durationMs && (
                <p className="text-xs text-gray-400">{(p.durationMs / 1000).toFixed(1)}s</p>
              )}
              {p.status === "failed" && p.error && (
                <p className="max-w-48 text-xs text-red-500">{p.error}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {allDone && outcome && (
        <div
          className={`rounded-lg border p-3 text-sm font-medium ${
            outcome === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : outcome === "partial"
                ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {outcome === "success" && "All platforms published successfully."}
          {outcome === "partial" && "Published to some platforms. Check individual statuses."}
          {outcome === "failed" && "Publishing failed on all platforms."}
        </div>
      )}
    </div>
  );
}
