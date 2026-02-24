import {
  AnalyticsData,
  ContentPayload,
  DeleteResult,
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
import { getPresignedDownloadUrl } from "../../../content/infrastructure/s3-storage";

const PLATFORM = Platform.INSTAGRAM;
const MAX_RETRIES = 3;
const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

export class InstagramAdapter implements PlatformAdapter {
  readonly platform = PLATFORM;

  private rateLimiter = new RateLimiter();
  private circuitBreaker = new CircuitBreaker();

  async publishContent(
    account: PlatformAccount,
    content: ContentPayload
  ): Promise<PublishResult> {
    if (!(await this.circuitBreaker.isAllowed(PLATFORM))) {
      return {
        success: false,
        error: "Instagram circuit breaker is OPEN — requests temporarily blocked",
      };
    }

    const { allowed, status } = await this.rateLimiter.checkAndConsume(
      PLATFORM,
      account.id
    );
    if (!allowed) {
      return {
        success: false,
        error: `Instagram rate limit exceeded. Resets at ${status.resetAt.toISOString()}`,
        rateLimitHit: true,
      };
    }

    const delay = this.rateLimiter.getAdaptiveDelay(status);
    if (delay > 0) {
      await sleep(delay);
    }

    let lastError = "";
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this.callInstagramPublishApi(account, content);
        await this.circuitBreaker.recordSuccess(PLATFORM);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await this.circuitBreaker.recordFailure(PLATFORM);

        if (attempt < MAX_RETRIES - 1) {
          const backoff = calculateBackoff(attempt);
          console.warn(
            `[InstagramAdapter] publish attempt ${attempt + 1} failed: ${lastError}. ` +
              `Retrying in ${backoff.toFixed(0)}ms`
          );
          await sleep(backoff);
        }
      }
    }

    return {
      success: false,
      error: `Instagram publish failed after ${MAX_RETRIES} attempts: ${lastError}`,
    };
  }

  async getAnalytics(
    account: PlatformAccount,
    platformPostId: string
  ): Promise<AnalyticsData> {
    if (!(await this.circuitBreaker.isAllowed(PLATFORM))) {
      throw new Error("Instagram circuit breaker is OPEN");
    }

    const { allowed } = await this.rateLimiter.checkAndConsume(PLATFORM, account.id);
    if (!allowed) {
      throw new Error("Instagram rate limit exceeded");
    }

    const fields = "like_count,comments_count,reach,impressions";
    const url = `${GRAPH_API_BASE}/${platformPostId}?fields=${fields}&access_token=${account.accessToken}`;

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(`Instagram API ${response.status}: ${JSON.stringify(body)}`);
    }

    const data = await response.json() as {
      like_count?: number;
      comments_count?: number;
      reach?: number;
      impressions?: number;
      video_views?: number;
    };

    return {
      platformPostId,
      views: data.video_views ?? 0,
      likes: data.like_count ?? 0,
      comments: data.comments_count ?? 0,
      shares: 0, // Instagram Graph API doesn't expose shares
      reach: data.reach,
      impressions: data.impressions,
      fetchedAt: new Date(),
    };
  }

  async validateAccount(account: PlatformAccount): Promise<ValidationResult> {
    try {
      const url = `${GRAPH_API_BASE}/me?fields=id,username&access_token=${account.accessToken}`;
      const response = await fetch(url);

      if (response.status === 401 || response.status === 400) {
        const body = await response.json().catch(() => ({})) as { error?: { code?: number } };
        const code = body?.error?.code;
        // Code 190 = token expired/invalid
        if (code === 190) {
          return { valid: false, error: "Token expired or invalid", tokenExpired: true };
        }
        return { valid: false, error: `Instagram auth error (code ${code})` };
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { valid: false, error: `Instagram API error: ${JSON.stringify(body)}` };
      }

      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Network error validating Instagram account",
      };
    }
  }

  async deletePost(
    account: PlatformAccount,
    platformPostId: string
  ): Promise<DeleteResult> {
    try {
      const url = `${GRAPH_API_BASE}/${platformPostId}?access_token=${encodeURIComponent(account.accessToken)}`;
      const res = await fetch(url, { method: "DELETE" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { success: false, error: `Instagram delete ${res.status}: ${JSON.stringify(body)}` };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return this.rateLimiter.getStatus(PLATFORM, "global");
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const response = await fetch(`https://graph.instagram.com/`, {
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - start;
      const healthy = response.status < 500;

      if (healthy) {
        await this.circuitBreaker.recordSuccess(PLATFORM);
      } else {
        await this.circuitBreaker.recordFailure(PLATFORM);
      }

      return { platform: PLATFORM, healthy, latencyMs, checkedAt: new Date() };
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

  private async callInstagramPublishApi(
    account: PlatformAccount,
    content: ContentPayload
  ): Promise<PublishResult> {
    // Instagram Graph API — two-step Reels/video publish:
    if (!content.filePath) {
      throw new Error("No video file path provided");
    }

    // Generate a public presigned URL from the S3 key — Instagram must be able to fetch it
    const videoUrl = await getPresignedDownloadUrl(content.filePath);

    // Step 1: Create media container
    const containerUrl = `${GRAPH_API_BASE}/${account.platformAccountId}/media`;
    const containerRes = await fetch(containerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption: `${content.title}\n\n${content.description ?? ""}`.trim(),
        access_token: account.accessToken,
      }),
    });

    if (!containerRes.ok) {
      const body = await containerRes.json().catch(() => ({}));
      throw new Error(`Instagram container create ${containerRes.status}: ${JSON.stringify(body)}`);
    }

    const containerData = await containerRes.json() as { id?: string };
    const containerId = containerData.id;
    if (!containerId) {
      throw new Error("Instagram container create returned no ID");
    }

    // Step 2: Publish the container
    const publishUrl = `${GRAPH_API_BASE}/${account.platformAccountId}/media_publish`;
    const publishRes = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: account.accessToken,
      }),
    });

    if (!publishRes.ok) {
      const body = await publishRes.json().catch(() => ({}));
      throw new Error(`Instagram publish ${publishRes.status}: ${JSON.stringify(body)}`);
    }

    const publishData = await publishRes.json() as { id?: string };
    return {
      success: true,
      platformPostId: publishData.id,
      publishedAt: new Date(),
    };
  }
}
