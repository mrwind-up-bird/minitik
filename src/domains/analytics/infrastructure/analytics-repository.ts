import { Collection, Document, ObjectId } from "mongodb";
import { getAnalyticsCollection } from "../../../shared/infrastructure/database/mongodb";

// ─── Document shape ───────────────────────────────────────────────────────────

export interface AnalyticsDocument {
  _id?: ObjectId;
  timestamp: Date;
  metadata: {
    contentId: string;
    accountId: string;
    platform: string;
    userId: string;
    platformPostId: string;
  };
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  engagementRate: number; // (likes+comments+shares) / views * 100
}

// ─── Query types ──────────────────────────────────────────────────────────────

export type TimeRange = "7d" | "14d" | "30d" | "90d" | "365d";

export interface DashboardFilter {
  userId: string;
  timeRange: TimeRange;
  platforms?: string[];
  contentIds?: string[];
}

export interface TimeSeriesPoint {
  date: string; // ISO date string YYYY-MM-DD
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

export interface PlatformSummary {
  platform: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagementRate: number;
  postCount: number;
}

export interface TopContent {
  contentId: string;
  totalViews: number;
  totalLikes: number;
  engagementRate: number;
  platform: string;
}

export interface DashboardData {
  totals: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
  };
  timeSeries: TimeSeriesPoint[];
  byPlatform: PlatformSummary[];
  topContent: TopContent[];
  lastUpdated: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeRangeToDays(range: TimeRange): number {
  return parseInt(range.replace("d", ""), 10);
}

function startOfRange(range: TimeRange): Date {
  const d = new Date();
  d.setDate(d.getDate() - timeRangeToDays(range));
  d.setHours(0, 0, 0, 0);
  return d;
}

function collection(): Promise<Collection<Document>> {
  return getAnalyticsCollection();
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function upsertAnalyticsPoint(
  doc: Omit<AnalyticsDocument, "_id">
): Promise<void> {
  const col = await collection();

  // Round timestamp to the hour for time-series bucketing
  const bucket = new Date(doc.timestamp);
  bucket.setMinutes(0, 0, 0);

  await col.updateOne(
    {
      "metadata.contentId": doc.metadata.contentId,
      "metadata.accountId": doc.metadata.accountId,
      timestamp: bucket,
    },
    {
      $set: {
        timestamp: bucket,
        metadata: doc.metadata,
        views: doc.views,
        likes: doc.likes,
        comments: doc.comments,
        shares: doc.shares,
        reach: doc.reach,
        impressions: doc.impressions,
        engagementRate: doc.engagementRate,
      },
    },
    { upsert: true }
  );
}

export async function insertManyAnalyticsPoints(
  docs: Array<Omit<AnalyticsDocument, "_id">>
): Promise<void> {
  if (docs.length === 0) return;
  const col = await collection();
  // For bulk inserts (collector runs) we simply insert; duplicates are handled
  // at collection time via upsertAnalyticsPoint for single records.
  await col.insertMany(docs, { ordered: false });
}

// ─── Dashboard aggregation ────────────────────────────────────────────────────

export async function getDashboardData(
  filter: DashboardFilter
): Promise<DashboardData> {
  const col = await collection();
  const since = startOfRange(filter.timeRange);

  const matchStage: Document = {
    "metadata.userId": filter.userId,
    timestamp: { $gte: since },
  };

  if (filter.platforms && filter.platforms.length > 0) {
    matchStage["metadata.platform"] = {
      $in: filter.platforms.map((p) => p.toUpperCase()),
    };
  }

  if (filter.contentIds && filter.contentIds.length > 0) {
    matchStage["metadata.contentId"] = { $in: filter.contentIds };
  }

  // Run all aggregation pipelines in parallel
  const [totalsResult, timeSeriesResult, byPlatformResult, topContentResult] =
    await Promise.all([
      // Totals
      col
        .aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              views: { $sum: "$views" },
              likes: { $sum: "$likes" },
              comments: { $sum: "$comments" },
              shares: { $sum: "$shares" },
              avgEngagementRate: { $avg: "$engagementRate" },
            },
          },
        ])
        .toArray(),

      // Daily time series
      col
        .aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
              views: { $sum: "$views" },
              likes: { $sum: "$likes" },
              comments: { $sum: "$comments" },
              shares: { $sum: "$shares" },
              engagementRate: { $avg: "$engagementRate" },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      // By platform
      col
        .aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: "$metadata.platform",
              totalViews: { $sum: "$views" },
              totalLikes: { $sum: "$likes" },
              totalComments: { $sum: "$comments" },
              totalShares: { $sum: "$shares" },
              avgEngagementRate: { $avg: "$engagementRate" },
              postCount: { $addToSet: "$metadata.contentId" },
            },
          },
          {
            $project: {
              platform: "$_id",
              totalViews: 1,
              totalLikes: 1,
              totalComments: 1,
              totalShares: 1,
              avgEngagementRate: 1,
              postCount: { $size: "$postCount" },
            },
          },
          { $sort: { totalViews: -1 } },
        ])
        .toArray(),

      // Top 10 content by views
      col
        .aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: {
                contentId: "$metadata.contentId",
                platform: "$metadata.platform",
              },
              totalViews: { $sum: "$views" },
              totalLikes: { $sum: "$likes" },
              engagementRate: { $avg: "$engagementRate" },
            },
          },
          { $sort: { totalViews: -1 } },
          { $limit: 10 },
          {
            $project: {
              contentId: "$_id.contentId",
              platform: "$_id.platform",
              totalViews: 1,
              totalLikes: 1,
              engagementRate: 1,
            },
          },
        ])
        .toArray(),
    ]);

  const totalsRaw = totalsResult[0] ?? {
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    avgEngagementRate: 0,
  };

  return {
    totals: {
      views: totalsRaw.views ?? 0,
      likes: totalsRaw.likes ?? 0,
      comments: totalsRaw.comments ?? 0,
      shares: totalsRaw.shares ?? 0,
      engagementRate: totalsRaw.avgEngagementRate ?? 0,
    },
    timeSeries: timeSeriesResult.map((row) => ({
      date: row._id as string,
      views: row.views ?? 0,
      likes: row.likes ?? 0,
      comments: row.comments ?? 0,
      shares: row.shares ?? 0,
      engagementRate: row.engagementRate ?? 0,
    })),
    byPlatform: byPlatformResult.map((row) => ({
      platform: row.platform as string,
      totalViews: row.totalViews ?? 0,
      totalLikes: row.totalLikes ?? 0,
      totalComments: row.totalComments ?? 0,
      totalShares: row.totalShares ?? 0,
      avgEngagementRate: row.avgEngagementRate ?? 0,
      postCount: row.postCount ?? 0,
    })),
    topContent: topContentResult.map((row) => ({
      contentId: row.contentId as string,
      platform: row.platform as string,
      totalViews: row.totalViews ?? 0,
      totalLikes: row.totalLikes ?? 0,
      engagementRate: row.engagementRate ?? 0,
    })),
    lastUpdated: new Date(),
  };
}

