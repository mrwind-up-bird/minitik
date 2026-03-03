"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const callbackHandled = useRef(false);

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

  // Handle OAuth callback params or wizard sessionStorage return
  useEffect(() => {
    if (callbackHandled.current) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const provider = params.get("provider") as OAuthProvider | null;
    const callbackError = params.get("error");

    // Clean URL params immediately
    if (code || state || provider || callbackError) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Handle error from callback
    if (callbackError) {
      setError(callbackError);
      fetchAccounts();
      return;
    }

    // Handle OAuth callback: code + state + provider in URL
    if (code && state && provider) {
      callbackHandled.current = true;
      const codeVerifier = sessionStorage.getItem(`oauth_verifier_${state}`);
      // Clean up sessionStorage
      sessionStorage.removeItem(`oauth_verifier_${state}`);
      sessionStorage.removeItem(`oauth_provider_${state}`);
      sessionStorage.removeItem("wizard_active");
      sessionStorage.removeItem("wizard_provider");

      if (!codeVerifier) {
        setError("OAuth session expired. Please try connecting again.");
        fetchAccounts();
        return;
      }

      setLoading(true);
      fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, code, codeVerifier }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? "Failed to connect account");
          }
          const { account } = await res.json();
          await fetchAccounts();
          setWizardSuccess({
            provider,
            username: account?.platformUsername ?? null,
          });
          setView("wizard");
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Connection failed");
          fetchAccounts();
        });
      return;
    }

    // Handle wizard return via sessionStorage (fallback for non-callback flows)
    const wizardActive = sessionStorage.getItem("wizard_active");
    const wizardProvider = sessionStorage.getItem("wizard_provider") as OAuthProvider | null;

    if (wizardActive && wizardProvider) {
      sessionStorage.removeItem("wizard_active");
      sessionStorage.removeItem("wizard_provider");
      fetchAccounts().then(() => {
        setWizardSuccess({ provider: wizardProvider });
        setView("wizard");
      });
      return;
    }

    fetchAccounts();
  }, [fetchAccounts]);

  // Resolve the username for wizard success once accounts load
  useEffect(() => {
    if (wizardSuccess && accounts.length > 0 && !wizardSuccess.username) {
      const platform = PROVIDER_TO_PLATFORM[wizardSuccess.provider];
      const match = accounts.find((a) => a.platform === platform);
      if (match) {
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
          <h1 className="text-2xl font-bold text-nyx-text">
            Accounts
          </h1>
          <p className="mt-1 text-sm text-nyx-muted">
            Connect and manage your social media accounts.
          </p>
        </div>
        {canAddMore && !loading && (
          <button
            onClick={() => setView("wizard")}
            className="rounded-lg bg-nyx-cyan px-4 py-2 text-sm font-medium text-nyx-midnight transition-colors hover:bg-nyx-cyan/90"
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
              className="rounded-lg border border-nyx-border bg-nyx-surface p-4"
            >
              <div className="h-4 w-1/3 bg-nyx-border rounded" />
              <div className="mt-2 h-3 w-1/2 bg-nyx-border/50 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </div>
      ) : (
        <AccountConnection initialAccounts={accounts} />
      )}
    </div>
  );
}
