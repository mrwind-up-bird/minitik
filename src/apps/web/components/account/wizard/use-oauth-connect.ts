import { useCallback, useState } from "react";
import type { OAuthProvider } from "./platform-config";

interface UseOAuthConnectReturn {
  connecting: boolean;
  error: string | null;
  initiateConnect: (provider: OAuthProvider, wizardMode?: boolean) => Promise<void>;
}

export function useOAuthConnect(): UseOAuthConnectReturn {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiateConnect = useCallback(
    async (provider: OAuthProvider, wizardMode = false) => {
      setError(null);
      setConnecting(true);

      try {
        const res = await fetch("/api/accounts/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to initiate OAuth");
        }

        const { authorizationUrl, codeVerifier, state } = await res.json();

        // Store PKCE params for the callback
        sessionStorage.setItem(`oauth_verifier_${state}`, codeVerifier);
        sessionStorage.setItem(`oauth_provider_${state}`, provider);

        if (wizardMode) {
          sessionStorage.setItem("wizard_active", "true");
          sessionStorage.setItem("wizard_provider", provider);
        }

        window.location.href = authorizationUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
        setConnecting(false);
      }
    },
    []
  );

  return { connecting, error, initiateConnect };
}
