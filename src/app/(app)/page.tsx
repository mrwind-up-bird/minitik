"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface DashboardStats {
  totalContent: number;
  drafts: number;
  scheduled: number;
  published: number;
  upcomingJobs: number;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const [contentRes, draftsRes, scheduledRes, publishedRes, jobsRes] =
        await Promise.allSettled([
          fetch("/api/content?limit=1"),
          fetch("/api/content?status=DRAFT&limit=1"),
          fetch("/api/content?status=SCHEDULED&limit=1"),
          fetch("/api/content?status=PUBLISHED&limit=1"),
          fetch("/api/scheduling?status=PENDING"),
        ]);

      const json = async (r: PromiseSettledResult<Response>) =>
        r.status === "fulfilled" && r.value.ok ? r.value.json() : null;

      const [contentData, draftsData, scheduledData, publishedData, jobsData] =
        await Promise.all([
          json(contentRes),
          json(draftsRes),
          json(scheduledRes),
          json(publishedRes),
          json(jobsRes),
        ]);

      setStats({
        totalContent: contentData?.total ?? 0,
        drafts: draftsData?.total ?? 0,
        scheduled: scheduledData?.total ?? 0,
        published: publishedData?.total ?? 0,
        upcomingJobs: Array.isArray(jobsData) ? jobsData.length : 0,
      });
    } catch {
      // Dashboard stats are best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const userName = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "there";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-nyx-text">
          Welcome back, {userName}
        </h1>
        <p className="mt-1 text-sm text-nyx-muted">
          Here&apos;s what&apos;s happening with your content.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-nyx-border bg-nyx-surface p-4"
            >
              <div className="h-3 w-16 bg-nyx-border rounded" />
              <div className="mt-2 h-6 w-10 bg-nyx-border rounded" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total Videos" value={stats?.totalContent ?? 0} />
            <StatCard label="Drafts" value={stats?.drafts ?? 0} />
            <StatCard label="Scheduled" value={stats?.upcomingJobs ?? 0} />
            <StatCard label="Published" value={stats?.published ?? 0} />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickAction
          href="/upload"
          title="Upload Video"
          description="Add a new video to your library"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          }
        />
        <QuickAction
          href="/schedule"
          title="Schedule Post"
          description="Plan your next publication"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          }
        />
        <QuickAction
          href="/analytics"
          title="View Analytics"
          description="See how your content performs"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-nyx-border bg-nyx-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-nyx-muted font-mono">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-nyx-text">
        {value}
      </p>
    </div>
  );
}

function QuickAction({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-nyx-border bg-nyx-surface p-4 transition-all hover:border-nyx-cyan/40 hover:glow-cyan-sm"
    >
      <div className="shrink-0 rounded-lg bg-nyx-cyan/10 p-2 text-nyx-cyan">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-nyx-text group-hover:text-nyx-cyan transition-colors">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-nyx-muted">
          {description}
        </p>
      </div>
    </Link>
  );
}
