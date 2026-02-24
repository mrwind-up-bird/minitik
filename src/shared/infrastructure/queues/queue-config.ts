import { Queue, QueueOptions } from "bullmq";
import { createBullConnection } from "../database/redis";

export const QUEUE_NAMES = {
  PUBLISH: "publish",
  ANALYTICS: "analytics",
  TOKEN_REFRESH: "token-refresh",
  DEAD_LETTER: "dead-letter",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2000, // 2s base -> 2s, 4s, 8s
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

const sharedQueueOptions: QueueOptions = {
  connection: createBullConnection(),
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
};

export const publishQueue = new Queue(QUEUE_NAMES.PUBLISH, sharedQueueOptions);

export const analyticsQueue = new Queue(QUEUE_NAMES.ANALYTICS, {
  connection: createBullConnection(),
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const tokenRefreshQueue = new Queue(QUEUE_NAMES.TOKEN_REFRESH, {
  connection: createBullConnection(),
  defaultJobOptions: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 5,
  },
});

export const deadLetterQueue = new Queue(QUEUE_NAMES.DEAD_LETTER, {
  connection: createBullConnection(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
  },
});

export function getQueue(name: QueueName): Queue {
  switch (name) {
    case QUEUE_NAMES.PUBLISH:
      return publishQueue;
    case QUEUE_NAMES.ANALYTICS:
      return analyticsQueue;
    case QUEUE_NAMES.TOKEN_REFRESH:
      return tokenRefreshQueue;
    case QUEUE_NAMES.DEAD_LETTER:
      return deadLetterQueue;
    default:
      throw new Error(`Unknown queue: ${name}`);
  }
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([
    publishQueue.close(),
    analyticsQueue.close(),
    tokenRefreshQueue.close(),
    deadLetterQueue.close(),
  ]);
}
