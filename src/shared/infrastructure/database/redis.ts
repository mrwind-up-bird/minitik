import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (redisInstance) return redisInstance;

  redisInstance = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
    reconnectOnError(err) {
      const targetError = "READONLY";
      if (err.message.includes(targetError)) return true;
      return false;
    },
    lazyConnect: true,
  });

  redisInstance.on("error", (err) => {
    console.error("[Redis] Connection error:", err.message);
  });

  redisInstance.on("connect", () => {
    console.log("[Redis] Connected");
  });

  return redisInstance;
}

// Separate connection for BullMQ (needs dedicated connection)
export function createBullConnection(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });
}

export async function closeRedisConnection(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}

export default getRedis;
