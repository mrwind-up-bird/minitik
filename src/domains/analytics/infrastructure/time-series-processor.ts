import type { TimeSeriesPoint, TimeRange } from "./analytics-repository";

// ─── Gap filling ──────────────────────────────────────────────────────────────

/**
 * Fill missing dates in a time series with zero-value points so charts
 * render a continuous line over the requested range.
 */
export function fillTimeSeriesGaps(
  series: TimeSeriesPoint[],
  timeRange: TimeRange
): TimeSeriesPoint[] {
  const days = parseInt(timeRange.replace("d", ""), 10);
  const byDate = new Map(series.map((p) => [p.date, p]));

  const filled: TimeSeriesPoint[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - days + 1);
  cursor.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    const dateStr = cursor.toISOString().split("T")[0];
    filled.push(
      byDate.get(dateStr) ?? {
        date: dateStr,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        engagementRate: 0,
      }
    );
    cursor.setDate(cursor.getDate() + 1);
  }

  return filled;
}

// ─── Rolling averages ─────────────────────────────────────────────────────────

/**
 * Calculate a N-day simple moving average over the views field.
 * Returns the original series with an added `sma` field.
 */
export function rollingAverage(
  series: TimeSeriesPoint[],
  window: number
): Array<TimeSeriesPoint & { smaViews: number }> {
  return series.map((point, i) => {
    const slice = series.slice(Math.max(0, i - window + 1), i + 1);
    const avg =
      slice.reduce((sum, p) => sum + p.views, 0) / slice.length;
    return { ...point, smaViews: parseFloat(avg.toFixed(2)) };
  });
}

// ─── Growth rate ──────────────────────────────────────────────────────────────

export interface GrowthMetrics {
  viewsGrowth: number; // percentage change vs prior period
  likesGrowth: number;
  engagementGrowth: number;
}

/**
 * Compare two equal-length halves of a time series to compute period-over-period
 * growth rates.
 */
export function computeGrowthRates(series: TimeSeriesPoint[]): GrowthMetrics {
  if (series.length < 2) {
    return { viewsGrowth: 0, likesGrowth: 0, engagementGrowth: 0 };
  }

  const mid = Math.floor(series.length / 2);
  const prior = series.slice(0, mid);
  const current = series.slice(mid);

  const sum = (arr: TimeSeriesPoint[], key: keyof TimeSeriesPoint) =>
    arr.reduce((acc, p) => acc + (p[key] as number), 0);

  const avg = (arr: TimeSeriesPoint[], key: keyof TimeSeriesPoint) =>
    arr.length > 0 ? sum(arr, key) / arr.length : 0;

  function growthPct(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return parseFloat((((curr - prev) / prev) * 100).toFixed(2));
  }

  return {
    viewsGrowth: growthPct(
      sum(current, "views"),
      sum(prior, "views")
    ),
    likesGrowth: growthPct(
      sum(current, "likes"),
      sum(prior, "likes")
    ),
    engagementGrowth: growthPct(
      avg(current, "engagementRate"),
      avg(prior, "engagementRate")
    ),
  };
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

export interface AggregatedTotals {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

export function aggregateSeries(series: TimeSeriesPoint[]): AggregatedTotals {
  const totals = series.reduce(
    (acc, p) => ({
      views: acc.views + p.views,
      likes: acc.likes + p.likes,
      comments: acc.comments + p.comments,
      shares: acc.shares + p.shares,
      engRateSum: acc.engRateSum + p.engagementRate,
    }),
    { views: 0, likes: 0, comments: 0, shares: 0, engRateSum: 0 }
  );

  return {
    views: totals.views,
    likes: totals.likes,
    comments: totals.comments,
    shares: totals.shares,
    engagementRate:
      series.length > 0
        ? parseFloat((totals.engRateSum / series.length).toFixed(4))
        : 0,
  };
}

// ─── Best-performing day ──────────────────────────────────────────────────────

export function peakDay(series: TimeSeriesPoint[]): TimeSeriesPoint | null {
  if (series.length === 0) return null;
  return series.reduce((best, p) => (p.views > best.views ? p : best));
}
