import { prisma } from "@/shared/infrastructure/database/postgres";
import { AccountStatus, Platform } from "@prisma/client";
import { refreshAccessToken, OAuthProvider } from "./oauth-providers";
import { encrypt, safeDecrypt } from "./token-encryption";

const REFRESH_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function platformToProvider(platform: Platform): OAuthProvider {
  switch (platform) {
    case "TIKTOK":
      return "tiktok";
    case "INSTAGRAM":
      return "instagram";
    case "YOUTUBE":
      return "youtube";
  }
}

/** Returns true if the token expires within the threshold window */
export function isTokenExpiringSoon(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() <= REFRESH_THRESHOLD_MS;
}

/** Returns true if the token is already expired */
export function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= Date.now();
}

/**
 * Refresh a single account's tokens if needed.
 * Updates the DB and returns the new access token (plaintext).
 * Returns null if the refresh cannot be performed.
 */
export async function refreshAccountToken(accountId: string): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account || !account.refreshToken) return null;
  if (account.status === "REVOKED") return null;

  const plainRefreshToken = safeDecrypt(account.refreshToken);
  if (!plainRefreshToken) {
    await prisma.account.update({
      where: { id: accountId },
      data: { status: AccountStatus.ERROR },
    });
    return null;
  }

  try {
    const provider = platformToProvider(account.platform);
    const newTokens = await refreshAccessToken(provider, plainRefreshToken);

    await prisma.account.update({
      where: { id: accountId },
      data: {
        accessToken: encrypt(newTokens.accessToken),
        refreshToken: newTokens.refreshToken
          ? encrypt(newTokens.refreshToken)
          : account.refreshToken,
        tokenExpiresAt: newTokens.expiresAt,
        status: AccountStatus.CONNECTED,
        lastSyncAt: new Date(),
      },
    });

    return newTokens.accessToken;
  } catch (error) {
    console.error(`Token refresh failed for account ${accountId}:`, error);

    await prisma.account.update({
      where: { id: accountId },
      data: { status: AccountStatus.EXPIRED },
    });

    return null;
  }
}

/**
 * Get a valid access token for an account, refreshing if needed.
 * Returns plaintext access token or null on failure.
 */
export async function getValidAccessToken(accountId: string): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) return null;
  if (account.status === "REVOKED") return null;

  const plainAccessToken = safeDecrypt(account.accessToken);
  if (!plainAccessToken) return null;

  // If token is not expiring soon, return it directly
  if (!isTokenExpiringSoon(account.tokenExpiresAt)) {
    return plainAccessToken;
  }

  // Token is expiring soon — try to refresh
  const refreshed = await refreshAccountToken(accountId);
  return refreshed ?? plainAccessToken;
}

/**
 * Scan all accounts for tokens expiring within the threshold and refresh them.
 * Designed to be called from a cron job or background worker.
 */
export async function refreshExpiringTokens(): Promise<{
  refreshed: number;
  failed: number;
}> {
  const threshold = new Date(Date.now() + REFRESH_THRESHOLD_MS);

  const expiringAccounts = await prisma.account.findMany({
    where: {
      status: AccountStatus.CONNECTED,
      tokenExpiresAt: { lte: threshold },
      refreshToken: { not: null },
    },
    select: { id: true },
  });

  let refreshed = 0;
  let failed = 0;

  await Promise.all(
    expiringAccounts.map(async ({ id }) => {
      const result = await refreshAccountToken(id);
      if (result) {
        refreshed++;
      } else {
        failed++;
      }
    })
  );

  return { refreshed, failed };
}
