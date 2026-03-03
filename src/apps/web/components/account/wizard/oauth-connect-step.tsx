import { PLATFORM_LABELS, PROVIDER_TO_PLATFORM, type OAuthProvider } from "./platform-config";
import { useOAuthConnect } from "./use-oauth-connect";

interface OAuthConnectStepProps {
  provider: OAuthProvider;
  onBack: () => void;
}

export function OAuthConnectStep({ provider, onBack }: OAuthConnectStepProps) {
  const { connecting, error, initiateConnect } = useOAuthConnect();
  const platform = PROVIDER_TO_PLATFORM[provider];
  const label = PLATFORM_LABELS[platform];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-nyx-text">
          Connect to {label}
        </h2>
        <p className="mt-1 text-sm text-nyx-muted">
          You&apos;ll be redirected to {label} to authorize access.
        </p>
      </div>

      <div className="mx-auto max-w-sm rounded-xl border border-nyx-border bg-nyx-surface p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-nyx-cyan/10 text-nyx-cyan">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </div>

        <p className="mb-4 text-sm text-nyx-muted">
          After clicking the button below, authorize minitik in the {label} login screen,
          then you&apos;ll be brought back here automatically.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={() => initiateConnect(provider, true)}
          disabled={connecting}
          className="w-full rounded-lg bg-nyx-cyan px-4 py-2.5 text-sm font-medium text-nyx-midnight transition-colors hover:bg-nyx-cyan/90 disabled:opacity-50"
        >
          {connecting ? (
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Redirecting...
            </span>
          ) : (
            `Connect to ${label}`
          )}
        </button>
      </div>

      <div className="flex justify-start pt-2">
        <button
          onClick={onBack}
          disabled={connecting}
          className="rounded-lg border border-nyx-border px-4 py-2 text-sm font-medium text-nyx-text transition-colors hover:bg-nyx-surface disabled:opacity-50"
        >
          Back
        </button>
      </div>
    </div>
  );
}
