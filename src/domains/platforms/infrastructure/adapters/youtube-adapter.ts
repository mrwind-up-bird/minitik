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

const PLATFORM = Platform.YOUTUBE;
const MAX_RETRIES = 3;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per chunk for resumable upload

// YouTube quota costs per operation (approximate)
// videos.insert = 1600 units, videos.list = 1 unit, channels.list = 1 unit
const UPLOAD_QUOTA_COST = 1600;
const ANALYTICS_QUOTA_COST = 1;

export class YouTubeAdapter implements PlatformAdapter {
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
        error: "YouTube circuit breaker is OPEN — requests temporarily blocked",
      };
    }

    // Videos.insert costs ~1600 quota units
    const { allowed, status } = await this.rateLimiter.checkAndConsume(
      PLATFORM,
      account.id,
      UPLOAD_QUOTA_COST
    );
    if (!allowed) {
      return {
        success: false,
        error: `YouTube quota exceeded. Resets at ${status.resetAt.toISOString()}`,
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
        const result = await this.callYouTubeUploadApi(account, content);
        await this.circuitBreaker.recordSuccess(PLATFORM);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await this.circuitBreaker.recordFailure(PLATFORM);

        if (attempt < MAX_RETRIES - 1) {
          const backoff = calculateBackoff(attempt);
          console.warn(
            `[YouTubeAdapter] publish attempt ${attempt + 1} failed: ${lastError}. ` +
              `Retrying in ${backoff.toFixed(0)}ms`
          );
          await sleep(backoff);
        }
      }
    }

    return {
      success: false,
      error: `YouTube publish failed after ${MAX_RETRIES} attempts: ${lastError}`,
    };
  }

  async getAnalytics(
    account: PlatformAccount,
    platformPostId: string
  ): Promise<AnalyticsData> {
    if (!(await this.circuitBreaker.isAllowed(PLATFORM))) {
      throw new Error("YouTube circuit breaker is OPEN");
    }

    const { allowed } = await this.rateLimiter.checkAndConsume(
      PLATFORM,
      account.id,
      ANALYTICS_QUOTA_COST
    );
    if (!allowed) {
      throw new Error("YouTube quota exceeded");
    }

    const params = new URLSearchParams({
      part: "statistics",
      id: platformPostId,
      access_token: account.accessToken,
    });

    const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`YouTube API ${response.status}: ${JSON.stringify(body)}`);
    }

    const data = await response.json() as {
      items?: Array<{
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
          favoriteCount?: string;
        };
      }>;
    };

    const stats = data.items?.[0]?.statistics ?? {};
    return {
      platformPostId,
      views: parseInt(stats.viewCount ?? "0", 10),
      likes: parseInt(stats.likeCount ?? "0", 10),
      comments: parseInt(stats.commentCount ?? "0", 10),
      shares: 0, // YouTube API doesn't expose share counts
      fetchedAt: new Date(),
    };
  }

  async validateAccount(account: PlatformAccount): Promise<ValidationResult> {
    try {
      const params = new URLSearchParams({
        part: "snippet",
        mine: "true",
        access_token: account.accessToken,
      });

      const response = await fetch(`${YOUTUBE_API_BASE}/channels?${params}`);

      if (response.status === 401) {
        return { valid: false, error: "Token expired or revoked", tokenExpired: true };
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { valid: false, error: `YouTube API error: ${JSON.stringify(body)}` };
      }

      const data = await response.json() as { items?: unknown[] };
      if (!data.items || data.items.length === 0) {
        return { valid: false, error: "No YouTube channel found for this account" };
      }

      return { valid: true, scopes: ["youtube.upload", "youtube.readonly"] };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Network error validating YouTube account",
      };
    }
  }

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return this.rateLimiter.getStatus(PLATFORM, "global");
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const response = await fetch(
        `${YOUTUBE_API_BASE}/videos?part=id&chart=mostPopular&maxResults=1&key=health_check`,
        { signal: AbortSignal.timeout(5000) }
      );
      const latencyMs = Date.now() - start;
      // 400 (bad API key) still means the API is reachable
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

  private async callYouTubeUploadApi(
    account: PlatformAccount,
    content: ContentPayload
  ): Promise<PublishResult> {
    // YouTube Data API v3 — resumable upload
    // Step 1: Initiate a resumable upload session
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": content.mimeType ?? "video/mp4",
        },
        body: JSON.stringify({
          snippet: {
            title: content.title,
            description: content.description ?? "",
            categoryId: "22", // People & Blogs
          },
          status: {
            privacyStatus: "public",
            selfDeclaredMadeForKids: false,
          },
        }),
      }
    );

    if (!initRes.ok) {
      const body = await initRes.json().catch(() => ({}));
      throw new Error(`YouTube initiate upload ${initRes.status}: ${JSON.stringify(body)}`);
    }

    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("YouTube upload: no resumable upload URL returned");
    }

    // Step 2: Resolve video file size from S3
    if (!content.filePath) {
      throw new Error("No video file path provided");
    }

    const videoUrl = await getPresignedDownloadUrl(content.filePath);
    const headRes = await fetch(videoUrl, { method: "HEAD" });
    const videoSize = parseInt(headRes.headers.get("content-length") ?? "0", 10);
    if (!videoSize) {
      throw new Error("Could not determine video file size from S3");
    }

    const mimeType = content.mimeType ?? "video/mp4";
    const totalChunks = Math.ceil(videoSize / CHUNK_SIZE);

    console.log(
      `[YouTubeAdapter] upload: ${videoSize} bytes, ${totalChunks} chunk(s) to resumable URL`
    );

    // Step 3: Stream video to YouTube in chunks
    let finalResponse: Response | null = null;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE - 1, videoSize - 1);
      const currentSize = end - start + 1;

      // Download chunk from S3 via byte-range request
      const s3Res = await fetch(videoUrl, {
        headers: { Range: `bytes=${start}-${end}` },
      });
      const chunkData = await s3Res.arrayBuffer();

      // PUT chunk to YouTube resumable upload URL
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(currentSize),
          "Content-Range": `bytes ${start}-${end}/${videoSize}`,
        },
        body: chunkData,
      });

      // 308 Resume Incomplete = chunk accepted, more expected
      // 200/201 = upload complete, response contains video resource
      if (uploadRes.status === 200 || uploadRes.status === 201) {
        finalResponse = uploadRes;
        break;
      }

      if (uploadRes.status !== 308) {
        const errText = await uploadRes.text().catch(() => "");
        throw new Error(
          `YouTube chunk upload failed (${i + 1}/${totalChunks}): ${uploadRes.status} ${errText}`
        );
      }

      console.log(
        `[YouTubeAdapter] chunk ${i + 1}/${totalChunks} accepted (${currentSize} bytes)`
      );
    }

    if (!finalResponse) {
      throw new Error("YouTube upload: no final response after all chunks sent");
    }

    // Step 4: Parse video resource for real video ID
    const videoResource = (await finalResponse.json()) as {
      id?: string;
      snippet?: { publishedAt?: string };
    };

    const videoId = videoResource.id;
    if (!videoId) {
      throw new Error("YouTube upload completed but no video ID in response");
    }

    console.log(`[YouTubeAdapter] upload complete: videoId=${videoId}`);

    return {
      success: true,
      platformPostId: videoId,
      publishedAt: videoResource.snippet?.publishedAt
        ? new Date(videoResource.snippet.publishedAt)
        : new Date(),
    };
  }
}
