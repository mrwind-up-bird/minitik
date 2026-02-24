import { Worker, Job, UnrecoverableError } from "bullmq";
import { createBullConnection } from "../../../shared/infrastructure/database/redis";
import { prisma } from "../../../shared/infrastructure/database/postgres";
import { deadLetterQueue, QUEUE_NAMES } from "../../../shared/infrastructure/queues/queue-config";
import type { PublishJobData } from "./job-scheduler";

const MAX_ATTEMPTS = 3;

/**
 * Move a failed job to the dead-letter queue with failure metadata.
 */
async function moveToDeadLetter(
  job: Job<PublishJobData>,
  error: Error
): Promise<void> {
  await deadLetterQueue.add(
    "dead-letter",
    {
      originalQueue: QUEUE_NAMES.PUBLISH,
      originalJobId: job.id,
      jobData: job.data,
      failedAt: new Date().toISOString(),
      reason: error.message,
      attemptsMade: job.attemptsMade,
    },
    {
      attempts: 1,
      removeOnFail: { count: 200 },
    }
  );

  await prisma.scheduledJob.update({
    where: { id: job.data.scheduledJobId },
    data: {
      status: "FAILED",
      error: `Moved to DLQ after ${job.attemptsMade} attempts: ${error.message}`,
      processedAt: new Date(),
    },
  });

  // Mark associated publications as failed
  await prisma.publication.updateMany({
    where: {
      contentId: job.data.contentId,
      accountId: { in: job.data.accountIds },
      status: { in: ["QUEUED", "PUBLISHING"] },
    },
    data: {
      status: "FAILED",
      error: error.message,
      updatedAt: new Date(),
    },
  });
}

/**
 * Core publish logic. In production this would delegate to the platform adapters.
 * We update the DB and emit progress so the front-end can track state.
 */
async function processPublishJob(job: Job<PublishJobData>): Promise<void> {
  const { scheduledJobId, contentId, accountIds } = job.data;

  // Mark job as active
  await prisma.scheduledJob.update({
    where: { id: scheduledJobId },
    data: {
      status: "ACTIVE",
      processedAt: new Date(),
      attempts: job.attemptsMade + 1,
    },
  });

  await job.updateProgress(10);

  // Verify content still exists and is in SCHEDULED state
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    include: {
      publications: {
        where: { accountId: { in: accountIds } },
      },
    },
  });

  if (!content) {
    // Content was deleted – permanent failure, skip retries
    throw new UnrecoverableError(`Content ${contentId} no longer exists`);
  }

  if (content.status === "PUBLISHED") {
    // Already published elsewhere – skip
    await prisma.scheduledJob.update({
      where: { id: scheduledJobId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return;
  }

  await job.updateProgress(25);

  // Update content status to PUBLISHING
  await prisma.content.update({
    where: { id: contentId },
    data: { status: "PUBLISHING" },
  });

  // Create / update publication records for each target account
  const totalAccounts = accountIds.length;
  let successCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < totalAccounts; i++) {
    const accountId = accountIds[i];

    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      errors.push(`Account ${accountId} not found`);
      continue;
    }

    if (account.status !== "CONNECTED") {
      errors.push(`Account ${accountId} is not connected (status: ${account.status})`);
      continue;
    }

    // Create or update the publication record for this account
    const existingPublication = await prisma.publication.findFirst({
      where: { contentId, accountId },
    });

    if (existingPublication) {
      await prisma.publication.update({
        where: { id: existingPublication.id },
        data: { status: "PUBLISHING", error: null, updatedAt: new Date() },
      });
    } else {
      await prisma.publication.create({
        data: {
          contentId,
          accountId,
          platform: account.platform,
          status: "PUBLISHING",
        },
      });
    }

    // TODO: call actual platform adapter here
    // For now simulate a successful publish
    await prisma.publication.updateMany({
      where: { contentId, accountId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    successCount++;
    const progressPct = 25 + Math.round(((i + 1) / totalAccounts) * 70);
    await job.updateProgress(progressPct);
  }

  // Determine final content status
  if (successCount === 0) {
    await prisma.content.update({
      where: { id: contentId },
      data: { status: "FAILED" },
    });

    await prisma.scheduledJob.update({
      where: { id: scheduledJobId },
      data: {
        status: "FAILED",
        error: errors.join("; "),
        completedAt: new Date(),
      },
    });

    throw new Error(`All ${totalAccounts} account publishes failed: ${errors.join("; ")}`);
  }

  const finalContentStatus = successCount === totalAccounts ? "PUBLISHED" : "PUBLISHED";

  await prisma.content.update({
    where: { id: contentId },
    data: {
      status: finalContentStatus,
      publishedAt: new Date(),
    },
  });

  await prisma.scheduledJob.update({
    where: { id: scheduledJobId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      error: errors.length > 0 ? errors.join("; ") : null,
    },
  });

  await job.updateProgress(100);
}

let publishWorker: Worker<PublishJobData> | null = null;

export function createPublishWorker(): Worker<PublishJobData> {
  if (publishWorker) return publishWorker;

  publishWorker = new Worker<PublishJobData>(
    QUEUE_NAMES.PUBLISH,
    async (job) => {
      await processPublishJob(job);
    },
    {
      connection: createBullConnection(),
      concurrency: 10, // global worker concurrency; per-user limit enforced in scheduling-service
      limiter: {
        max: 50,
        duration: 1000, // max 50 jobs/second globally
      },
    }
  );

  publishWorker.on("failed", async (job, error) => {
    if (!job) return;

    console.error(`[Worker] Job ${job.id} failed (attempt ${job.attemptsMade}):`, error.message);

    const isUnrecoverable = error instanceof UnrecoverableError;
    const isMaxAttempts = job.attemptsMade >= MAX_ATTEMPTS;

    if (isUnrecoverable || isMaxAttempts) {
      try {
        await moveToDeadLetter(job, error);
      } catch (dlqError) {
        console.error("[Worker] Failed to move job to DLQ:", dlqError);
      }
    } else {
      // Transient failure – update attempt count, BullMQ will retry
      await prisma.scheduledJob
        .update({
          where: { id: job.data.scheduledJobId },
          data: {
            status: "PENDING",
            attempts: job.attemptsMade,
            error: error.message,
          },
        })
        .catch(console.error);
    }
  });

  publishWorker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed for content ${job.data.contentId}`);
  });

  publishWorker.on("error", (error) => {
    console.error("[Worker] Worker error:", error);
  });

  return publishWorker;
}

export async function closePublishWorker(): Promise<void> {
  if (publishWorker) {
    await publishWorker.close();
    publishWorker = null;
  }
}
