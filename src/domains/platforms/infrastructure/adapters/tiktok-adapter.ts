import {
  AnalyticsData,
  ContentPayload,
  HealthStatus,
  Platform,
  PlatformAccount,
  PlatformAdapter,
  PublishResult,
  RateLimitStatus,
  ValidationResult,
} from "../../domain/platform-adapter";
import { RateLimiter, calculateBackoff, sleep } from "../rate-limiter";
import { CircuitBreaker } from "../circuit-breaker";

const PLATFORM = Platform.TIKTOK;
const MAX_RETRIES = 3;

export class TikTokAdapter implements PlatformAdapter {
  readonly platform = PLATFORM;

  private rateLimiter = new RateLimiter();
  private circuitBreaker = new CircuitBreaker();

  async publishContent(
    account: PlatformAccount,
    content: ContentPayload
  ): Promise<PublishResult> {
    // Circuit breaker check
    if (!(await this.circuitBreaker.isAllowed(PLATFORM))) {
      return {
        success: false,
        error: "TikTok circuit breaker is OPEN — requests temporarily blocked",
      };
    }

    // Rate limit check
    const { allowed, status } = await this.rateLimiter.checkAndConsume(
      PLATFORM,
      account.id
    );
    if (!allowed) {
      return {
        success: false,
        error: `TikTok rate limit exceeded. Resets at ${status.resetAt.toISOString()}`,
        rateLimitHit: true,
      };
    }

    // Adaptive throttling delay
    const delay = this.rateLimiter.getAdaptiveDelay(status);
    if (delay > 0) {
      await sleep(delay);
    }

    // Retry loop with exponential backoff + jitter
    let lastError = "";
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this.callTikTokPublishApi(account, content);
        await this.circuitBreaker.recordSuccess(PLATFORM);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await this.circuitBreaker.recordFailure(PLATFORM);

        if (attempt < MAX_RETRIES - 1) {
          const backoff = calculateBackoff(attempt);
          console.warn(
            `[TikTokAdapter] publish attempt ${attempt + 1} failed: ${lastError}. ` +
              `Retrying in ${backoff.toFixed(0)}ms`
          );
          await sleep(backoff);
        }
      }
    }

    return { success: false, error: `TikTok publish failed after ${MAX_RETRIES} attempts: ${lastError}` };
  }

  async getAnalytics(
    account: PlatformAccount,
    platformPostId: string
  ): Promise<AnalyticsData> {
    if (!(await this.circuitBreaker.isAllowed(PLATFORM))) {
      throw new Error("TikTok circuit breaker is OPEN");
    }

    const { allowed } = await this.rateLimiter.checkAndConsume(PLATFORM, account.id);
    if (!allowed) {
      throw new Error("TikTok rate limit exceeded");
    }

    // Stub — replace with real TikTok Research API call
    return {
      platformPostId,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      fetchedAt: new Date(),
    };
  }

  async validateAccount(account: PlatformAccount): Promise<ValidationResult> {
    try {
      // TikTok: verify token by calling user info endpoint
      const response = await fetch("https://open.tiktokapis.com/v2/user/info/", {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        return { valid: false, error: "Token expired or revoked", tokenExpired: true };
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        return { valid: false, error: `TikTok API error: ${JSON.stringify(body)}` };
      }

      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Network error validating TikTok account",
      };
    }
  }

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    // Returns aggregate status without a specific account (uses a sentinel key)
    return this.rateLimiter.getStatus(PLATFORM, "global");
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const response = await fetch("https://open.tiktokapis.com/v2/", {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      // Any reachable response (even 401) means the API is up
      const latencyMs = Date.now() - start;
      const healthy = response.status < 500;

      if (healthy) {
        await this.circuitBreaker.recordSuccess(PLATFORM);
      } else {
        await this.circuitBreaker.recordFailure(PLATFORM);
      }

      return {
        platform: PLATFORM,
        healthy,
        latencyMs,
        checkedAt: new Date(),
      };
    } catch (err) {
      await this.circuitBreaker.recordFailure(PLATFORM);
      return {
        platform: PLATFORM,
        healthy: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Health check failed",
        checkedAt: new Date(),
      };
    }
  }

  // ─── Private API helpers ────────────────────────────────────────────────────

  private async callTikTokPublishApi(
    account: PlatformAccount,
    content: ContentPayload
  ): Promise<PublishResult> {
    // TikTok Content Posting API (stub)
    // Real implementation would:
    // 1. Upload video to TikTok via their upload URL
    // 2. Poll for upload completion
    // 3. Publish with caption/privacy settings
    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title: content.title,
            description: content.description ?? "",
            privacy_level: "PUBLIC_TO_EVERYONE",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: "FILE_UPLOAD",
          },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(`TikTok API ${response.status}: ${JSON.stringify(body)}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return {
      success: true,
      platformPostId: (data as { data?: { publish_id?: string } })?.data?.publish_id,
      publishedAt: new Date(),
    };
  }
}
