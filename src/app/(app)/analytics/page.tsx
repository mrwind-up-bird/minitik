"use client";

import { AnalyticsDashboard } from "@/apps/web/components/analytics/dashboard";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-nyx-text">
          Analytics
        </h1>
        <p className="mt-1 text-sm text-nyx-muted">
          Track your content performance across all platforms.
        </p>
      </div>

      <AnalyticsDashboard />
    </div>
  );
}
