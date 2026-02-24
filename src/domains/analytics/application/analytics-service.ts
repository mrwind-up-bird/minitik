import { getRedis } from "../../../shared/infrastructure/database/redis";
import {
  getDashboardData,
  getContentMetrics,
  type DashboardFilter,
  type DashboardData,
  type ContentMetrics,
  type TimeRange,
} from "../infrastructure/analytics-repository";
import {
  fillTimeSeriesGaps,
  computeGrowthRates,
  aggregateSeries,
  peakDay,
} from "../infrastructure/time-series-processor";
import {
  exportAnalytics,
  type ExportFormat,
  type ExportResult,
} from "../infrastructure/analytics-exporter";
import { collectForUser } from "../infrastructure/analytics-collector";
import { prisma } from "../../../shared/infrastructure/database/postgres";

// ─── Cache configuration ──────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
const AUTO_REFRESH_SECONDS = 4 * 60 * 60; // 4 hours
const MANUAL_REFRESH_LIMIT_SECONDS = 60 * 60; // 1 per hour

function dashboardCacheKey(userId: string, filter: DashboardFilter): string {
  const platforms = filter.platforms?.sort().join(",") ?? "all";
  return `analytics:dashboard:${userId}:${filter.timeRange}:${platforms}`;
}

function contentCacheKey(contentId: string, userId: string, timeRange: TimeRange): string {
  return `analytics:content:${userId}:${contentId}:${timeRange}`;
}

function refreshLockKey(userId: string): string {
  return `analytics:refresh-lock:${userId}`;
}

function lastRefreshKey(userId: string): string {
  return `analytics:last-refresh:${userId}`;
}

// ─── Enriched dashboard response ──────────────────────────────────────────────

export interface DashboardResponse extends DashboardData {
  growth: {
    viewsGrowth: number;
    likesGrowth: number;
    engagementGrowth: number;
  };
  peakDay: { date: string; views: number } | null;
  fromCache: boolean;
  nextRefreshAt: Date;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboard(
  filter: DashboardFilter
): Promise<DashboardResponse> {
  const redis = getRedis();
  const cacheKey = dashboardCacheKey(filter.userId, filter);

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached) as DashboardResponse;
    return { ...parsed, fromCache: true };
  }

  // Fetch from MongoDB
  const raw = await getDashboardData(filter);

  // Fill time series gaps for smooth chart rendering
  const filledSeries = fillTimeSeriesGaps(raw.timeSeries, filter.timeRange);
  const growth = computeGrowthRates(filledSeries);
  const peak = peakDay(filledSeries);

  const lastRefreshTs = await redis.get(lastRefreshKey(filter.userId));
  const lastRefresh = lastRefreshTs ? new Date(parseInt(lastRefreshTs, 10)) : new Date();
  const nextRefreshAt = new Date(lastRefresh.getTime() + AUTO_REFRESH_SECONDS * 1000);

  const response: DashboardResponse = {
    ...raw,
    timeSeries: filledSeries,
    growth,
    peakDay: peak ? { date: peak.date, views: peak.views } : null,
    fromCache: false,
    nextRefreshAt,
  };

  // Cache it
  await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(response));

  return response;
}

// ─── Per-content metrics ──────────────────────────────────────────────────────

export interface ContentMetricsResponse extends ContentMetrics {
  growth: ReturnType<typeof computeGrowthRates>;
  aggregatedTotals: ReturnType<typeof aggregateSeries>;
  fromCache: boolean;
}

export async function getContentAnalytics(
  contentId: string,
  userId: string,
  timeRange: TimeRange = "30d"
): Promise<ContentMetricsResponse | null> {
  // Verify ownership
  const content = await prisma.content.findFirst({
    where: { id: contentId, userId },
    select: { id: true },
  });
  if (!content) return null;

  const redis = getRedis();
  const cacheKey = contentCacheKey(contentId, userId, timeRange);

  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached) as ContentMetricsResponse;
    return { ...parsed, fromCache: true };
  }

  const raw = await getContentMetrics(contentId, userId, timeRange);
  const filledSeries = fillTimeSeriesGaps(raw.timeSeries, timeRange);
  const growth = computeGrowthRates(filledSeries);
  const aggregatedTotals = aggregateSeries(filledSeries);

  const response: ContentMetricsResponse = {
    ...raw,
    timeSeries: filledSeries,
    growth,
    aggregatedTotals,
    fromCache: false,
  };

  await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(response));

  return response;
}

// ─── Manual refresh ───────────────────────────────────────────────────────────

export interface RefreshResult {
  collected: number;
  failed: number;
  errors: string[];
  nextAllowedAt: Date;
}

export async function triggerManualRefresh(userId: string): Promise<RefreshResult> {
  const redis = getRedis();
  const lockKey = refreshLockKey(userId);

  // Check rate limit: 1 manual refresh per hour
  const existingLock = await redis.get(lockKey);
  if (existingLock) {
    const ttl = await redis.ttl(lockKey);
    const nextAllowedAt = new Date(Date.now() + ttl * 1000);
    throw Object.assign(
      new Error(`Manual refresh is rate-limited. Next allowed at ${nextAllowedAt.toISOString()}`),
      { nextAllowedAt }
    );
  }

  // Set lock for 1 hour
  await redis.setex(lockKey, MANUAL_REFRESH_LIMIT_SECONDS, "1");
  await redis.set(lastRefreshKey(userId), Date.now().toString());

  // Collect fresh analytics from stored publication metrics
  const result = await collectForUser(userId);

  // Invalidate all dashboard caches for this user
  const pattern = `analytics:dashboard:${userId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  const contentPattern = `analytics:content:${userId}:*`;
  const contentKeys = await redis.keys(contentPattern);
  if (contentKeys.length > 0) {
    await redis.del(...contentKeys);
  }

  const nextAllowedAt = new Date(Date.now() + MANUAL_REFRESH_LIMIT_SECONDS * 1000);

  return { ...result, nextAllowedAt };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function requestExport(params: {
  userId: string;
  timeRange: TimeRange;
  format: ExportFormat;
  platforms?: string[];
}): Promise<ExportResult> {
  return exportAnalytics(params);
}
