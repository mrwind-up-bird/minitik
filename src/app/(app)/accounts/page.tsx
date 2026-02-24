"use client";

import { useCallback, useEffect, useState } from "react";
import type { Platform } from "@prisma/client";
import { AccountConnection } from "@/apps/web/components/account/account-connection";
import { ConnectionWizard } from "@/apps/web/components/account/connection-wizard";
import type { OAuthProvider } from "@/apps/web/components/account/wizard/platform-config";
import { PROVIDER_TO_PLATFORM } from "@/apps/web/components/account/wizard/platform-config";

interface AccountData {
  id: string;
  platform: "TIKTOK" | "INSTAGRAM" | "YOUTUBE";
  platformAccountId: string;
  platformUsername: string | null;
  status: "CONNECTING" | "CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR";
  connectedAt: Date;
  lastSyncAt: Date | null;
  tokenExpiresAt: Date | null;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "wizard">("list");
  const [wizardSuccess, setWizardSuccess] = useState<{
    provider: OAuthProvider;
    username?: string | null;
  } | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error("Failed to load accounts");
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
  }, []);

  // On mount, check for wizard return from OAuth redirect
  useEffect(() => {
    const wizardActive = sessionStorage.getItem("wizard_active");
    const wizardProvider = sessionStorage.getItem("wizard_provider") as OAuthProvider | null;

    if (wizardActive && wizardProvider) {
      sessionStorage.removeItem("wizard_active");
      sessionStorage.removeItem("wizard_provider");

      // Find the newly connected account after re-fetch
      fetchAccounts().then(() => {
        setWizardSuccess({ provider: wizardProvider });
        setView("wizard");
      });
      return;
    }

    fetchAccounts();
  }, [fetchAccounts]);

  // Once accounts load, resolve the username for wizard success
  useEffect(() => {
    if (wizardSuccess && accounts.length > 0) {
      const platform = PROVIDER_TO_PLATFORM[wizardSuccess.provider];
      const match = accounts.find((a) => a.platform === platform);
      if (match && !wizardSuccess.username) {
        setWizardSuccess((prev) =>
          prev ? { ...prev, username: match.platformUsername } : prev
        );
      }
    }
  }, [wizardSuccess, accounts]);

  const connectedPlatforms = new Set(accounts.map((a) => a.platform)) as Set<Platform>;
  const canAddMore = accounts.length < 5;

  function handleWizardComplete() {
    setWizardSuccess(null);
    setView("list");
    fetchAccounts();
  }

  function handleWizardCancel() {
    setWizardSuccess(null);
    setView("list");
  }

  if (view === "wizard") {
    return (
      <div className="space-y-6">
        <ConnectionWizard
          connectedPlatforms={connectedPlatforms}
          accountCount={accounts.length}
          initialSuccess={wizardSuccess}
          onComplete={handleWizardComplete}
          onCancel={handleWizardCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            Accounts
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Connect and manage your social media accounts.
          </p>
        </div>
        {canAddMore && !loading && (
          <button
            onClick={() => setView("wizard")}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            Connect New Account
          </button>
        )}
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
