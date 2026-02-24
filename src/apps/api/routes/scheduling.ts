import { NextRequest, NextResponse } from "next/server";
import { JobPriority } from "@prisma/client";
import {
  schedulePost,
  bulkSchedulePosts,
  cancelScheduledJob,
  getScheduledJobStatus,
  listUserJobs,
} from "../../../domains/scheduling/application/scheduling-service";
import { getAllQueueMetrics } from "../../../shared/infrastructure/monitoring/queue-metrics";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function parseJobPriority(value: unknown): JobPriority {
  if (value === "HIGH" || value === "NORMAL" || value === "LOW") return value;
  return "NORMAL";
}

/**
 * Extract the current user ID from the request.
 * In production this would verify the session/JWT. Replace with real auth.
 */
function getUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

// ─── POST /api/scheduling/schedule ───────────────────────────────────────────

export async function scheduleHandler(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { contentId, accountIds, scheduledAt, timezone, priority } =
    body as Record<string, unknown>;

  if (!contentId || typeof contentId !== "string") {
    return jsonError("contentId is required", 400);
  }
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return jsonError("accountIds must be a non-empty array", 400);
  }
  if (!scheduledAt || typeof scheduledAt !== "string") {
    return jsonError("scheduledAt is required (ISO 8601 string)", 400);
  }
  if (!timezone || typeof timezone !== "string") {
    return jsonError("timezone is required", 400);
  }

  const scheduledAtDate = new Date(scheduledAt);
  if (isNaN(scheduledAtDate.getTime())) {
    return jsonError("scheduledAt is not a valid date", 400);
  }

  try {
    const result = await schedulePost({
      userId,
      contentId,
      accountIds: accountIds as string[],
      scheduledAt: scheduledAtDate,
      timezone,
      priority: parseJobPriority(priority),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scheduling failed";
    const status = message.includes("Not authorized") ? 403 : 400;
    return jsonError(message, status);
  }
}

// ─── POST /api/scheduling/bulk ───────────────────────────────────────────────

export async function bulkScheduleHandler(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { posts } = body as Record<string, unknown>;

  if (!Array.isArray(posts) || posts.length === 0) {
    return jsonError("posts must be a non-empty array", 400);
  }

  const parsedPosts = (posts as Array<Record<string, unknown>>).map((p) => ({
    contentId: p.contentId as string,
    accountIds: (p.accountIds as string[]) ?? [],
    scheduledAt: new Date(p.scheduledAt as string),
    timezone: (p.timezone as string) ?? "UTC",
    priority: parseJobPriority(p.priority),
  }));

  try {
    const result = await bulkSchedulePosts({ userId, posts: parsedPosts });
    return NextResponse.json(result, { status: 207 }); // 207 Multi-Status
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk scheduling failed";
    return jsonError(message, 400);
  }
}

// ─── GET /api/scheduling/jobs/:id ────────────────────────────────────────────

export async function getJobStatusHandler(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = params;
  if (!id) return jsonError("Job ID is required", 400);

  try {
    const status = await getScheduledJobStatus(id, userId);
    if (!status) return jsonError("Job not found", 404);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get job status";
    const code = message.includes("Not authorized") ? 403 : 500;
    return jsonError(message, code);
  }
}

// ─── DELETE /api/scheduling/jobs/:id ─────────────────────────────────────────

export async function cancelJobHandler(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = params;
  if (!id) return jsonError("Job ID is required", 400);

  try {
    await cancelScheduledJob(id, userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to cancel job";
    const code = message.includes("Not authorized") ? 403 : 400;
    return jsonError(message, code);
  }
}

// ─── GET /api/scheduling/queue/stats ─────────────────────────────────────────

export async function queueStatsHandler(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  // In production: restrict to admin roles. Currently any authenticated user
  // can view aggregate stats (no per-user data exposed).
  try {
    const metrics = await getAllQueueMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch metrics";
    return jsonError(message, 500);
  }
}

// ─── GET /api/scheduling/jobs (list user jobs) ────────────────────────────────

export async function listJobsHandler(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status") as
    | "PENDING"
    | "ACTIVE"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | null;

  try {
    const jobs = await listUserJobs(userId, statusParam ?? undefined);
    return NextResponse.json(jobs);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list jobs";
    return jsonError(message, 500);
  }
}
