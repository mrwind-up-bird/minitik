import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/apps/web/app/api/auth/[...nextauth]/route";
import { getPlatformService } from "@/domains/platforms/application/platform-service";
import { Platform } from "@/domains/platforms/domain/platform-adapter";

const VALID_PLATFORMS: Platform[] = [Platform.TIKTOK, Platform.INSTAGRAM, Platform.YOUTUBE];

async function getAuthenticatedUserId(_req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function parsePlatform(value: string | null | undefined): Platform | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (VALID_PLATFORMS.includes(upper as Platform)) return upper as Platform;
  return null;
}

// ─── GET /api/platforms/health ────────────────────────────────────────────────
// Returns health status for all platforms (or a single platform via ?platform=)

export async function handlePlatformHealth(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  const service = getPlatformService();
  const { searchParams } = new URL(req.url);
  const platformParam = searchParams.get("platform");

  try {
    if (platformParam) {
      const platform = parsePlatform(platformParam);
      if (!platform) {
        return errorResponse(
          `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}`,
          400
        );
      }
      const status = await service.checkHealth(platform);
      return NextResponse.json({ health: status });
    }

    const statuses = await service.checkAllHealth();
    return NextResponse.json({ health: statuses });
  } catch (err) {
    console.error("[platforms/health] error:", err);
    return errorResponse("Failed to retrieve platform health", 500);
  }
}

// ─── GET /api/platforms/rate-limits ──────────────────────────────────────────
// Returns rate limit status for the authenticated user's accounts.
// Query: ?accountId=<id>&platform=<TIKTOK|INSTAGRAM|YOUTUBE>
// Without accountId, returns statuses across all platforms using "global".

export async function handleRateLimitStatus(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  const service = getPlatformService();
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId") ?? userId; // fall back to userId as key
  const platformParam = searchParams.get("platform");

  try {
    if (platformParam) {
      const platform = parsePlatform(platformParam);
      if (!platform) {
        return errorResponse(
          `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}`,
          400
        );
      }
      const status = await service.getRateLimitStatus(platform, accountId);
      return NextResponse.json({ rateLimit: status });
    }

    const statuses = await service.getAllRateLimitStatuses(accountId);
    return NextResponse.json({ rateLimits: statuses });
  } catch (err) {
    console.error("[platforms/rate-limits] error:", err);
    return errorResponse("Failed to retrieve rate limit status", 500);
  }
}

// ─── GET /api/platforms/circuit-breakers ─────────────────────────────────────
// Returns circuit breaker state for all platforms (admin/internal use).

export async function handleCircuitBreakerStatus(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  const service = getPlatformService();
  const { searchParams } = new URL(req.url);
  const platformParam = searchParams.get("platform");

  try {
    if (platformParam) {
      const platform = parsePlatform(platformParam);
      if (!platform) {
        return errorResponse(
          `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}`,
          400
        );
      }
      const metrics = await service.getCircuitBreakerStatus(platform);
      return NextResponse.json({ circuitBreaker: { platform, ...metrics } });
    }

    const allMetrics = await service.getAllCircuitBreakerStatuses();
    return NextResponse.json({ circuitBreakers: allMetrics });
  } catch (err) {
    console.error("[platforms/circuit-breakers] error:", err);
    return errorResponse("Failed to retrieve circuit breaker status", 500);
  }
}

// ─── POST /api/platforms/validate ────────────────────────────────────────────
// Validate a platform account token.
// Body: { accountId, platform, platformAccountId, accessToken }
// Note: In production, fetch the account from DB. This endpoint accepts the
// minimal fields needed to validate without exposing stored tokens.

export async function handleValidateAccount(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  if (!body) return errorResponse("Invalid request body", 400);

  const { accountId, platform: platformRaw, platformAccountId, accessToken } = body;

  if (!accountId || typeof accountId !== "string")
    return errorResponse("Missing accountId", 400);
  if (!platformAccountId || typeof platformAccountId !== "string")
    return errorResponse("Missing platformAccountId", 400);
  if (!accessToken || typeof accessToken !== "string")
    return errorResponse("Missing accessToken", 400);

  const platform = parsePlatform(platformRaw);
  if (!platform) {
    return errorResponse(
      `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}`,
      400
    );
  }

  const service = getPlatformService();

  try {
    const result = await service.validateAccount({
      id: accountId,
      userId,
      platform,
      platformAccountId,
      accessToken,
    });
    return NextResponse.json({ validation: result });
  } catch (err) {
    console.error("[platforms/validate] error:", err);
    return errorResponse("Failed to validate account", 500);
  }
}
