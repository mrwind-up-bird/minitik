import { Platform, PublicationStatus } from "@prisma/client";

// ─── Event type constants ─────────────────────────────────────────────────────

export const PUBLISHING_EVENT_TYPES = {
  STARTED: "publishing:started",
  PLATFORM_QUEUED: "publishing:platform_queued",
  PLATFORM_PUBLISHING: "publishing:platform_publishing",
  PLATFORM_SUCCESS: "publishing:platform_success",
  PLATFORM_FAILED: "publishing:platform_failed",
  COMPLETED: "publishing:completed",
  ROLLED_BACK: "publishing:rolled_back",
} as const;

export type PublishingEventType =
  (typeof PUBLISHING_EVENT_TYPES)[keyof typeof PUBLISHING_EVENT_TYPES];

// ─── Event shapes ─────────────────────────────────────────────────────────────

export interface PublishingStartedEvent {
  type: typeof PUBLISHING_EVENT_TYPES.STARTED;
  contentId: string;
  accountIds: string[];
  startedAt: string; // ISO
}

export interface PlatformQueuedEvent {
  type: typeof PUBLISHING_EVENT_TYPES.PLATFORM_QUEUED;
  contentId: string;
  publicationId: string;
  platform: Platform;
  accountId: string;
}

export interface PlatformPublishingEvent {
  type: typeof PUBLISHING_EVENT_TYPES.PLATFORM_PUBLISHING;
  contentId: string;
  publicationId: string;
  platform: Platform;
  accountId: string;
}

export interface PlatformSuccessEvent {
  type: typeof PUBLISHING_EVENT_TYPES.PLATFORM_SUCCESS;
  contentId: string;
  publicationId: string;
  platform: Platform;
  accountId: string;
  platformPostId?: string;
  publishedAt: string; // ISO
  durationMs: number;
}

export interface PlatformFailedEvent {
  type: typeof PUBLISHING_EVENT_TYPES.PLATFORM_FAILED;
  contentId: string;
  publicationId: string;
  platform: Platform;
  accountId: string;
  error: string;
  rateLimitHit?: boolean;
}

export interface PublishingCompletedEvent {
  type: typeof PUBLISHING_EVENT_TYPES.COMPLETED;
  contentId: string;
  outcome: "success" | "partial" | "failed";
  successCount: number;
  failureCount: number;
  durationMs: number;
}

export interface PublishingRolledBackEvent {
  type: typeof PUBLISHING_EVENT_TYPES.ROLLED_BACK;
  contentId: string;
  rolledBack: string[];
  failed: string[];
}

export type PublishingEvent =
  | PublishingStartedEvent
  | PlatformQueuedEvent
  | PlatformPublishingEvent
  | PlatformSuccessEvent
  | PlatformFailedEvent
  | PublishingCompletedEvent
  | PublishingRolledBackEvent;

// ─── Serialization helpers ────────────────────────────────────────────────────

export function serializePublishingEvent(event: PublishingEvent): string {
  return JSON.stringify(event);
}

export function parsePublishingEvent(raw: string): PublishingEvent {
  return JSON.parse(raw) as PublishingEvent;
}

// ─── Builder helpers ──────────────────────────────────────────────────────────

export function buildStartedEvent(
  contentId: string,
  accountIds: string[]
): PublishingStartedEvent {
  return {
    type: PUBLISHING_EVENT_TYPES.STARTED,
    contentId,
    accountIds,
    startedAt: new Date().toISOString(),
  };
}

export function buildPlatformQueuedEvent(
  contentId: string,
  publicationId: string,
  platform: Platform,
  accountId: string
): PlatformQueuedEvent {
  return {
    type: PUBLISHING_EVENT_TYPES.PLATFORM_QUEUED,
    contentId,
    publicationId,
    platform,
    accountId,
  };
}

export function buildPlatformPublishingEvent(
  contentId: string,
  publicationId: string,
  platform: Platform,
  accountId: string
): PlatformPublishingEvent {
  return {
    type: PUBLISHING_EVENT_TYPES.PLATFORM_PUBLISHING,
    contentId,
    publicationId,
    platform,
    accountId,
  };
}

export function buildPlatformSuccessEvent(
  contentId: string,
  publicationId: string,
  platform: Platform,
  accountId: string,
  durationMs: number,
  platformPostId?: string
): PlatformSuccessEvent {
  return {
    type: PUBLISHING_EVENT_TYPES.PLATFORM_SUCCESS,
    contentId,
    publicationId,
    platform,
    accountId,
    platformPostId,
    publishedAt: new Date().toISOString(),
    durationMs,
  };
}

export function buildPlatformFailedEvent(
  contentId: string,
  publicationId: string,
  platform: Platform,
  accountId: string,
  error: string,
  rateLimitHit?: boolean
): PlatformFailedEvent {
  return {
    type: PUBLISHING_EVENT_TYPES.PLATFORM_FAILED,
    contentId,
    publicationId,
    platform,
    accountId,
    error,
    rateLimitHit,
  };
}

export function buildCompletedEvent(
  contentId: string,
  outcome: "success" | "partial" | "failed",
  successCount: number,
  failureCount: number,
  durationMs: number
): PublishingCompletedEvent {
  return {
    type: PUBLISHING_EVENT_TYPES.COMPLETED,
    contentId,
    outcome,
    successCount,
    failureCount,
    durationMs,
  };
}

export function buildRolledBackEvent(
  contentId: string,
  rolledBack: string[],
  failed: string[]
): PublishingRolledBackEvent {
  return {
    type: PUBLISHING_EVENT_TYPES.ROLLED_BACK,
    contentId,
    rolledBack,
    failed,
  };
}

/**
 * In-process event emitter registry.
 * The WebSocket server layer subscribes here and forwards events to connected clients.
 */
type EventHandler = (event: PublishingEvent) => void;
const handlers = new Map<string, Set<EventHandler>>();

export function subscribeToContent(contentId: string, handler: EventHandler): () => void {
  if (!handlers.has(contentId)) handlers.set(contentId, new Set());
  handlers.get(contentId)!.add(handler);
  return () => {
    handlers.get(contentId)?.delete(handler);
    if (handlers.get(contentId)?.size === 0) handlers.delete(contentId);
  };
}

export function emitPublishingEvent(event: PublishingEvent): void {
  const contentId = "contentId" in event ? event.contentId : undefined;
  if (!contentId) return;
  handlers.get(contentId)?.forEach((h) => {
    try {
      h(event);
    } catch {
      // individual handler errors must not break the loop
    }
  });
}
