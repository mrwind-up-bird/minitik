import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/apps/web/app/api/auth/[...nextauth]/route";
import {
  listAccounts,
  connectAccount,
  disconnectAccount,
  forceTokenRefresh,
  initiateOAuthFlow,
  AccountLimitError,
  AccountNotFoundError,
  AccountAccessError,
} from "@/domains/accounts/application/account-service";
import { OAuthProvider } from "@/domains/accounts/infrastructure/oauth-providers";

const VALID_PROVIDERS: OAuthProvider[] = ["tiktok", "instagram", "youtube"];

// In-memory rate limiting for auth attempts (IP → { count, resetAt })
// In production, use Redis with the existing redis client
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET /api/accounts
 * List all connected accounts for the authenticated user.
 */
export async function handleListAccounts(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  const accounts = await listAccounts(userId);
  return NextResponse.json({ accounts });
}

/**
 * POST /api/accounts/initiate
 * Begin an OAuth PKCE flow — returns the authorization URL.
 * Body: { provider: "tiktok" | "instagram" | "youtube" }
 */
export async function handleInitiateOAuth(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return errorResponse("Rate limit exceeded. Try again in a minute.", 429);
  }

  const body = await req.json().catch(() => null);
  const provider = body?.provider as OAuthProvider | undefined;
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return errorResponse("Invalid provider. Must be tiktok, instagram, or youtube.", 400);
  }

  const { authorizationUrl, pkce } = initiateOAuthFlow(provider);

  // The caller must store pkce.codeVerifier and pkce.state in a secure session/cookie
  return NextResponse.json({
    authorizationUrl,
    state: pkce.state,
    codeVerifier: pkce.codeVerifier, // client must persist this for callback
  });
}

/**
 * POST /api/accounts/connect
 * Complete an OAuth PKCE flow with the callback code.
 * Body: { provider, code, codeVerifier, platformAccountId, platformUsername? }
 */
export async function handleConnectAccount(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return errorResponse("Rate limit exceeded. Try again in a minute.", 429);
  }

  const body = await req.json().catch(() => null);
  if (!body) return errorResponse("Invalid request body", 400);

  const { provider, code, codeVerifier, platformAccountId, platformUsername } = body;

  if (!provider || !VALID_PROVIDERS.includes(provider as OAuthProvider)) {
    return errorResponse("Invalid provider", 400);
  }
  if (!code || typeof code !== "string") return errorResponse("Missing code", 400);
  if (!codeVerifier || typeof codeVerifier !== "string")
    return errorResponse("Missing codeVerifier", 400);

  try {
    const account = await connectAccount({
      userId,
      provider: provider as OAuthProvider,
      code,
      codeVerifier,
      platformAccountId: typeof platformAccountId === "string" ? platformAccountId : undefined,
      platformUsername: typeof platformUsername === "string" ? platformUsername : undefined,
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof AccountLimitError) {
      return errorResponse(error.message, 422);
    }
    console.error("Account connect error:", error);
    return errorResponse("Failed to connect account", 500);
  }
}

/**
 * DELETE /api/accounts/:id
 * Disconnect a platform account.
 */
export async function handleDisconnectAccount(
  req: NextRequest,
  accountId: string
): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  try {
    await disconnectAccount(accountId, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      return errorResponse(error.message, 404);
    }
    if (error instanceof AccountAccessError) {
      return errorResponse(error.message, 403);
    }
    console.error("Account disconnect error:", error);
    return errorResponse("Failed to disconnect account", 500);
  }
}

/**
 * POST /api/accounts/:id/refresh
 * Force a token refresh for a connected account.
 */
export async function handleRefreshToken(
  req: NextRequest,
  accountId: string
): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  try {
    const account = await forceTokenRefresh(accountId, userId);
    return NextResponse.json({ account });
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      return errorResponse(error.message, 404);
    }
    if (error instanceof AccountAccessError) {
      return errorResponse(error.message, 403);
    }
    console.error("Token refresh error:", error);
    return errorResponse("Failed to refresh token", 500);
  }
}
