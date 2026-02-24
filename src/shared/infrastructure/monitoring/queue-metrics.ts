import { Queue } from "bullmq";
import {
  publishQueue,
  analyticsQueue,
  tokenRefreshQueue,
  deadLetterQueue,
  QUEUE_NAMES,
  QueueName,
} from "../queues/queue-config";

export interface QueueCounts {
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
}

export interface QueueMetrics {
  name: QueueName;
  counts: QueueCounts;
  throughput?: ThroughputMetrics;
}

export interface ThroughputMetrics {
  completedLastMinute: number;
  failedLastMinute: number;
  avgProcessingTimeMs: number | null;
}

export interface AllQueueMetrics {
  queues: QueueMetrics[];
  totals: QueueCounts;
  collectedAt: string;
}

async function getQueueCounts(queue: Queue): Promise<QueueCounts> {
  const [active, waiting, delayed, completed, failed] =
    await Promise.all([
      queue.getActiveCount(),
      queue.getWaitingCount(),
      queue.getDelayedCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

  return { active, waiting, delayed, completed, failed, paused: 0 };
}

/**
 * Approximate throughput by inspecting recently completed/failed jobs.
 * BullMQ does not expose built-in throughput metrics, so we sample the
 * most recent N jobs and calculate an average processing time.
 */
async function getThroughputMetrics(queue: Queue): Promise<ThroughputMetrics> {
  const oneMinuteAgo = Date.now() - 60_000;

  const [recentCompleted, recentFailed] = await Promise.all([
    queue.getJobs(["completed"], 0, 50),
    queue.getJobs(["failed"], 0, 50),
  ]);

  const completedLastMinute = recentCompleted.filter(
    (j) => j.finishedOn && j.finishedOn > oneMinuteAgo
  ).length;

  const failedLastMinute = recentFailed.filter(
    (j) => j.finishedOn && j.finishedOn > oneMinuteAgo
  ).length;

  // Calculate average processing time from completed jobs that have timing data
  const processingTimes = recentCompleted
    .filter((j) => j.processedOn && j.finishedOn)
    .map((j) => j.finishedOn! - j.processedOn!);

  const avgProcessingTimeMs =
    processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : null;

  return { completedLastMinute, failedLastMinute, avgProcessingTimeMs };
}

/**
 * Collect metrics from all queues.
 */
export async function getAllQueueMetrics(): Promise<AllQueueMetrics> {
  const queueEntries: Array<{ name: QueueName; queue: Queue }> = [
    { name: QUEUE_NAMES.PUBLISH, queue: publishQueue },
    { name: QUEUE_NAMES.ANALYTICS, queue: analyticsQueue },
    { name: QUEUE_NAMES.TOKEN_REFRESH, queue: tokenRefreshQueue },
    { name: QUEUE_NAMES.DEAD_LETTER, queue: deadLetterQueue },
  ];

  const queues = await Promise.all(
    queueEntries.map(async ({ name, queue }) => {
      const [counts, throughput] = await Promise.all([
        getQueueCounts(queue),
        getThroughputMetrics(queue),
      ]);
      return { name, counts, throughput };
    })
  );

  const totals: QueueCounts = queues.reduce(
    (acc, { counts }) => ({
      active: acc.active + counts.active,
      waiting: acc.waiting + counts.waiting,
      delayed: acc.delayed + counts.delayed,
      completed: acc.completed + counts.completed,
      failed: acc.failed + counts.failed,
      paused: acc.paused + counts.paused,
    }),
    { active: 0, waiting: 0, delayed: 0, completed: 0, failed: 0, paused: 0 }
  );

  return {
    queues,
    totals,
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Get metrics for the publish queue only.
 */
export async function getPublishQueueMetrics(): Promise<QueueMetrics> {
  const [counts, throughput] = await Promise.all([
    getQueueCounts(publishQueue),
    getThroughputMetrics(publishQueue),
  ]);

  return { name: QUEUE_NAMES.PUBLISH, counts, throughput };
}
