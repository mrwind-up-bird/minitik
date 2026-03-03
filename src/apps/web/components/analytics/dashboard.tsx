"use client";

import React, { useEffect, useState, useCallback } from "react";

// ─── Types (mirrors analytics-service DashboardResponse) ─────────────────────

interface TimeSeriesPoint {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

interface PlatformSummary {
  platform: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagementRate: number;
  postCount: number;
}

interface TopContent {
  contentId: string;
  platform: string;
  totalViews: number;
  totalLikes: number;
  engagementRate: number;
}

interface DashboardData {
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
  growth: {
    viewsGrowth: number;
    likesGrowth: number;
    engagementGrowth: number;
  };
  peakDay: { date: string; views: number } | null;
  fromCache: boolean;
  nextRefreshAt: string;
  lastUpdated: string;
}

type TimeRange = "7d" | "14d" | "30d" | "90d" | "365d";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function growthColor(pct: number): string {
  if (pct > 0) return "text-emerald-400";
  if (pct < 0) return "text-red-400";
  return "text-nyx-muted";
}

function growthLabel(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function platformColor(platform: string): string {
  switch (platform.toUpperCase()) {
    case "TIKTOK":
      return "bg-white text-nyx-midnight";
    case "INSTAGRAM":
      return "bg-gradient-to-r from-pink-500 to-purple-600 text-white";
    case "YOUTUBE":
      return "bg-red-600 text-white";
    default:
      return "bg-nyx-border text-nyx-text";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  growth,
}: {
  label: string;
  value: number;
  growth?: number;
}) {
  return (
    <div className="bg-nyx-surface rounded-lg border border-nyx-border p-4">
      <p className="text-xs font-medium text-nyx-muted uppercase tracking-wide font-mono">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-nyx-text">{formatNumber(value)}</p>
      {growth !== undefined && (
        <p className={`mt-1 text-xs ${growthColor(growth)}`}>
          {growthLabel(growth)} vs prior period
        </p>
      )}
    </div>
  );
}

function SimpleBarChart({ series }: { series: TimeSeriesPoint[] }) {
  const maxViews = Math.max(...series.map((p) => p.views), 1);

  return (
    <div className="flex items-end gap-0.5 h-24 w-full">
      {series.map((point) => {
        const height = Math.max(2, (point.views / maxViews) * 96);
        return (
          <div
            key={point.date}
            className="flex-1 bg-nyx-cyan/60 rounded-t hover:bg-nyx-cyan transition-colors"
            style={{ height }}
            title={`${point.date}: ${formatNumber(point.views)} views`}
          />
        );
      })}
    </div>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${platformColor(platform)}`}
    >
      {platform}
    </span>
  );
}

function PlatformTable({ platforms }: { platforms: PlatformSummary[] }) {
  if (platforms.length === 0) {
    return <p className="text-sm text-nyx-muted text-center py-4">No platform data</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-nyx-muted uppercase border-b border-nyx-border">
            <th className="pb-2 pr-4">Platform</th>
            <th className="pb-2 pr-4 text-right">Views</th>
            <th className="pb-2 pr-4 text-right">Likes</th>
            <th className="pb-2 pr-4 text-right">Comments</th>
            <th className="pb-2 text-right">Eng. Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-nyx-border/50">
          {platforms.map((p) => (
            <tr key={p.platform}>
              <td className="py-2 pr-4">
                <PlatformBadge platform={p.platform} />
              </td>
              <td className="py-2 pr-4 text-right text-nyx-text">
                {formatNumber(p.totalViews)}
              </td>
              <td className="py-2 pr-4 text-right text-nyx-text">
                {formatNumber(p.totalLikes)}
              </td>
              <td className="py-2 pr-4 text-right text-nyx-text">
                {formatNumber(p.totalComments)}
              </td>
              <td className="py-2 text-right text-nyx-text">
                {p.avgEngagementRate.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopContentList({ items }: { items: TopContent[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-nyx-muted text-center py-4">No content data</p>;
  }

  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={`${item.contentId}-${item.platform}`} className="flex items-center gap-3">
          <span className="text-xs text-nyx-muted w-4 shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-nyx-text truncate font-mono text-xs">
              {item.contentId}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <PlatformBadge platform={item.platform} />
              <span className="text-xs text-nyx-muted">
                {item.engagementRate.toFixed(2)}% eng.
              </span>
            </div>
          </div>
          <span className="text-sm font-medium text-nyx-text shrink-0">
            {formatNumber(item.totalViews)}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ─── Main Dashboard component ─────────────────────────────────────────────────

interface AnalyticsDashboardProps {
  initialTimeRange?: TimeRange;
}

export function AnalyticsDashboard({
  initialTimeRange = "30d",
}: AnalyticsDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(initialTimeRange);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ timeRange });
      if (selectedPlatforms.length > 0) {
        params.set("platforms", selectedPlatforms.join(","));
      }
      const res = await fetch(`/api/analytics/dashboard?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [timeRange, selectedPlatforms]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/analytics/refresh", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Refresh failed");
      }
      await fetchDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleExport(format: "csv" | "json") {
    setExporting(true);
    setExportUrl(null);
    try {
      const res = await fetch("/api/analytics/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeRange,
          format,
          platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Export failed");
      }
      const result = await res.json();
      setExportUrl(result.downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const timeRangeOptions: TimeRange[] = ["7d", "14d", "30d", "90d", "365d"];
  const platformOptions = ["TIKTOK", "INSTAGRAM", "YOUTUBE"];

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-nyx-surface border border-nyx-border rounded-lg" />
          ))}
        </div>
        <div className="h-40 bg-nyx-surface border border-nyx-border rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          {timeRangeOptions.map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors font-mono ${
                timeRange === range
                  ? "bg-nyx-cyan text-nyx-midnight border-nyx-cyan"
                  : "bg-nyx-surface text-nyx-muted border-nyx-border hover:border-nyx-cyan/40"
              }`}
            >
              {range}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          {platformOptions.map((p) => (
            <button
              key={p}
              onClick={() => togglePlatform(p)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                selectedPlatforms.includes(p)
                  ? "bg-nyx-text text-nyx-midnight border-nyx-text"
                  : "bg-nyx-surface text-nyx-muted border-nyx-border hover:border-nyx-cyan/40"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-sm px-3 py-1.5 rounded-md border border-nyx-border bg-nyx-surface text-nyx-text hover:bg-nyx-border disabled:opacity-50 transition-colors"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={() => handleExport("csv")}
            disabled={exporting}
            className="text-sm px-3 py-1.5 rounded-md border border-nyx-border bg-nyx-surface text-nyx-text hover:bg-nyx-border disabled:opacity-50 transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport("json")}
            disabled={exporting}
            className="text-sm px-3 py-1.5 rounded-md border border-nyx-border bg-nyx-surface text-nyx-text hover:bg-nyx-border disabled:opacity-50 transition-colors"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Export link */}
      {exportUrl && (
        <div className="text-sm bg-emerald-950/30 border border-emerald-800 rounded-lg p-3 text-emerald-400">
          Export ready:{" "}
          <a
            href={exportUrl}
            target="_blank"
            rel="noreferrer"
            className="text-nyx-cyan underline"
          >
            Download
          </a>{" "}
          <span className="text-nyx-muted">(link expires in 1 hour)</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm bg-red-950/30 border border-red-800 text-red-400 rounded-lg p-3">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Views"
              value={data.totals.views}
              growth={data.growth.viewsGrowth}
            />
            <StatCard
              label="Likes"
              value={data.totals.likes}
              growth={data.growth.likesGrowth}
            />
            <StatCard label="Comments" value={data.totals.comments} />
            <StatCard label="Shares" value={data.totals.shares} />
          </div>

          {/* Engagement rate + peak day */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-nyx-surface rounded-lg border border-nyx-border p-4">
              <p className="text-xs font-medium text-nyx-muted uppercase tracking-wide font-mono">
                Avg Engagement Rate
              </p>
              <p className="mt-1 text-2xl font-semibold text-nyx-text">
                {data.totals.engagementRate.toFixed(2)}%
              </p>
              <p className={`mt-1 text-xs ${growthColor(data.growth.engagementGrowth)}`}>
                {growthLabel(data.growth.engagementGrowth)} vs prior period
              </p>
            </div>
            {data.peakDay && (
              <div className="bg-nyx-surface rounded-lg border border-nyx-border p-4">
                <p className="text-xs font-medium text-nyx-muted uppercase tracking-wide font-mono">
                  Peak Day
                </p>
                <p className="mt-1 text-lg font-semibold text-nyx-text">
                  {data.peakDay.date}
                </p>
                <p className="text-sm text-nyx-muted">
                  {formatNumber(data.peakDay.views)} views
                </p>
              </div>
            )}
          </div>

          {/* Time series chart */}
          <div className="bg-nyx-surface rounded-lg border border-nyx-border p-4">
            <h3 className="text-sm font-medium text-nyx-text mb-3">
              Views over time
            </h3>
            <SimpleBarChart series={data.timeSeries} />
            <div className="flex justify-between text-xs text-nyx-muted mt-1 font-mono">
              <span>{data.timeSeries[0]?.date}</span>
              <span>{data.timeSeries[data.timeSeries.length - 1]?.date}</span>
            </div>
          </div>

          {/* Bottom grid: platform breakdown + top content */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-nyx-surface rounded-lg border border-nyx-border p-4">
              <h3 className="text-sm font-medium text-nyx-text mb-3">
                By Platform
              </h3>
              <PlatformTable platforms={data.byPlatform} />
            </div>

            <div className="bg-nyx-surface rounded-lg border border-nyx-border p-4">
              <h3 className="text-sm font-medium text-nyx-text mb-3">
                Top Content
              </h3>
              <TopContentList items={data.topContent} />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between text-xs text-nyx-muted font-mono">
            <span>
              {data.fromCache ? "Cached" : "Live"} &middot; Updated{" "}
              {new Date(data.lastUpdated).toLocaleTimeString()}
            </span>
            <span>
              Next auto-refresh:{" "}
              {new Date(data.nextRefreshAt).toLocaleTimeString()}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default AnalyticsDashboard;
