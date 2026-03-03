"use client";

import React, { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED";
type JobPriority = "LOW" | "NORMAL" | "HIGH";

interface ScheduledJobState {
  id: string;
  contentId: string;
  accountIds: string[];
  scheduledAt: string;
  timezone: string;
  priority: JobPriority;
  status: JobStatus;
  bullJobId: string | null;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  processedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  bullJobState: string | null;
  progress: number | Record<string, unknown>;
  content: {
    title: string;
    status: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateInTimezone(isoString: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function progressPercent(progress: number | Record<string, unknown>): number {
  if (typeof progress === "number") return Math.min(100, Math.max(0, progress));
  return 0;
}

function statusColor(status: JobStatus): string {
  switch (status) {
    case "PENDING":
      return "text-yellow-400 bg-yellow-950/30";
    case "ACTIVE":
      return "text-nyx-cyan bg-nyx-cyan/10";
    case "COMPLETED":
      return "text-emerald-400 bg-emerald-950/30";
    case "FAILED":
      return "text-red-400 bg-red-950/30";
    case "CANCELLED":
      return "text-nyx-muted bg-nyx-border/50";
  }
}

function priorityBadge(priority: JobPriority): string {
  switch (priority) {
    case "HIGH":
      return "bg-red-950/50 text-red-300";
    case "NORMAL":
      return "bg-nyx-cyan/10 text-nyx-cyan";
    case "LOW":
      return "bg-nyx-border text-nyx-muted";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-nyx-border rounded-full h-2 mt-2">
      <div
        className="bg-nyx-cyan h-2 rounded-full transition-all duration-300"
        style={{ width: `${value}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

function RetryInfo({
  attempts,
  maxAttempts,
  error,
}: {
  attempts: number;
  maxAttempts: number;
  error: string | null;
}) {
  if (attempts === 0 && !error) return null;

  return (
    <div className="mt-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-nyx-muted">Attempts:</span>
        <span className={attempts >= maxAttempts ? "text-red-400 font-medium" : "text-nyx-text"}>
          {attempts} / {maxAttempts}
        </span>
        {attempts > 0 && attempts < maxAttempts && (
          <span className="text-yellow-400 text-xs">
            (will retry)
          </span>
        )}
        {attempts >= maxAttempts && (
          <span className="text-red-400 text-xs font-medium">
            (max retries reached)
          </span>
        )}
      </div>
      {error && (
        <div className="mt-1 p-2 bg-red-950/30 border border-red-800 rounded text-red-400 text-xs break-words">
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface JobStatusProps {
  scheduledJobId: string;
  /** Poll interval in ms. Set to 0 to disable polling. */
  pollIntervalMs?: number;
  onCancel?: (jobId: string) => Promise<void>;
}

export function JobStatus({
  scheduledJobId,
  pollIntervalMs = 5000,
  onCancel,
}: JobStatusProps) {
  const [job, setJob] = useState<ScheduledJobState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/scheduling/jobs/${scheduledJobId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data: ScheduledJobState = await res.json();
      setJob(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job status");
    } finally {
      setLoading(false);
    }
  }, [scheduledJobId]);

  useEffect(() => {
    fetchStatus();

    if (pollIntervalMs <= 0) return;

    const interval = setInterval(() => {
      // Stop polling once the job reaches a terminal state
      if (job && ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
        clearInterval(interval);
        return;
      }
      fetchStatus();
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [fetchStatus, pollIntervalMs, job?.status]);

  async function handleCancel() {
    if (!job || cancelling) return;
    setCancelling(true);
    try {
      if (onCancel) {
        await onCancel(job.id);
      } else {
        const res = await fetch(`/api/scheduling/jobs/${job.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Cancel failed");
        }
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel job");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse rounded-lg border border-nyx-border bg-nyx-surface p-4 space-y-2">
        <div className="h-4 bg-nyx-border rounded w-1/3" />
        <div className="h-3 bg-nyx-border/50 rounded w-1/2" />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  if (!job) return null;

  const progress = progressPercent(job.progress);
  const isTerminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status);
  const canCancel = job.status === "PENDING";

  return (
    <article className="rounded-lg border border-nyx-border bg-nyx-surface p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium text-nyx-text truncate">
            {job.content.title}
          </h3>
          <p className="text-xs text-nyx-muted mt-0.5">
            {job.accountIds.length} account{job.accountIds.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityBadge(job.priority)}`}
          >
            {job.priority}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor(job.status)}`}
          >
            {job.status}
          </span>
        </div>
      </div>

      {/* Scheduled time */}
      <div className="text-sm text-nyx-muted">
        <span className="font-medium text-nyx-text">Scheduled: </span>
        {formatDateInTimezone(job.scheduledAt, job.timezone)}
        {job.timezone !== "UTC" && (
          <span className="text-nyx-muted/60 ml-1">({job.timezone})</span>
        )}
      </div>

      {/* Progress bar (only during active processing) */}
      {job.status === "ACTIVE" && (
        <div>
          <div className="flex justify-between text-xs text-nyx-muted mb-1 font-mono">
            <span>Publishing...</span>
            <span>{progress}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      )}

      {/* Retry info */}
      <RetryInfo
        attempts={job.attempts}
        maxAttempts={job.maxAttempts}
        error={job.error}
      />

      {/* Completed / failed timestamps */}
      {job.completedAt && (
        <div className="text-xs text-nyx-muted">
          {job.status === "COMPLETED" ? "Completed" : "Finished"} at{" "}
          {new Date(job.completedAt).toLocaleString()}
        </div>
      )}

      {/* Error banner from hook polling */}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Actions */}
      {!isTerminal && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={fetchStatus}
            className="text-xs text-nyx-cyan hover:underline"
          >
            Refresh
          </button>

          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="text-xs text-red-400 hover:underline disabled:opacity-50"
            >
              {cancelling ? "Cancelling..." : "Cancel"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

interface JobStatusListProps {
  jobIds: string[];
  pollIntervalMs?: number;
  onCancel?: (jobId: string) => Promise<void>;
}

export function JobStatusList({
  jobIds,
  pollIntervalMs,
  onCancel,
}: JobStatusListProps) {
  if (jobIds.length === 0) {
    return (
      <p className="text-sm text-nyx-muted text-center py-8">
        No scheduled jobs yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {jobIds.map((id) => (
        <JobStatus
          key={id}
          scheduledJobId={id}
          pollIntervalMs={pollIntervalMs}
          onCancel={onCancel}
        />
      ))}
    </div>
  );
}

export default JobStatus;
