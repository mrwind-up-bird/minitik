"use client";

import { useState } from "react";
import { AccountStatus, Platform } from "@prisma/client";

interface AccountSummary {
  id: string;
  platform: Platform;
  platformAccountId: string;
  platformUsername: string | null;
  status: AccountStatus;
  connectedAt: Date;
  lastSyncAt: Date | null;
  tokenExpiresAt: Date | null;
}

interface AccountConnectionProps {
  initialAccounts: AccountSummary[];
}

const PLATFORM_LABELS: Record<Platform, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
};

const PLATFORM_COLORS: Record<Platform, string> = {
  TIKTOK: "bg-black text-white",
  INSTAGRAM: "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
  YOUTUBE: "bg-red-600 text-white",
};

const STATUS_LABELS: Record<AccountStatus, string> = {
  CONNECTING: "Connecting...",
  CONNECTED: "Connected",
  EXPIRED: "Token Expired",
  REVOKED: "Access Revoked",
  ERROR: "Error",
};

const STATUS_COLORS: Record<AccountStatus, string> = {
  CONNECTING: "text-yellow-600",
  CONNECTED: "text-green-600",
  EXPIRED: "text-orange-600",
  REVOKED: "text-red-600",
  ERROR: "text-red-600",
};

type OAuthProvider = "tiktok" | "instagram" | "youtube";

const PROVIDER_TO_PLATFORM: Record<OAuthProvider, Platform> = {
  tiktok: "TIKTOK",
  instagram: "INSTAGRAM",
  youtube: "YOUTUBE",
};

export function AccountConnection({ initialAccounts }: AccountConnectionProps) {
  const [accounts, setAccounts] = useState<AccountSummary[]>(initialAccounts);
  const [connecting, setConnecting] = useState<OAuthProvider | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedPlatforms = new Set(accounts.map((a) => a.platform));
  const canAddMore = accounts.length < 5;

  async function handleConnect(provider: OAuthProvider) {
    setError(null);
    setConnecting(provider);

    try {
      // Initiate OAuth PKCE flow
      const initiateRes = await fetch("/api/accounts/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });

      if (!initiateRes.ok) {
        const data = await initiateRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to initiate OAuth");
      }

      const { authorizationUrl, codeVerifier, state } = await initiateRes.json();

      // Persist codeVerifier and state in sessionStorage for the callback
      sessionStorage.setItem(`oauth_verifier_${state}`, codeVerifier);
      sessionStorage.setItem(`oauth_provider_${state}`, provider);

      // Redirect to the OAuth provider
      window.location.href = authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setConnecting(null);
    }
  }

  async function handleDisconnect(accountId: string) {
    setError(null);
    setDisconnecting(accountId);

    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to disconnect account");
      }
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleRefresh(accountId: string) {
    setError(null);
    setRefreshing(accountId);

    try {
      const res = await fetch(`/api/accounts/${accountId}/refresh`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to refresh token");
      }
      const { account } = await res.json();
      setAccounts((prev) => prev.map((a) => (a.id === accountId ? account : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Connected Accounts</h2>
        <p className="text-sm text-gray-500">
          {accounts.length} / 5 accounts connected
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Connected accounts list */}
      {accounts.length > 0 && (
        <ul className="space-y-3">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[account.platform]}`}
                >
                  {PLATFORM_LABELS[account.platform]}
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {account.platformUsername ?? account.platformAccountId}
                  </p>
                  <p className={`text-xs ${STATUS_COLORS[account.status]}`}>
                    {STATUS_LABELS[account.status]}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {(account.status === "EXPIRED" || account.status === "ERROR") && (
                  <button
                    onClick={() => handleRefresh(account.id)}
                    disabled={refreshing === account.id}
                    className="rounded border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    {refreshing === account.id ? "Refreshing..." : "Refresh"}
                  </button>
                )}
                <button
                  onClick={() => handleDisconnect(account.id)}
                  disabled={disconnecting === account.id}
                  className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {disconnecting === account.id ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Connect new account */}
      {canAddMore && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-gray-700">
            Connect a platform
          </h3>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PROVIDER_TO_PLATFORM) as OAuthProvider[]).map(
              (provider) => {
                const platform = PROVIDER_TO_PLATFORM[provider];
                const alreadyConnected = connectedPlatforms.has(platform);
                const isConnecting = connecting === provider;

                return (
                  <button
                    key={provider}
                    onClick={() => handleConnect(provider)}
                    disabled={alreadyConnected || isConnecting || connecting !== null}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      alreadyConnected
                        ? "border-gray-200 bg-gray-50 text-gray-400"
                        : "border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {isConnecting
                      ? "Redirecting..."
                      : alreadyConnected
                        ? `${PLATFORM_LABELS[platform]} (connected)`
                        : `Connect ${PLATFORM_LABELS[platform]}`}
                  </button>
                );
              }
            )}
          </div>
        </div>
      )}

      {!canAddMore && (
        <p className="text-sm text-gray-500">
          You have reached the maximum of 5 connected accounts.
        </p>
      )}
    </div>
  );
}
