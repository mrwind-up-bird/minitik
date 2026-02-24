import {
  AnalyticsData,
  CircuitBreakerState,
  ContentPayload,
  DeleteResult,
  HealthStatus,
  Platform,
  PlatformAccount,
  PlatformAdapter,
  PublishResult,
  RateLimitStatus,
  ValidationResult,
} from "../domain/platform-adapter";
import { TikTokAdapter } from "../infrastructure/adapters/tiktok-adapter";
import { InstagramAdapter } from "../infrastructure/adapters/instagram-adapter";
import { YouTubeAdapter } from "../infrastructure/adapters/youtube-adapter";
import { CircuitBreaker } from "../infrastructure/circuit-breaker";
import { RateLimiter } from "../infrastructure/rate-limiter";

// ─── PlatformService ──────────────────────────────────────────────────────────

export class PlatformService {
  private adapters: Map<Platform, PlatformAdapter>;
  private circuitBreaker = new CircuitBreaker();
  private rateLimiter = new RateLimiter();

  constructor() {
    this.adapters = new Map<Platform, PlatformAdapter>([
      [Platform.TIKTOK, new TikTokAdapter()],
      [Platform.INSTAGRAM, new InstagramAdapter()],
      [Platform.YOUTUBE, new YouTubeAdapter()],
    ]);
  }

  getAdapter(platform: Platform): PlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter registered for platform: ${platform}`);
    }
    return adapter;
  }

  // ─── Publish ──────────────────────────────────────────────────────────────

  async publishContent(
    account: PlatformAccount,
    content: ContentPayload
  ): Promise<PublishResult> {
    const adapter = this.getAdapter(account.platform);
    return adapter.publishContent(account, content);
  }

  // ─── Delete ─────────────────────────────────────────────────────────────

  async deletePost(
    account: PlatformAccount,
    platformPostId: string
  ): Promise<DeleteResult> {
    const adapter = this.getAdapter(account.platform);
    return adapter.deletePost(account, platformPostId);
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  async getAnalytics(
    account: PlatformAccount,
    platformPostId: string
  ): Promise<AnalyticsData> {
    const adapter = this.getAdapter(account.platform);
    return adapter.getAnalytics(account, platformPostId);
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  async validateAccount(account: PlatformAccount): Promise<ValidationResult> {
    const adapter = this.getAdapter(account.platform);
    return adapter.validateAccount(account);
  }

  // ─── Rate limit status ─────────────────────────────────────────────────────

  async getRateLimitStatus(
    platform: Platform,
    accountId: string
  ): Promise<RateLimitStatus> {
    return this.rateLimiter.getStatus(platform, accountId);
  }

  async getAllRateLimitStatuses(accountId: string): Promise<RateLimitStatus[]> {
    return Promise.all(
      Object.values(Platform).map((p) => this.rateLimiter.getStatus(p as Platform, accountId))
    );
  }

  // ─── Health checks ─────────────────────────────────────────────────────────

  async checkHealth(platform: Platform): Promise<HealthStatus> {
    const adapter = this.getAdapter(platform);
    return adapter.healthCheck();
  }

  async checkAllHealth(): Promise<HealthStatus[]> {
    return Promise.all(
      Array.from(this.adapters.values()).map((adapter) => adapter.healthCheck())
    );
  }

  // ─── Circuit breaker status ────────────────────────────────────────────────

  async getCircuitBreakerStatus(platform: Platform): Promise<{
    state: CircuitBreakerState;
    failures: number;
    openedAt?: Date;
  }> {
    return this.circuitBreaker.getMetrics(platform);
  }

  async getAllCircuitBreakerStatuses(): Promise<
    Record<Platform, { state: CircuitBreakerState; failures: number; openedAt?: Date }>
  > {
    const results = await Promise.all(
      Object.values(Platform).map(async (p) => ({
        platform: p as Platform,
        metrics: await this.circuitBreaker.getMetrics(p as Platform),
      }))
    );

    return Object.fromEntries(
      results.map(({ platform, metrics }) => [platform, metrics])
    ) as Record<Platform, { state: CircuitBreakerState; failures: number; openedAt?: Date }>;
  }
}

// Singleton for use across the app
let platformServiceInstance: PlatformService | null = null;

export function getPlatformService(): PlatformService {
  if (!platformServiceInstance) {
    platformServiceInstance = new PlatformService();
  }
  return platformServiceInstance;
}
