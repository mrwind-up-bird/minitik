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
import { getPresignedDownloadUrl } from "../../../content/infrastructure/s3-storage";

const PLATFORM = Platform.TIKTOK;
const MAX_RETRIES = 3;
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB (TikTok: min 5 MB, max 64 MB)
const MAX_STATUS_POLLS = 30;

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

  /**
   * Full TikTok Content Posting API flow:
   * 1. Get video file size from S3
   * 2. POST /v2/post/publish/video/init/ → get upload_url + publish_id
   * 3. PUT video chunks to upload_url with Content-Range headers
   * 4. Poll /v2/post/publish/status/fetch/ until terminal state
   */
  private async callTikTokPublishApi(
    account: PlatformAccount,
    content: ContentPayload
  ): Promise<PublishResult> {
    if (!content.filePath) {
      throw new Error("No video file path provided");
    }

    // Step 1: Resolve video file size
    const videoUrl = await getPresignedDownloadUrl(content.filePath);
    const headRes = await fetch(videoUrl, { method: "HEAD" });
    const videoSize = parseInt(headRes.headers.get("content-length") ?? "0", 10);
    if (!videoSize) {
      throw new Error("Could not determine video file size from S3");
    }

    const chunkSize = Math.min(CHUNK_SIZE, videoSize);
    const totalChunkCount = Math.ceil(videoSize / chunkSize);

    console.log(
      `[TikTokAdapter] publish init: ${videoSize} bytes, ${totalChunkCount} chunks of ${chunkSize}`
    );

    // Step 2: Initialize upload
    const initRes = await fetch(
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
            video_size: videoSize,
            chunk_size: chunkSize,
            total_chunk_count: totalChunkCount,
          },
        }),
      }
    );

    if (!initRes.ok) {
      const body = await initRes.json().catch(() => ({}));
      throw new Error(`TikTok init ${initRes.status}: ${JSON.stringify(body)}`);
    }

    const initData = (await initRes.json()) as {
      data?: { publish_id?: string; upload_url?: string };
    };
    const publishId = initData.data?.publish_id;
    const uploadUrl = initData.data?.upload_url;

    if (!publishId || !uploadUrl) {
      throw new Error("TikTok init response missing publish_id or upload_url");
    }

    // Step 3: Upload video chunks sequentially
    const mimeType = content.mimeType ?? "video/mp4";

    for (let i = 0; i < totalChunkCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, videoSize - 1);
      const currentSize = end - start + 1;

      // Download chunk from S3 via byte-range request
      const s3Res = await fetch(videoUrl, {
        headers: { Range: `bytes=${start}-${end}` },
      });
      const chunkData = await s3Res.arrayBuffer();

      // PUT chunk to TikTok (no Authorization header on presigned upload URL)
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(currentSize),
          "Content-Range": `bytes ${start}-${end}/${videoSize}`,
        },
        body: chunkData,
      });

      // 201 = all chunks received, 206 = chunk accepted (more expected)
      if (uploadRes.status !== 201 && uploadRes.status !== 206) {
        const errText = await uploadRes.text().catch(() => "");
        throw new Error(
          `TikTok chunk upload failed (${i + 1}/${totalChunkCount}): ${uploadRes.status} ${errText}`
        );
      }

      console.log(
        `[TikTokAdapter] chunk ${i + 1}/${totalChunkCount} uploaded (${currentSize} bytes)`
      );
    }

    // Step 4: Poll publish status until terminal state
    const postId = await this.pollPublishStatus(account.accessToken, publishId);

    return {
      success: true,
      platformPostId: postId ?? publishId,
      publishedAt: new Date(),
    };
  }

  /**
   * Poll TikTok publish status with exponential backoff.
   * Returns the public post ID on success, or undefined if still processing
   * after max polls (the publish_id can still be used as a reference).
   */
  private async pollPublishStatus(
    accessToken: string,
    publishId: string
  ): Promise<string | undefined> {
    const BASE_DELAY_MS = 2000;

    for (let i = 0; i < MAX_STATUS_POLLS; i++) {
      const delay = Math.min(BASE_DELAY_MS * Math.pow(1.5, i), 30_000);
      await sleep(delay);

      const res = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({ publish_id: publishId }),
        }
      );

      if (!res.ok) continue;

      const data = (await res.json()) as {
        data?: {
          status?: string;
          fail_reason?: string;
          publicaly_available_post_id?: (string | number)[];
        };
      };
      const status = data.data?.status;

      if (status === "PUBLISH_COMPLETE") {
        const postIds = data.data?.publicaly_available_post_id;
        console.log(`[TikTokAdapter] publish complete: ${publishId}`);
        return Array.isArray(postIds) && postIds.length > 0
          ? String(postIds[0])
          : undefined;
      }

      if (status === "FAILED") {
        throw new Error(
          `TikTok publish failed: ${data.data?.fail_reason ?? "unknown reason"}`
        );
      }

      // PROCESSING_UPLOAD / PROCESSING_DOWNLOAD — keep polling
    }

    console.warn(
      `[TikTokAdapter] publish status still processing after ${MAX_STATUS_POLLS} polls: ${publishId}`
    );
    return undefined;
  }
}