// ─── Per-content metrics ──────────────────────────────────────────────────────

export interface ContentMetrics {
  contentId: string;
  timeSeries: TimeSeriesPoint[];
  byPlatform: PlatformSummary[];
  totals: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
  };
}

export async function getContentMetrics(
  contentId: string,
  userId: string,
  timeRange: TimeRange = "30d"
): Promise<ContentMetrics> {
  const col = await collection();
  const since = startOfRange(timeRange);

  const matchStage = {
    "metadata.contentId": contentId,
    "metadata.userId": userId,
    timestamp: { $gte: since },
  };

  const [timeSeriesResult, byPlatformResult, totalsResult] = await Promise.all([
    col
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
            },
            views: { $sum: "$views" },
            likes: { $sum: "$likes" },
            comments: { $sum: "$comments" },
            shares: { $sum: "$shares" },
            engagementRate: { $avg: "$engagementRate" },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray(),

    col
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$metadata.platform",
            totalViews: { $sum: "$views" },
            totalLikes: { $sum: "$likes" },
            totalComments: { $sum: "$comments" },
            totalShares: { $sum: "$shares" },
            avgEngagementRate: { $avg: "$engagementRate" },
          },
        },
        {
          $project: {
            platform: "$_id",
            totalViews: 1,
            totalLikes: 1,
            totalComments: 1,
            totalShares: 1,
            avgEngagementRate: 1,
            postCount: { $literal: 1 },
          },
        },
      ])
      .toArray(),

    col
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            views: { $sum: "$views" },
            likes: { $sum: "$likes" },
            comments: { $sum: "$comments" },
            shares: { $sum: "$shares" },
            avgEngagementRate: { $avg: "$engagementRate" },
          },
        },
      ])
      .toArray(),
  ]);

  const totalsRaw = totalsResult[0] ?? {};

  return {
    contentId,
    timeSeries: timeSeriesResult.map((row) => ({
      date: row._id as string,
      views: row.views ?? 0,
      likes: row.likes ?? 0,
      comments: row.comments ?? 0,
      shares: row.shares ?? 0,
      engagementRate: row.engagementRate ?? 0,
    })),
    byPlatform: byPlatformResult.map((row) => ({
      platform: row.platform as string,
      totalViews: row.totalViews ?? 0,
      totalLikes: row.totalLikes ?? 0,
      totalComments: row.totalComments ?? 0,
      totalShares: row.totalShares ?? 0,
      avgEngagementRate: row.avgEngagementRate ?? 0,
      postCount: row.postCount ?? 1,
    })),
    totals: {
      views: totalsRaw.views ?? 0,
      likes: totalsRaw.likes ?? 0,
      comments: totalsRaw.comments ?? 0,
      shares: totalsRaw.shares ?? 0,
      engagementRate: totalsRaw.avgEngagementRate ?? 0,
    },
  };
}

// ─── Export raw data ──────────────────────────────────────────────────────────

export interface ExportRow {
  date: string;
  contentId: string;
  platform: string;
  accountId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  engagementRate: number;
}

export async function getRawAnalyticsForExport(
  userId: string,
  timeRange: TimeRange,
  platforms?: string[]
): Promise<ExportRow[]> {
  const col = await collection();
  const since = startOfRange(timeRange);

  const matchStage: Document = {
    "metadata.userId": userId,
    timestamp: { $gte: since },
  };

  if (platforms && platforms.length > 0) {
    matchStage["metadata.platform"] = {
      $in: platforms.map((p) => p.toUpperCase()),
    };
  }

  const results = await col
    .find(matchStage)
    .sort({ timestamp: 1 })
    .project({
      timestamp: 1,
      "metadata.contentId": 1,
      "metadata.platform": 1,
      "metadata.accountId": 1,
      views: 1,
      likes: 1,
      comments: 1,
      shares: 1,
      reach: 1,
      impressions: 1,
      engagementRate: 1,
    })
    .toArray();

  return results.map((r) => ({
    date: (r.timestamp as Date).toISOString(),
    contentId: r.metadata?.contentId ?? "",
    platform: r.metadata?.platform ?? "",
    accountId: r.metadata?.accountId ?? "",
    views: r.views ?? 0,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    shares: r.shares ?? 0,
    reach: r.reach ?? 0,
    impressions: r.impressions ?? 0,
    engagementRate: r.engagementRate ?? 0,
  }));
}
