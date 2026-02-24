// Platform enum mirrors the Prisma schema
export enum Platform {
  TIKTOK = "TIKTOK",
  INSTAGRAM = "INSTAGRAM",
  YOUTUBE = "YOUTUBE",
}

// ─── Account / Content types (lightweight, not importing Prisma directly) ────

export interface PlatformAccount {
  id: string;
  userId: string;
  platform: Platform;
  platformAccountId: string;
  platformUsername?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}

export interface ContentPayload {
  id: string;
  title: string;
  description?: string | null;
  filePath?: string | null;
  thumbnailPath?: string | null;
  mimeType?: string | null;
  duration?: number | null;
  metadata?: Record<string, unknown> | null;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  publishedAt?: Date;
  error?: string;
  rateLimitHit?: boolean;
}

export interface AnalyticsData {
  platformPostId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach?: number;
  impressions?: number;
  fetchedAt: Date;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  tokenExpired?: boolean;
  scopes?: string[];
}

export interface RateLimitStatus {
  platform: Platform;
  remaining: number;
  limit: number;
  resetAt: Date;
  windowSeconds: number;
}

export interface HealthStatus {
  platform: Platform;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: Date;
}

// ─── Circuit breaker state ────────────────────────────────────────────────────

export enum CircuitBreakerState {
  CLOSED = "CLOSED",     // Normal operation
  OPEN = "OPEN",         // Blocking all requests
  HALF_OPEN = "HALF_OPEN", // Allowing probe request
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface PlatformAdapter {
  readonly platform: Platform;

  publishContent(
    account: PlatformAccount,
    content: ContentPayload
  ): Promise<PublishResult>;

  getAnalytics(
    account: PlatformAccount,
    platformPostId: string
  ): Promise<AnalyticsData>;

  validateAccount(account: PlatformAccount): Promise<ValidationResult>;

  getRateLimitStatus(): Promise<RateLimitStatus>;

  healthCheck(): Promise<HealthStatus>;
}
