import { NextRequest, NextResponse } from "next/server";
import type { TimeRange } from "../../../domains/analytics/infrastructure/analytics-repository";
import type { ExportFormat } from "../../../domains/analytics/infrastructure/analytics-exporter";
import {
  getDashboard,
  getContentAnalytics,
  triggerManualRefresh,
  requestExport,
} from "../../../domains/analytics/application/analytics-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

const VALID_TIME_RANGES: TimeRange[] = ["7d", "14d", "30d", "90d", "365d"];

function parseTimeRange(value: string | null): TimeRange {
  if (value && (VALID_TIME_RANGES as string[]).includes(value)) {
    return value as TimeRange;
  }
  return "30d";
}

function parsePlatforms(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const platforms = value
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  return platforms.length > 0 ? platforms : undefined;
}

// ─── GET /api/analytics/dashboard ────────────────────────────────────────────
// Query params: timeRange (7d|14d|30d|90d|365d), platforms (comma-separated)

export async function dashboardHandler(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { searchParams } = new URL(req.url);
  const timeRange = parseTimeRange(searchParams.get("timeRange"));
  const platforms = parsePlatforms(searchParams.get("platforms"));

  try {
    const data = await getDashboard({ userId, timeRange, platforms });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load dashboard";
    return jsonError(message, 500);
  }
}

// ─── GET /api/analytics/content/:id ──────────────────────────────────────────

export async function contentMetricsHandler(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { id: contentId } = params;
  if (!contentId) return jsonError("Content ID is required", 400);

  const { searchParams } = new URL(req.url);
  const timeRange = parseTimeRange(searchParams.get("timeRange"));

  try {
    const data = await getContentAnalytics(contentId, userId, timeRange);
    if (!data) return jsonError("Content not found", 404);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load content metrics";
    return jsonError(message, 500);
  }
}

// ─── POST /api/analytics/export ──────────────────────────────────────────────

export async function exportHandler(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { timeRange: rawTimeRange, format: rawFormat, platforms: rawPlatforms } =
    body as Record<string, unknown>;

  const timeRange = parseTimeRange(
    typeof rawTimeRange === "string" ? rawTimeRange : null
  );

  const format: ExportFormat =
    rawFormat === "csv" || rawFormat === "json" ? rawFormat : "csv";

  const platforms =
    Array.isArray(rawPlatforms)
      ? (rawPlatforms as string[]).map((p) => String(p).toUpperCase())
      : undefined;

  try {
    const result = await requestExport({ userId, timeRange, format, platforms });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return jsonError(message, 500);
  }
}

// ─── POST /api/analytics/refresh ─────────────────────────────────────────────

export async function refreshHandler(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  try {
    const result = await triggerManualRefresh(userId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && "nextAllowedAt" in err) {
      return NextResponse.json(
        {
          error: err.message,
          nextAllowedAt: (err as Error & { nextAllowedAt: Date }).nextAllowedAt,
        },
        { status: 429 }
      );
    }
    const message = err instanceof Error ? err.message : "Refresh failed";
    return jsonError(message, 500);
  }
}
