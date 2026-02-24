import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/shared/infrastructure/database/postgres", () => ({
  prisma: {
    account: {
      count: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock oauth-providers
vi.mock("../../infrastructure/oauth-providers", () => ({
  exchangeCodeForTokens: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  generatePKCEParams: vi.fn(),
}));

// Mock platform-user-info
vi.mock("../../infrastructure/platform-user-info", () => ({
  fetchPlatformUserInfo: vi.fn(),
}));

// Mock token-encryption
vi.mock("../../infrastructure/token-encryption", () => ({
  encrypt: vi.fn((val: string) => `encrypted_${val}`),
  safeDecrypt: vi.fn((val: string) => val.replace("encrypted_", "")),
}));

// Mock token-refresh
vi.mock("../../infrastructure/token-refresh", () => ({
  getValidAccessToken: vi.fn(),
}));

import { prisma } from "@/shared/infrastructure/database/postgres";
import {
  exchangeCodeForTokens,
  buildAuthorizationUrl,
  generatePKCEParams,
} from "../../infrastructure/oauth-providers";
import { fetchPlatformUserInfo } from "../../infrastructure/platform-user-info";
import {
  connectAccount,
  initiateOAuthFlow,
  listAccounts,
  getAccount,
  disconnectAccount,
  AccountLimitError,
  AccountNotFoundError,
  AccountAccessError,
} from "../account-service";

const mockPrisma = vi.mocked(prisma);
const mockExchange = vi.mocked(exchangeCodeForTokens);
const mockBuildUrl = vi.mocked(buildAuthorizationUrl);
const mockGeneratePKCE = vi.mocked(generatePKCEParams);
const mockFetchUserInfo = vi.mocked(fetchPlatformUserInfo);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("initiateOAuthFlow", () => {
  it("returns authorization URL and PKCE params", () => {
    const pkce = {
      codeVerifier: "verifier",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256" as const,
      state: "state123",
    };
    mockGeneratePKCE.mockReturnValue(pkce);
    mockBuildUrl.mockReturnValue("https://example.com/auth?state=state123");

    const result = initiateOAuthFlow("tiktok");

    expect(result.pkce).toBe(pkce);
    expect(result.authorizationUrl).toBe("https://example.com/auth?state=state123");
    expect(mockGeneratePKCE).toHaveBeenCalledOnce();
    expect(mockBuildUrl).toHaveBeenCalledWith("tiktok", pkce);
  });
});

describe("connectAccount", () => {
  const baseParams = {
    userId: "user-1",
    provider: "tiktok" as const,
    code: "auth_code",
    codeVerifier: "verifier",
    platformAccountId: "tt_123",
    platformUsername: "TikTokUser",
  };

  const fakeAccount = {
    id: "acc-1",
    userId: "user-1",
    platform: "TIKTOK",
    platformAccountId: "tt_123",
    platformUsername: "TikTokUser",
    status: "CONNECTED",
    connectedAt: new Date("2025-01-01"),
    lastSyncAt: new Date("2025-01-01"),
    tokenExpiresAt: new Date("2025-02-01"),
    accessToken: "encrypted_access",
    refreshToken: "encrypted_refresh",
    metadata: null,
  };

  it("exchanges code and upserts account", async () => {
    mockPrisma.account.count.mockResolvedValue(0);
    mockExchange.mockResolvedValue({
      accessToken: "access_tok",
      refreshToken: "refresh_tok",
      expiresAt: new Date("2025-02-01"),
      scopes: [],
    });
    mockPrisma.account.upsert.mockResolvedValue(fakeAccount as any);

    const result = await connectAccount(baseParams);

    expect(mockPrisma.account.count).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(mockExchange).toHaveBeenCalledWith("tiktok", "auth_code", "verifier");
    expect(mockPrisma.account.upsert).toHaveBeenCalledOnce();
    expect(result.id).toBe("acc-1");
    expect(result.platform).toBe("TIKTOK");
    expect(result.platformAccountId).toBe("tt_123");
  });

  it("throws AccountLimitError when user has 5 accounts", async () => {
    mockPrisma.account.count.mockResolvedValue(5);

    await expect(connectAccount(baseParams)).rejects.toThrow(AccountLimitError);
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("auto-fetches user info when platformAccountId is not provided", async () => {
    mockPrisma.account.count.mockResolvedValue(0);
    mockExchange.mockResolvedValue({
      accessToken: "access_tok",
      refreshToken: null,
      expiresAt: null,
      scopes: [],
    });
    mockFetchUserInfo.mockResolvedValue({
      platformAccountId: "auto_id",
      platformUsername: "AutoUser",
    });
    mockPrisma.account.upsert.mockResolvedValue({
      ...fakeAccount,
      platformAccountId: "auto_id",
      platformUsername: "AutoUser",
    } as any);

    await connectAccount({
      userId: "user-1",
      provider: "youtube",
      code: "code",
      codeVerifier: "verifier",
      // no platformAccountId
    });

    expect(mockFetchUserInfo).toHaveBeenCalledWith("youtube", "access_tok");
  });

  it("does not fetch user info when platformAccountId is provided", async () => {
    mockPrisma.account.count.mockResolvedValue(0);
    mockExchange.mockResolvedValue({
      accessToken: "tok",
      refreshToken: null,
      expiresAt: null,
      scopes: [],
    });
    mockPrisma.account.upsert.mockResolvedValue(fakeAccount as any);

    await connectAccount(baseParams);

    expect(mockFetchUserInfo).not.toHaveBeenCalled();
  });
});

describe("listAccounts", () => {
  it("returns mapped account summaries", async () => {
    const accounts = [
      {
        id: "acc-1",
        userId: "user-1",
        platform: "TIKTOK",
        platformAccountId: "tt_123",
        platformUsername: "User1",
        status: "CONNECTED",
        connectedAt: new Date(),
        lastSyncAt: null,
        tokenExpiresAt: null,
      },
    ];
    mockPrisma.account.findMany.mockResolvedValue(accounts as any);

    const result = await listAccounts("user-1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("acc-1");
    expect(result[0]).not.toHaveProperty("accessToken");
  });
});

describe("getAccount", () => {
  it("throws AccountNotFoundError for missing account", async () => {
    mockPrisma.account.findUnique.mockResolvedValue(null);

    await expect(getAccount("bad-id", "user-1")).rejects.toThrow(
      AccountNotFoundError
    );
  });

  it("throws AccountAccessError for wrong user", async () => {
    mockPrisma.account.findUnique.mockResolvedValue({
      id: "acc-1",
      userId: "other-user",
    } as any);

    await expect(getAccount("acc-1", "user-1")).rejects.toThrow(
      AccountAccessError
    );
  });
});

describe("disconnectAccount", () => {
  it("deletes the account when owned by user", async () => {
    mockPrisma.account.findUnique.mockResolvedValue({
      id: "acc-1",
      userId: "user-1",
    } as any);
    mockPrisma.account.delete.mockResolvedValue({} as any);

    await disconnectAccount("acc-1", "user-1");

    expect(mockPrisma.account.delete).toHaveBeenCalledWith({
      where: { id: "acc-1" },
    });
  });

  it("throws AccountNotFoundError for missing account", async () => {
    mockPrisma.account.findUnique.mockResolvedValue(null);

    await expect(disconnectAccount("bad-id", "user-1")).rejects.toThrow(
      AccountNotFoundError
    );
  });

  it("throws AccountAccessError for wrong user", async () => {
    mockPrisma.account.findUnique.mockResolvedValue({
      id: "acc-1",
      userId: "other-user",
    } as any);

    await expect(disconnectAccount("acc-1", "user-1")).rejects.toThrow(
      AccountAccessError
    );
  });
});
