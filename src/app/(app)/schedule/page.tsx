"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { JobStatusList } from "@/apps/web/components/scheduling/job-status";

export default function SchedulePage() {
  const [contentId, setContentId] = useState("");
  const [accountIds, setAccountIds] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH">("NORMAL");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Existing job IDs
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduling");
      if (res.ok) {
        const jobs = await res.json();
        if (Array.isArray(jobs)) {
          setJobIds(jobs.map((j: { id: string }) => j.id));
        }
      }
    } catch {
      // Best-effort
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/scheduling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: contentId.trim(),
          accountIds: accountIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          scheduledAt: new Date(scheduledAt).toISOString(),
          timezone,
          priority,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Scheduling failed (${res.status})`
        );
      }

      const result = await res.json();
      setSuccess(`Job scheduled successfully (ID: ${result.id})`);
      setJobIds((prev) => [result.id, ...prev]);

      // Reset form
      setContentId("");
      setAccountIds("");
      setScheduledAt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scheduling failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Schedule
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Schedule content for publishing to your connected accounts.
        </p>
      </div>

      {/* Schedule form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6"
      >
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          New Schedule
        </h2>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            {success}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="contentId"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Content ID
            </label>
            <input
              id="contentId"
              type="text"
              required
              value={contentId}
              onChange={(e) => setContentId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              placeholder="Content ID from your library"
            />
          </div>

          <div>
            <label
              htmlFor="accountIds"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Account IDs
            </label>
            <input
              id="accountIds"
              type="text"
              required
              value={accountIds}
              onChange={(e) => setAccountIds(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              placeholder="Comma-separated account IDs"
            />
          </div>

          <div>
            <label
              htmlFor="scheduledAt"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Scheduled Date & Time
            </label>
            <input
              id="scheduledAt"
              type="datetime-local"
              required
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          <div>
            <label
              htmlFor="timezone"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Timezone
            </label>
            <input
              id="timezone"
              type="text"
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              placeholder="e.g. America/New_York"
            />
          </div>

          <div>
            <label
              htmlFor="priority"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Priority
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as "LOW" | "NORMAL" | "HIGH")
              }
              className="mt-1 block w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Scheduling..." : "Schedule Post"}
        </button>
      </form>

      {/* Existing jobs */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Scheduled Jobs
        </h2>

        {jobsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4"
              >
                <div className="h-4 w-1/3 bg-neutral-200 dark:bg-neutral-700 rounded" />
                <div className="mt-2 h-3 w-1/2 bg-neutral-100 dark:bg-neutral-800 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <JobStatusList jobIds={jobIds} />
        )}
      </div>
    </div>
  );
}
