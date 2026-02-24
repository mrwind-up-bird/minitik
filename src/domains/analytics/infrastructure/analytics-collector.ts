import { prisma } from "../../../shared/infrastructure/database/postgres";
import { upsertAnalyticsPoint } from "./analytics-repository";
import type { AnalyticsData } from "../../platforms/domain/platform-adapter";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CollectionResult {
  collected: number;
  failed: number;
  errors: string[];
}

// ─── Engagement rate calculation ──────────────────────────────────────────────

function calcEngagementRate(data: AnalyticsData): number {
  if (data.views === 0) return 0;
  const interactions = data.likes + data.comments + data.shares;
  return parseFloat(((interactions / data.views) * 100).toFixed(4));
}

// ─── Core collection logic ────────────────────────────────────────────────────

/**
 * Collect analytics for a single publication from its stored metrics.
 * Called after the platform adapter has already fetched and stored metrics
 * on the Publication record (metrics: Json field).
 */
export async function collectFromPublication(
  publicationId: string
): Promise<void> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: {
      content: { select: { userId: true } },
      account: { select: { userId: true } },
    },
  });

  if (!publication || !publication.metrics) return;
  if (!publication.platformPostId) return;

  const metrics = publication.metrics as Record<string, unknown>;

  const data: AnalyticsData = {
    platformPostId: publication.platformPostId,
    views: Number(metrics.views ?? 0),
    likes: Number(metrics.likes ?? 0),
    comments: Number(metrics.comments ?? 0),
    shares: Number(metrics.shares ?? 0),
    reach: Number(metrics.reach ?? 0),
    impressions: Number(metrics.impressions ?? 0),
    fetchedAt: metrics.fetchedAt
      ? new Date(metrics.fetchedAt as string)
      : new Date(),
  };

  await upsertAnalyticsPoint({
    timestamp: data.fetchedAt,
    metadata: {
      contentId: publication.contentId,
      accountId: publication.accountId,
      platform: publication.platform,
      userId: publication.content.userId,
      platformPostId: publication.platformPostId,
    },
    views: data.views,
    likes: data.likes,
    comments: data.comments,
    shares: data.shares,
    reach: data.reach ?? 0,
    impressions: data.impressions ?? 0,
    engagementRate: calcEngagementRate(data),
  });
}

/**
 * Collect analytics for all published content belonging to a user.
 * Iterates over publications that have metrics stored.
 */
export async function collectForUser(
  userId: string
): Promise<CollectionResult> {
  const publications = await prisma.publication.findMany({
    where: {
      status: "PUBLISHED",
      platformPostId: { not: null },
      metrics: { not: {} },
      account: { userId },
    },
    include: {
      content: { select: { userId: true } },
    },
  });

  let collected = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const pub of publications) {
    try {
      await collectFromPublication(pub.id);
      collected++;
    } catch (err) {
      failed++;
      errors.push(
        `Publication ${pub.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { collected, failed, errors };
}

/**
 * Ingest an analytics data point directly (called by platform adapters).
 * This is the primary write path when fresh data arrives from a platform API.
 */
export async function ingestAnalyticsData(params: {
  contentId: string;
  accountId: string;
  platform: string;
  userId: string;
  platformPostId: string;
  data: AnalyticsData;
}): Promise<void> {
  const { contentId, accountId, platform, userId, platformPostId, data } =
    params;

  await upsertAnalyticsPoint({
    timestamp: data.fetchedAt,
    metadata: {
      contentId,
      accountId,
      platform,
      userId,
      platformPostId,
    },
    views: data.views,
    likes: data.likes,
    comments: data.comments,
    shares: data.shares,
    reach: data.reach ?? 0,
    impressions: data.impressions ?? 0,
    engagementRate: calcEngagementRate(data),
  });

  // Persist latest metrics snapshot to Postgres for quick access
  await prisma.publication.updateMany({
    where: { contentId, accountId, platformPostId },
    data: {
      metrics: {
        views: data.views,
        likes: data.likes,
        comments: data.comments,
        shares: data.shares,
        reach: data.reach ?? 0,
        impressions: data.impressions ?? 0,
        fetchedAt: data.fetchedAt.toISOString(),
      },
      updatedAt: new Date(),
    },
  });
}
