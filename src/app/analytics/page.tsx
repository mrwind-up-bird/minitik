"use client";

import { AnalyticsDashboard } from "@/apps/web/components/analytics/dashboard";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Analytics
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Track your content performance across all platforms.
        </p>
      </div>

      <AnalyticsDashboard />
    </div>
  );
}
