"use client";

import React from "react";

export type UploadStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "complete"
  | "error"
  | "aborted";

export interface ChunkInfo {
  completed: number;
  total: number;
}

export interface UploadProgressProps {
  status: UploadStatus;
  filename: string;
  chunks: ChunkInfo;
  bytesUploaded: number;
  totalBytes: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
  error?: string;
  onCancel?: () => void;
  onRetry?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return "--";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

interface ProgressBarProps {
  percent: number;
  status: UploadStatus;
  chunks: ChunkInfo;
}

function ProgressBar({ percent, status, chunks }: ProgressBarProps) {
  const barColor =
    status === "complete"
      ? "bg-emerald-500"
      : status === "error"
      ? "bg-red-500"
      : status === "aborted"
      ? "bg-neutral-400"
      : "bg-violet-500";

  return (
    <div className="w-full">
      {/* Chunk indicator row */}
      <div className="mb-1 flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          Chunks: {chunks.completed}/{chunks.total}
        </span>
        <span>{percent}%</span>
      </div>

      {/* Main progress bar */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Upload progress"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Chunk dots for small files with few chunks */}
      {chunks.total <= 20 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Array.from({ length: chunks.total }, (_, i) => (
            <div
              key={i}
              className={[
                "h-1.5 w-1.5 rounded-full transition-colors duration-200",
                i < chunks.completed
                  ? barColor
                  : "bg-neutral-200 dark:bg-neutral-700",
              ].join(" ")}
              aria-hidden="true"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function UploadProgress({
  status,
  filename,
  chunks,
  bytesUploaded,
  totalBytes,
  speedBytesPerSecond,
  etaSeconds,
  error,
  onCancel,
  onRetry,
}: UploadProgressProps) {
  const percent =
    totalBytes > 0 ? Math.min(100, Math.round((bytesUploaded / totalBytes) * 100)) : 0;

  const statusLabel: Record<UploadStatus, string> = {
    idle: "Ready",
    uploading: "Uploading",
    processing: "Processing",
    complete: "Complete",
    error: "Failed",
    aborted: "Cancelled",
  };

  const statusColor: Record<UploadStatus, string> = {
    idle: "text-neutral-500",
    uploading: "text-violet-600 dark:text-violet-400",
    processing: "text-amber-600 dark:text-amber-400",
    complete: "text-emerald-600 dark:text-emerald-400",
    error: "text-red-600 dark:text-red-400",
    aborted: "text-neutral-500",
  };

  return (
    <div className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100"
            title={filename}
          >
            {filename}
          </p>
          <p className={`mt-0.5 text-xs font-medium ${statusColor[status]}`}>
            {statusLabel[status]}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status === "uploading" && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            >
              Cancel
            </button>
          )}
          {(status === "error" || status === "aborted") && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md px-2 py-1 text-xs text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
            >
              Retry
            </button>
          )}
          {status === "complete" && (
            <svg
              className="h-4 w-4 text-emerald-500"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {status !== "idle" && (
        <ProgressBar percent={percent} status={status} chunks={chunks} />
      )}

      {/* Stats row */}
      {(status === "uploading" || status === "processing") && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span>
            {formatBytes(bytesUploaded)} / {formatBytes(totalBytes)}
          </span>
          {speedBytesPerSecond > 0 && (
            <span>{formatSpeed(speedBytesPerSecond)}</span>
          )}
          {etaSeconds > 0 && status === "uploading" && (
            <span>ETA: {formatEta(etaSeconds)}</span>
          )}
        </div>
      )}

      {status === "complete" && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {formatBytes(totalBytes)} uploaded
        </p>
      )}

      {/* Error message */}
      {status === "error" && error && (
        <p
          role="alert"
          className="mt-2 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// Convenience wrapper for a list of uploads
export interface UploadItem {
  id: string;
  filename: string;
  status: UploadStatus;
  chunks: ChunkInfo;
  bytesUploaded: number;
  totalBytes: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
  error?: string;
}

interface UploadQueueProps {
  uploads: UploadItem[];
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export function UploadQueue({ uploads, onCancel, onRetry }: UploadQueueProps) {
  if (uploads.length === 0) return null;

  return (
    <div className="space-y-3" aria-label="Upload queue">
      {uploads.map((upload) => (
        <UploadProgress
          key={upload.id}
          filename={upload.filename}
          status={upload.status}
          chunks={upload.chunks}
          bytesUploaded={upload.bytesUploaded}
          totalBytes={upload.totalBytes}
          speedBytesPerSecond={upload.speedBytesPerSecond}
          etaSeconds={upload.etaSeconds}
          error={upload.error}
          onCancel={onCancel ? () => onCancel(upload.id) : undefined}
          onRetry={onRetry ? () => onRetry(upload.id) : undefined}
        />
      ))}
    </div>
  );
}
