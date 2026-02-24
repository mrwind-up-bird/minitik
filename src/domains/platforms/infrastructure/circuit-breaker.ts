import { getRedis } from "@/shared/infrastructure/database/redis";
import { CircuitBreakerState, Platform } from "../domain/platform-adapter";

// ─── Configuration ────────────────────────────────────────────────────────────

const FAILURE_THRESHOLD = 5;       // failures before opening
const FAILURE_WINDOW_SECONDS = 60; // count failures within this window
const OPEN_DURATION_SECONDS = 300; // stay open for 5 minutes
const HALF_OPEN_PROBE_TTL = 30;   // half-open probe window

// ─── Redis key helpers ────────────────────────────────────────────────────────

function stateKey(platform: Platform): string {
  return `circuit_breaker:${platform.toLowerCase()}:state`;
}

function failureCountKey(platform: Platform): string {
  return `circuit_breaker:${platform.toLowerCase()}:failures`;
}

function openedAtKey(platform: Platform): string {
  return `circuit_breaker:${platform.toLowerCase()}:opened_at`;
}

// ─── CircuitBreaker ───────────────────────────────────────────────────────────

export class CircuitBreaker {
  private redis = getRedis();

  async getState(platform: Platform): Promise<CircuitBreakerState> {
    const state = await this.redis.get(stateKey(platform));

    if (!state || state === CircuitBreakerState.CLOSED) {
      return CircuitBreakerState.CLOSED;
    }

    if (state === CircuitBreakerState.OPEN) {
      // Check if the cooldown period has elapsed
      const openedAt = await this.redis.get(openedAtKey(platform));
      if (openedAt) {
        const elapsed = Math.floor(Date.now() / 1000) - parseInt(openedAt, 10);
        if (elapsed >= OPEN_DURATION_SECONDS) {
          // Transition to HALF_OPEN to allow a probe request
          await this.redis.set(stateKey(platform), CircuitBreakerState.HALF_OPEN, "EX", HALF_OPEN_PROBE_TTL);
          console.log(`[CircuitBreaker] ${platform} -> HALF_OPEN after ${elapsed}s`);
          return CircuitBreakerState.HALF_OPEN;
        }
      }
      return CircuitBreakerState.OPEN;
    }

    if (state === CircuitBreakerState.HALF_OPEN) {
      return CircuitBreakerState.HALF_OPEN;
    }

    return CircuitBreakerState.CLOSED;
  }

  // Returns false when the circuit is OPEN (request should be blocked)
  async isAllowed(platform: Platform): Promise<boolean> {
    const state = await this.getState(platform);
    return state !== CircuitBreakerState.OPEN;
  }

  async recordSuccess(platform: Platform): Promise<void> {
    const state = await this.getState(platform);

    if (state === CircuitBreakerState.HALF_OPEN || state === CircuitBreakerState.OPEN) {
      // Probe succeeded — close the circuit
      await this.redis.del(stateKey(platform));
      await this.redis.del(failureCountKey(platform));
      await this.redis.del(openedAtKey(platform));
      console.log(`[CircuitBreaker] ${platform} -> CLOSED (recovered)`);
    }
    // In CLOSED state successes reset the sliding failure count
    // (failures are naturally sliding-window TTL-based, nothing to do)
  }

  async recordFailure(platform: Platform): Promise<void> {
    const state = await this.getState(platform);

    if (state === CircuitBreakerState.HALF_OPEN) {
      // Probe failed — reopen immediately
      await this.open(platform);
      return;
    }

    if (state === CircuitBreakerState.OPEN) {
      return; // Already open
    }

    // CLOSED: increment sliding failure counter
    const pipeline = this.redis.pipeline();
    pipeline.incr(failureCountKey(platform));
    pipeline.expire(failureCountKey(platform), FAILURE_WINDOW_SECONDS);
    const results = await pipeline.exec();

    const failureCount = results?.[0]?.[1] as number ?? 0;

    if (failureCount >= FAILURE_THRESHOLD) {
      await this.open(platform);
    } else {
      console.warn(
        `[CircuitBreaker] ${platform} failure ${failureCount}/${FAILURE_THRESHOLD}`
      );
    }
  }

  private async open(platform: Platform): Promise<void> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const pipeline = this.redis.pipeline();
    pipeline.set(stateKey(platform), CircuitBreakerState.OPEN, "EX", OPEN_DURATION_SECONDS + 60);
    pipeline.set(openedAtKey(platform), nowSeconds.toString(), "EX", OPEN_DURATION_SECONDS + 60);
    pipeline.del(failureCountKey(platform));
    await pipeline.exec();
    console.error(
      `[CircuitBreaker] ${platform} -> OPEN for ${OPEN_DURATION_SECONDS}s`
    );
  }

  async getMetrics(platform: Platform): Promise<{
    state: CircuitBreakerState;
    failures: number;
    openedAt?: Date;
  }> {
    const [state, failureCount, openedAt] = await Promise.all([
      this.getState(platform),
      this.redis.get(failureCountKey(platform)),
      this.redis.get(openedAtKey(platform)),
    ]);

    return {
      state,
      failures: parseInt(failureCount ?? "0", 10),
      openedAt: openedAt ? new Date(parseInt(openedAt, 10) * 1000) : undefined,
    };
  }
}
