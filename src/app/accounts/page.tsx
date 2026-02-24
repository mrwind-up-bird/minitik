"use client";

import { useEffect, useState } from "react";
import { AccountConnection } from "@/apps/web/components/account/account-connection";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<
    Array<{
      id: string;
      platform: "TIKTOK" | "INSTAGRAM" | "YOUTUBE";
      platformAccountId: string;
      platformUsername: string | null;
      status: "CONNECTING" | "CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR";
      connectedAt: Date;
      lastSyncAt: Date | null;
      tokenExpiresAt: Date | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/accounts");
        if (!res.ok) {
          throw new Error("Failed to load accounts");
        }
        const data = await res.json();
        setAccounts(
          (data.accounts ?? []).map(
            (a: {
              id: string;
              platform: "TIKTOK" | "INSTAGRAM" | "YOUTUBE";
              platformAccountId: string;
              platformUsername: string | null;
              status: "CONNECTING" | "CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR";
              connectedAt: string;
              lastSyncAt: string | null;
              tokenExpiresAt: string | null;
            }) => ({
              ...a,
              connectedAt: new Date(a.connectedAt),
              lastSyncAt: a.lastSyncAt ? new Date(a.lastSyncAt) : null,
              tokenExpiresAt: a.tokenExpiresAt ? new Date(a.tokenExpiresAt) : null,
            })
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      } finally {
        setLoading(false);
      }
    }

    fetchAccounts();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Accounts
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Connect and manage your social media accounts.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 2 }, (_, i) => (
            <div
              key={i}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4"
            >
              <div className="h-4 w-1/3 bg-neutral-200 dark:bg-neutral-700 rounded" />
              <div className="mt-2 h-3 w-1/2 bg-neutral-100 dark:bg-neutral-800 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </div>
      ) : (
        <AccountConnection initialAccounts={accounts} />
      )}
    </div>
  );
}
