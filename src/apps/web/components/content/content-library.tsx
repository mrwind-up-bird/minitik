"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentStatus = "DRAFT" | "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "FAILED";
type Platform = "TIKTOK" | "INSTAGRAM" | "YOUTUBE";
type SortField = "createdAt" | "scheduledAt" | "title" | "updatedAt";
type SortOrder = "asc" | "desc";

interface Publication {
  id: string;
  platform: Platform;
  status: string;
  publishedAt: string | null;
}

interface ContentItem {
  id: string;
  title: string;
  description?: string | null;
  filePath?: string | null;
  thumbnailPath?: string | null;
  fileSize?: string | null;
  mimeType?: string | null;
  duration?: number | null;
  status: ContentStatus;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  publications: Publication[];
}

interface ListResponse {
  items: ContentItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: string | null | undefined): string {
  if (!bytes) return "";
  const n = Number(bytes);
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  FAILED: "Failed",
};

const STATUS_COLORS: Record<ContentStatus, string> = {
  DRAFT: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  PUBLISHING: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  PUBLISHED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

const PLATFORM_ICONS: Record<Platform, string> = {
  TIKTOK: "TT",
  INSTAGRAM: "IG",
  YOUTUBE: "YT",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ContentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: Platform }) {
  const colors: Record<Platform, string> = {
    TIKTOK: "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900",
    INSTAGRAM:
      "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
    YOUTUBE: "bg-red-600 text-white",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${colors[platform]}`}
    >
      {PLATFORM_ICONS[platform]}
    </span>
  );
}

interface ContentCardProps {
  item: ContentItem;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onEdit?: (item: ContentItem) => void;
}

function ContentCard({ item, selected, onSelect, onDelete, onEdit }: ContentCardProps) {
  return (
    <div
      className={[
        "group relative flex flex-col rounded-xl border bg-white dark:bg-neutral-900 overflow-hidden shadow-sm transition-shadow hover:shadow-md",
        selected
          ? "border-violet-400 ring-2 ring-violet-400/30"
          : "border-neutral-200 dark:border-neutral-700",
      ].join(" ")}
    >
      {/* Checkbox */}
      <div className="absolute left-2 top-2 z-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(item.id, e.target.checked)}
          aria-label={`Select ${item.title}`}
          className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Thumbnail */}
      <div className="relative aspect-video w-full bg-neutral-100 dark:bg-neutral-800">
        {item.thumbnailPath ? (
          <img
            src={item.thumbnailPath}
            alt={item.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <svg
              className="h-10 w-10 text-neutral-300 dark:text-neutral-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
        )}

        {item.duration && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 py-0.5 text-xs text-white font-mono">
            {formatDuration(item.duration)}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-3 gap-2">
        <h3
          className="line-clamp-2 text-sm font-medium text-neutral-800 dark:text-neutral-100 leading-snug"
          title={item.title}
        >
          {item.title}
        </h3>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={item.status} />
          {item.publications.map((pub) => (
            <PlatformBadge key={pub.id} platform={pub.platform} />
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500">
          <span>
            {item.status === "SCHEDULED" && item.scheduledAt
              ? `Scheduled ${formatDate(item.scheduledAt)}`
              : item.status === "PUBLISHED" && item.publishedAt
              ? `Published ${formatDate(item.publishedAt)}`
              : formatDate(item.createdAt)}
          </span>
          {item.fileSize && <span>{formatBytes(item.fileSize)}</span>}
        </div>
      </div>

      {/* Action overlay */}
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/20 to-transparent pointer-events-none group-hover:pointer-events-auto">
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            className="rounded-md bg-white/90 dark:bg-neutral-800/90 px-2 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-white dark:hover:bg-neutral-700 shadow-sm transition-colors"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          className="rounded-md bg-white/90 dark:bg-neutral-800/90 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 shadow-sm transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ContentLibraryProps {
  userId?: string;
  onUploadClick?: () => void;
  onEditContent?: (item: ContentItem) => void;
}

export function ContentLibrary({ onUploadClick, onEditContent }: ContentLibraryProps) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "">("");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchContent = useCallback(
    async (opts: {
      page: number;
      search: string;
      status: ContentStatus | "";
      sortBy: SortField;
      sortOrder: SortOrder;
    }) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("page", String(opts.page));
        params.set("limit", "20");
        params.set("sortBy", opts.sortBy);
        params.set("sortOrder", opts.sortOrder);
        if (opts.search) params.set("search", opts.search);
        if (opts.status) params.set("status", opts.status);

        const res = await fetch(`/api/content?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "Failed to load content");
        }

        const data: ListResponse = await res.json();
        setItems(data.items);
        setTotal(data.total);
        setPages(data.pages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load content");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Trigger fetch when filters change
  useEffect(() => {
    fetchContent({ page, search, status: statusFilter, sortBy, sortOrder });
  }, [page, statusFilter, sortBy, sortOrder, fetchContent]);

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchContent({ page: 1, search: value, status: statusFilter, sortBy, sortOrder });
    }, 350);
  };

  const handleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(items.map((i) => i.id)));
    } else {
      setSelected(new Set());
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this video? This cannot be undone.")) return;
    try {
      await fetch(`/api/content/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
      setTotal((t) => t - 1);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      setError("Failed to delete content");
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item(s)? This cannot be undone.`)) return;

    try {
      await fetch("/api/content/bulk/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const deletedIds = new Set(selected);
      setItems((prev) => prev.filter((i) => !deletedIds.has(i.id)));
      setTotal((t) => t - deletedIds.size);
      setSelected(new Set());
    } catch {
      setError("Failed to delete selected content");
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = selected.size > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            placeholder="Search videos..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 pl-9 pr-4 py-2 text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ContentStatus | "");
              setPage(1);
            }}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="PUBLISHING">Publishing</option>
            <option value="PUBLISHED">Published</option>
            <option value="FAILED">Failed</option>
          </select>

          {/* Sort */}
          <select
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split(":") as [SortField, SortOrder];
              setSortBy(field);
              setSortOrder(order);
              setPage(1);
            }}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
            aria-label="Sort by"
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="title:asc">Title A-Z</option>
            <option value="title:desc">Title Z-A</option>
            <option value="scheduledAt:desc">Scheduled (latest)</option>
            <option value="scheduledAt:asc">Scheduled (earliest)</option>
          </select>

          {onUploadClick && (
            <button
              type="button"
              onClick={onUploadClick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Upload
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div
          className="flex items-center justify-between rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-4 py-2"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors"
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {/* Select-all header */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => handleSelectAll(e.target.checked)}
            aria-label="Select all"
            className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
          />
          <span>
            {total} {total === 1 ? "video" : "videos"}
          </span>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden"
              aria-hidden="true"
            >
              <div className="aspect-video bg-neutral-200 dark:bg-neutral-800" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-3/4" />
                <div className="h-3 bg-neutral-100 dark:bg-neutral-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg
            className="mb-4 h-12 w-12 text-neutral-300 dark:text-neutral-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {search || statusFilter ? "No videos match your filters" : "No videos yet"}
          </p>
          {!search && !statusFilter && onUploadClick && (
            <button
              type="button"
              onClick={onUploadClick}
              className="mt-3 text-sm text-violet-600 dark:text-violet-400 underline underline-offset-2 hover:no-underline"
            >
              Upload your first video
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onEdit={onEditContent}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div
          className="flex items-center justify-center gap-2"
          role="navigation"
          aria-label="Pagination"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            Previous
          </button>

          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Page {page} of {pages}
          </span>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

