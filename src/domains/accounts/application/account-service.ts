import { prisma } from "@/shared/infrastructure/database/postgres";
import { Account, AccountStatus, Platform } from "@prisma/client";
import { encrypt, safeDecrypt } from "../infrastructure/token-encryption";
import {
  OAuthProvider,
  exchangeCodeForTokens,
  buildAuthorizationUrl,
  generatePKCEParams,
  PKCEParams,
} from "../infrastructure/oauth-providers";
import { getValidAccessToken } from "../infrastructure/token-refresh";

const MAX_ACCOUNTS_PER_USER = 5;

export interface ConnectAccountParams {
  userId: string;
  provider: OAuthProvider;
  code: string;
  codeVerifier: string;
  platformAccountId: string;
  platformUsername?: string;
}

export interface AccountSummary {
  id: string;
  platform: Platform;
  platformAccountId: string;
  platformUsername: string | null;
  status: AccountStatus;
  connectedAt: Date;
  lastSyncAt: Date | null;
  tokenExpiresAt: Date | null;
}

export class AccountLimitError extends Error {
  constructor() {
    super(`Maximum of ${MAX_ACCOUNTS_PER_USER} accounts allowed per user`);
    this.name = "AccountLimitError";
  }
}

export class AccountNotFoundError extends Error {
  constructor(id: string) {
    super(`Account ${id} not found`);
    this.name = "AccountNotFoundError";
  }
}

export class AccountAccessError extends Error {
  constructor() {
    super("Access denied to this account");
    this.name = "AccountAccessError";
  }
}

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

function providerToPlatform(provider: OAuthProvider): Platform {
  switch (provider) {
    case "tiktok":
      return "TIKTOK";
    case "instagram":
      return "INSTAGRAM";
    case "youtube":
      return "YOUTUBE";
  }
}

function toAccountSummary(account: Account): AccountSummary {
  return {
    id: account.id,
    platform: account.platform,
    platformAccountId: account.platformAccountId,
    platformUsername: account.platformUsername,
    status: account.status,
    connectedAt: account.connectedAt,
    lastSyncAt: account.lastSyncAt,
    tokenExpiresAt: account.tokenExpiresAt,
  };
}

/** Begin an OAuth flow — returns the authorization URL and PKCE params to store in session */
export function initiateOAuthFlow(provider: OAuthProvider): {
  authorizationUrl: string;
  pkce: PKCEParams;
} {
  const pkce = generatePKCEParams();
  const authorizationUrl = buildAuthorizationUrl(provider, pkce);
  return { authorizationUrl, pkce };
}

/** Complete an OAuth flow after receiving the callback code */
export async function connectAccount(
  params: ConnectAccountParams
): Promise<AccountSummary> {
  const { userId, provider, code, codeVerifier, platformAccountId, platformUsername } =
    params;

  // Enforce account limit
  const existingCount = await prisma.account.count({ where: { userId } });
  if (existingCount >= MAX_ACCOUNTS_PER_USER) {
    throw new AccountLimitError();
  }

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(provider, code, codeVerifier);
  const platform = providerToPlatform(provider);

  const account = await prisma.account.upsert({
    where: {
      userId_platform_platformAccountId: {
        userId,
        platform,
        platformAccountId,
      },
    },
    update: {
      accessToken: encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt,
      status: AccountStatus.CONNECTED,
      platformUsername: platformUsername ?? undefined,
      lastSyncAt: new Date(),
    },
    create: {
      userId,
      platform,
      platformAccountId,
      platformUsername: platformUsername ?? null,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt,
      status: AccountStatus.CONNECTED,
    },
  });

  return toAccountSummary(account);
}

/** List all accounts for a user */
export async function listAccounts(userId: string): Promise<AccountSummary[]> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { connectedAt: "desc" },
  });
  return accounts.map(toAccountSummary);
}

/** Get a single account, verifying ownership */
export async function getAccount(
  accountId: string,
  userId: string
): Promise<AccountSummary> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new AccountNotFoundError(accountId);
  if (account.userId !== userId) throw new AccountAccessError();
  return toAccountSummary(account);
}

/** Disconnect (delete) a platform account */
export async function disconnectAccount(
  accountId: string,
  userId: string
): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new AccountNotFoundError(accountId);
  if (account.userId !== userId) throw new AccountAccessError();

  await prisma.account.delete({ where: { id: accountId } });
}

/** Force a token refresh for a specific account */
export async function forceTokenRefresh(
  accountId: string,
  userId: string
): Promise<AccountSummary> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new AccountNotFoundError(accountId);
  if (account.userId !== userId) throw new AccountAccessError();

  if (!account.refreshToken) {
    throw new Error("No refresh token available for this account");
  }

  const provider = platformToProvider(account.platform);
  const plainRefreshToken = safeDecrypt(account.refreshToken);
  if (!plainRefreshToken) {
    throw new Error("Failed to decrypt refresh token");
  }

  const { refreshAccessToken } = await import("../infrastructure/oauth-providers");
  const newTokens = await refreshAccessToken(provider, plainRefreshToken);

  const updated = await prisma.account.update({
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

  return toAccountSummary(updated);
}

/** Get a valid (decrypted, auto-refreshed) access token for an account */
export async function getDecryptedAccessToken(
  accountId: string,
  userId: string
): Promise<string> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new AccountNotFoundError(accountId);
  if (account.userId !== userId) throw new AccountAccessError();

  const token = await getValidAccessToken(accountId);
  if (!token) throw new Error("Unable to obtain a valid access token");
  return token;
}
