import { JobPriority } from "@prisma/client";
import { prisma } from "../../../shared/infrastructure/database/postgres";
import {
  scheduleJob,
  cancelJob,
  getJobState,
  toUtc,
} from "../infrastructure/job-scheduler";

// ─── Limits ──────────────────────────────────────────────────────────────────

const MAX_CONCURRENT_PER_USER = 5;
const MAX_ADVANCE_DAYS = 30;
const MAX_BULK_COUNT = 20;

// ─── Input types ─────────────────────────────────────────────────────────────

export interface SchedulePostInput {
  userId: string;
  contentId: string;
  accountIds: string[];
  scheduledAt: Date;
  timezone: string;
  priority?: JobPriority;
}

export interface BulkSchedulePostInput {
  userId: string;
  posts: Array<{
    contentId: string;
    accountIds: string[];
    scheduledAt: Date;
    timezone: string;
    priority?: JobPriority;
  }>;
}

export interface ScheduleResult {
  scheduledJobId: string;
  scheduledAt: Date;
  priority: JobPriority;
}

export interface BulkScheduleResult {
  scheduled: ScheduleResult[];
  failed: Array<{ contentId: string; reason: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function assertUserConcurrencyLimit(userId: string): Promise<void> {
  // Count active+pending jobs owned by this user
  const activeCount = await prisma.scheduledJob.count({
    where: {
      status: { in: ["PENDING", "ACTIVE"] },
      content: { userId },
    },
  });

  if (activeCount >= MAX_CONCURRENT_PER_USER) {
    throw new Error(
      `User has reached the concurrent scheduling limit of ${MAX_CONCURRENT_PER_USER} jobs`
    );
  }
}

function assertWithinAdvanceLimit(scheduledAt: Date): void {
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + MAX_ADVANCE_DAYS);

  if (scheduledAt > maxDate) {
    throw new Error(
      `Cannot schedule more than ${MAX_ADVANCE_DAYS} days in advance`
    );
  }
}

async function assertContentOwnership(
  contentId: string,
  userId: string
): Promise<void> {
  const content = await prisma.content.findFirst({
    where: { id: contentId, userId },
  });

  if (!content) {
    throw new Error(
      `Content ${contentId} not found or not owned by user ${userId}`
    );
  }
}

async function assertAccountsOwnership(
  accountIds: string[],
  userId: string
): Promise<void> {
  const owned = await prisma.account.findMany({
    where: { id: { in: accountIds }, userId },
    select: { id: true },
  });

  if (owned.length !== accountIds.length) {
    const ownedIds = new Set(owned.map((a) => a.id));
    const missing = accountIds.filter((id) => !ownedIds.has(id));
    throw new Error(`Accounts not found or not owned: ${missing.join(", ")}`);
  }
}

// ─── Service methods ──────────────────────────────────────────────────────────

/**
 * Schedule a single post for publishing.
 */
export async function schedulePost(
  input: SchedulePostInput
): Promise<ScheduleResult> {
  const {
    userId,
    contentId,
    accountIds,
    scheduledAt,
    timezone,
    priority = "NORMAL",
  } = input;

  assertWithinAdvanceLimit(scheduledAt);
  await assertUserConcurrencyLimit(userId);
  await assertContentOwnership(contentId, userId);
  await assertAccountsOwnership(accountIds, userId);

  const utcScheduledAt = toUtc(scheduledAt, timezone);

  const scheduledJobId = await scheduleJob({
    contentId,
    accountIds,
    scheduledAt: utcScheduledAt,
    timezone,
    priority,
    userId,
  });

  // Update content status to SCHEDULED
  await prisma.content.update({
    where: { id: contentId },
    data: {
      status: "SCHEDULED",
      scheduledAt: utcScheduledAt,
    },
  });

  return {
    scheduledJobId,
    scheduledAt: utcScheduledAt,
    priority,
  };
}

/**
 * Bulk schedule up to MAX_BULK_COUNT posts.
 * Failures for individual posts are collected and returned rather than aborting the entire batch.
 */
export async function bulkSchedulePosts(
  input: BulkSchedulePostInput
): Promise<BulkScheduleResult> {
  const { userId, posts } = input;

  if (posts.length === 0) {
    throw new Error("Must provide at least one post to schedule");
  }

  if (posts.length > MAX_BULK_COUNT) {
    throw new Error(
      `Cannot schedule more than ${MAX_BULK_COUNT} posts at once (received ${posts.length})`
    );
  }

  const scheduled: ScheduleResult[] = [];
  const failed: Array<{ contentId: string; reason: string }> = [];

  for (const post of posts) {
    try {
      const result = await schedulePost({
        userId,
        contentId: post.contentId,
        accountIds: post.accountIds,
        scheduledAt: post.scheduledAt,
        timezone: post.timezone,
        priority: post.priority ?? "NORMAL",
      });
      scheduled.push(result);
    } catch (err) {
      failed.push({
        contentId: post.contentId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { scheduled, failed };
}

/**
 * Cancel a scheduled job. Only PENDING jobs can be cancelled.
 */
export async function cancelScheduledJob(
  scheduledJobId: string,
  userId: string
): Promise<void> {
  const job = await prisma.scheduledJob.findUnique({
    where: { id: scheduledJobId },
    include: { content: { select: { userId: true } } },
  });

  if (!job) {
    throw new Error(`Scheduled job ${scheduledJobId} not found`);
  }

  if (job.content.userId !== userId) {
    throw new Error("Not authorized to cancel this job");
  }

  if (job.status !== "PENDING") {
    throw new Error(
      `Cannot cancel a job in status "${job.status}". Only PENDING jobs can be cancelled.`
    );
  }

  await cancelJob(scheduledJobId);

  // Revert content status to DRAFT
  await prisma.content.update({
    where: { id: job.contentId },
    data: { status: "DRAFT", scheduledAt: null },
  });
}

/**
 * Get the full status of a scheduled job including BullMQ progress.
 */
export async function getScheduledJobStatus(
  scheduledJobId: string,
  userId: string
) {
  const state = await getJobState(scheduledJobId);

  if (!state) {
    return null;
  }

  // Verify ownership
  const content = await prisma.content.findFirst({
    where: { id: state.contentId, userId },
    select: { id: true },
  });

  if (!content) {
    throw new Error("Not authorized to view this job");
  }

  return state;
}

/**
 * List all scheduled jobs for a user (optionally filtered by status).
 */
export async function listUserJobs(
  userId: string,
  status?: "PENDING" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED"
) {
  return prisma.scheduledJob.findMany({
    where: {
      content: { userId },
      ...(status ? { status } : {}),
    },
    include: {
      content: {
        select: { id: true, title: true, status: true, mimeType: true },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });
}
