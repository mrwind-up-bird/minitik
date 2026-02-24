import { Platform, PublicationStatus } from "@prisma/client";

// ─── Per-platform publish result ──────────────────────────────────────────────

export interface PlatformPublishResult {
  platform: Platform;
  accountId: string;
  publicationId: string;
  success: boolean;
  platformPostId?: string;
  publishedAt?: Date;
  error?: string;
  rateLimitHit?: boolean;
  durationMs: number;
}

// ─── Aggregate result for a multi-platform publish run ────────────────────────

export type PublishOutcome = "success" | "partial" | "failed";

export interface PublishingResult {
  contentId: string;
  outcome: PublishOutcome;
  results: PlatformPublishResult[];
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  successCount: number;
  failureCount: number;
}

// ─── Rollback result ──────────────────────────────────────────────────────────

export interface RollbackResult {
  contentId: string;
  rolledBack: string[];   // platformPostIds successfully deleted
  failed: string[];       // platformPostIds that could not be rolled back
}

// ─── Status snapshot (read model) ────────────────────────────────────────────

export interface PublicationStatusSnapshot {
  publicationId: string;
  contentId: string;
  accountId: string;
  platform: Platform;
  status: PublicationStatus;
  platformPostId?: string | null;
  publishedAt?: Date | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function deriveOutcome(results: PlatformPublishResult[]): PublishOutcome {
  if (results.length === 0) return "failed";
  const successCount = results.filter((r) => r.success).length;
  if (successCount === 0) return "failed";
  if (successCount === results.length) return "success";
  return "partial";
}

export function buildPublishingResult(
  contentId: string,
  results: PlatformPublishResult[],
  startedAt: Date
): PublishingResult {
  const completedAt = new Date();
  const successCount = results.filter((r) => r.success).length;
  return {
    contentId,
    outcome: deriveOutcome(results),
    results,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    successCount,
    failureCount: results.length - successCount,
  };
}
