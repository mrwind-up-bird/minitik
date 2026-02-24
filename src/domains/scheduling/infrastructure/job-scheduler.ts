import { JobPriority } from "@prisma/client";
import { JobsOptions } from "bullmq";
import { publishQueue, DEFAULT_JOB_OPTIONS } from "../../../shared/infrastructure/queues/queue-config";
import { prisma } from "../../../shared/infrastructure/database/postgres";

export interface ScheduleJobInput {
  contentId: string;
  accountIds: string[];
  scheduledAt: Date;
  timezone: string;
  priority: JobPriority;
  userId: string;
}

export interface PublishJobData {
  scheduledJobId: string;
  contentId: string;
  accountIds: string[];
  userId: string;
  priority: JobPriority;
  scheduledAt: string;
  timezone: string;
}

// Map Prisma priority to BullMQ numeric priority (lower number = higher priority)
function mapPriority(priority: JobPriority): number {
  switch (priority) {
    case "HIGH":
      return 1;
    case "NORMAL":
      return 2;
    case "LOW":
      return 3;
  }
}

/**
 * Convert a local datetime in a given timezone to UTC.
 * Uses Intl.DateTimeFormat to determine the offset at the specific instant,
 * which handles DST transitions correctly.
 */
export function toUtc(localDate: Date, timezone: string): Date {
  // Use Intl to find local time components in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Get the UTC offset by comparing the parsed local time to the UTC epoch
  const parts = formatter.formatToParts(localDate);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const localYear = get("year");
  const localMonth = get("month") - 1;
  const localDay = get("day");
  const localHour = get("hour") === 24 ? 0 : get("hour");
  const localMinute = get("minute");
  const localSecond = get("second");

  // Construct a "fake UTC" date representing local time
  const localAsUtc = Date.UTC(
    localYear,
    localMonth,
    localDay,
    localHour,
    localMinute,
    localSecond
  );

  // The offset is the difference between the original timestamp and the local representation
  const offset = localAsUtc - localDate.getTime();
  return new Date(localDate.getTime() - offset);
}

/**
 * Check if a contentId+accountIds combination is already scheduled (deduplication).
 */
async function isDuplicate(
  contentId: string,
  accountIds: string[]
): Promise<boolean> {
  const sorted = [...accountIds].sort();
  const existing = await prisma.scheduledJob.findFirst({
    where: {
      contentId,
      status: { in: ["PENDING", "ACTIVE"] },
    },
  });

  if (!existing) return false;

  // Compare sorted arrays
  const existingSorted = [...existing.accountIds].sort();
  return (
    sorted.length === existingSorted.length &&
    sorted.every((id, i) => id === existingSorted[i])
  );
}

/**
 * Add a publish job to BullMQ with delay calculated from scheduledAt.
 */
export async function scheduleJob(input: ScheduleJobInput): Promise<string> {
  const {
    contentId,
    accountIds,
    scheduledAt,
    timezone,
    priority,
    userId,
  } = input;

  // Deduplicate
  if (await isDuplicate(contentId, accountIds)) {
    throw new Error(
      `Job already scheduled for contentId=${contentId} with the same accounts`
    );
  }

  // Convert scheduled time to UTC accounting for DST
  const utcScheduledAt = toUtc(scheduledAt, timezone);
  const delayMs = utcScheduledAt.getTime() - Date.now();

  if (delayMs < 0) {
    throw new Error("Cannot schedule a job in the past");
  }

  // Create DB record first so we have the ID for BullMQ job data
  const scheduledJob = await prisma.scheduledJob.create({
    data: {
      contentId,
      accountIds,
      scheduledAt: utcScheduledAt,
      timezone,
      priority,
      status: "PENDING",
      maxAttempts: 3,
    },
  });

  const jobData: PublishJobData = {
    scheduledJobId: scheduledJob.id,
    contentId,
    accountIds,
    userId,
    priority,
    scheduledAt: utcScheduledAt.toISOString(),
    timezone,
  };

  const jobOptions: JobsOptions = {
    ...DEFAULT_JOB_OPTIONS,
    delay: delayMs,
    priority: mapPriority(priority),
    jobId: `publish:${scheduledJob.id}`, // Ensures uniqueness in BullMQ
  };

  const bullJob = await publishQueue.add("publish-content", jobData, jobOptions);

  // Update DB record with BullMQ job ID
  await prisma.scheduledJob.update({
    where: { id: scheduledJob.id },
    data: { bullJobId: bullJob.id },
  });

  return scheduledJob.id;
}

/**
 * Cancel a scheduled job by removing it from BullMQ and updating the DB record.
 */
export async function cancelJob(scheduledJobId: string): Promise<void> {
  const scheduledJob = await prisma.scheduledJob.findUnique({
    where: { id: scheduledJobId },
  });

  if (!scheduledJob) {
    throw new Error(`ScheduledJob not found: ${scheduledJobId}`);
  }

  if (scheduledJob.status === "ACTIVE") {
    throw new Error("Cannot cancel a job that is already being processed");
  }

  if (scheduledJob.bullJobId) {
    const bullJob = await publishQueue.getJob(scheduledJob.bullJobId);
    if (bullJob) {
      await bullJob.remove();
    }
  }

  await prisma.scheduledJob.update({
    where: { id: scheduledJobId },
    data: { status: "CANCELLED" },
  });
}

/**
 * Get the BullMQ job state for a scheduled job.
 */
export async function getJobState(scheduledJobId: string) {
  const scheduledJob = await prisma.scheduledJob.findUnique({
    where: { id: scheduledJobId },
    include: { content: { select: { title: true, status: true } } },
  });

  if (!scheduledJob) return null;

  let bullJobState: string | null = null;
  let progress: unknown = 0;

  if (scheduledJob.bullJobId) {
    const bullJob = await publishQueue.getJob(scheduledJob.bullJobId);
    if (bullJob) {
      bullJobState = await bullJob.getState();
      progress = bullJob.progress;
    }
  }

  return {
    ...scheduledJob,
    bullJobState,
    progress,
  };
}
