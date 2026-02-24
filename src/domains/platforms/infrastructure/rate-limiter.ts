import { getRedis } from "@/shared/infrastructure/database/redis";
import { Platform, RateLimitStatus } from "../domain/platform-adapter";

// ─── Rate limit configuration (50% of platform limits) ───────────────────────

interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

const RATE_LIMIT_CONFIGS: Record<Platform, RateLimitConfig> = {
  [Platform.TIKTOK]: {
    limit: 50,          // 50 req/hour (50% of ~100 req/hour)
    windowSeconds: 3600,
  },
  [Platform.INSTAGRAM]: {
    limit: 100,         // 100 req/hour (50% of 200 req/hour)
    windowSeconds: 3600,
  },
  [Platform.YOUTUBE]: {
    limit: 5000,        // 5000 quota units/day (50% of 10000)
    windowSeconds: 86400,
  },
};

// ─── Redis key helpers ────────────────────────────────────────────────────────

function getRateLimitKey(platform: Platform, accountId: string): string {
  return `rate_limit:${platform.toLowerCase()}:${accountId}`;
}

function getBucketKey(platform: Platform, accountId: string, bucketMinute: number): string {
  return `rate_limit:${platform.toLowerCase()}:${accountId}:${bucketMinute}`;
}

// ─── Sliding window rate limiter ──────────────────────────────────────────────
//
// Uses 1-minute buckets across the configured window.
// Each bucket stores the count for that minute and expires automatically.
// The total across all live buckets is compared against the limit.

export class RateLimiter {
  private redis = getRedis();

  async checkAndConsume(
    platform: Platform,
    accountId: string,
    cost = 1
  ): Promise<{ allowed: boolean; status: RateLimitStatus }> {
    const config = RATE_LIMIT_CONFIGS[platform];
    const nowSeconds = Math.floor(Date.now() / 1000);
    const currentMinute = Math.floor(nowSeconds / 60);
    const windowMinutes = Math.ceil(config.windowSeconds / 60);
    const earliestMinute = currentMinute - windowMinutes + 1;

    // Build keys for all minutes in the current window
    const bucketKeys: string[] = [];
    for (let m = earliestMinute; m <= currentMinute; m++) {
      bucketKeys.push(getBucketKey(platform, accountId, m));
    }

    const currentBucketKey = getBucketKey(platform, accountId, currentMinute);
    const metaKey = getRateLimitKey(platform, accountId);

    // Use a pipeline to get all bucket counts atomically
    const pipeline = this.redis.pipeline();
    for (const key of bucketKeys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();

    let total = 0;
    if (results) {
      for (const [err, val] of results) {
        if (!err && val !== null) {
          total += parseInt(val as string, 10) || 0;
        }
      }
    }

    const remaining = Math.max(0, config.limit - total);
    const resetAt = new Date((Math.floor(nowSeconds / config.windowSeconds) + 1) * config.windowSeconds * 1000);

    const status: RateLimitStatus = {
      platform,
      remaining,
      limit: config.limit,
      resetAt,
      windowSeconds: config.windowSeconds,
    };

    if (total + cost > config.limit) {
      // Rate limit exceeded — log violation
      console.warn(
        `[RateLimiter] LIMIT EXCEEDED platform=${platform} accountId=${accountId} ` +
          `total=${total} cost=${cost} limit=${config.limit}`
      );
      // Store last violation timestamp
      await this.redis.set(
        `${metaKey}:last_violation`,
        nowSeconds.toString(),
        "EX",
        config.windowSeconds
      );
      return { allowed: false, status };
    }

    // Consume: increment current minute bucket
    const consumePipeline = this.redis.pipeline();
    consumePipeline.incrby(currentBucketKey, cost);
    // Expire bucket slightly after the window so the count naturally slides out
    consumePipeline.expire(currentBucketKey, config.windowSeconds + 120);
    await consumePipeline.exec();

    status.remaining = Math.max(0, config.limit - total - cost);
    return { allowed: true, status };
  }

  async getStatus(platform: Platform, accountId: string): Promise<RateLimitStatus> {
    const config = RATE_LIMIT_CONFIGS[platform];
    const nowSeconds = Math.floor(Date.now() / 1000);
    const currentMinute = Math.floor(nowSeconds / 60);
    const windowMinutes = Math.ceil(config.windowSeconds / 60);
    const earliestMinute = currentMinute - windowMinutes + 1;

    const bucketKeys: string[] = [];
    for (let m = earliestMinute; m <= currentMinute; m++) {
      bucketKeys.push(getBucketKey(platform, accountId, m));
    }

    const pipeline = this.redis.pipeline();
    for (const key of bucketKeys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();

    let total = 0;
    if (results) {
      for (const [err, val] of results) {
        if (!err && val !== null) {
          total += parseInt(val as string, 10) || 0;
        }
      }
    }

    const resetAt = new Date(
      (Math.floor(nowSeconds / config.windowSeconds) + 1) * config.windowSeconds * 1000
    );

    return {
      platform,
      remaining: Math.max(0, config.limit - total),
      limit: config.limit,
      resetAt,
      windowSeconds: config.windowSeconds,
    };
  }

  // Adaptive throttling: returns a delay in ms based on utilisation
  getAdaptiveDelay(status: RateLimitStatus): number {
    const utilisation = 1 - status.remaining / status.limit;
    if (utilisation < 0.7) return 0;
    if (utilisation < 0.85) return 500;
    if (utilisation < 0.95) return 2000;
    return 5000;
  }
}

// ─── Exponential backoff with jitter ─────────────────────────────────────────

export function calculateBackoff(attempt: number): number {
  const base = Math.pow(2, attempt) * 100;
  const jitter = Math.random() * 100;
  return Math.min(base + jitter, 30_000);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
