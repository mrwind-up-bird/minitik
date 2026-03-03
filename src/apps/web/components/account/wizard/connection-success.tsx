import { PLATFORM_LABELS, PLATFORM_COLORS, PROVIDER_TO_PLATFORM, type OAuthProvider } from "./platform-config";

interface ConnectionSuccessProps {
  provider: OAuthProvider;
  username?: string | null;
  onConnectAnother: () => void;
  onDone: () => void;
}

export function ConnectionSuccess({
  provider,
  username,
  onConnectAnother,
  onDone,
}: ConnectionSuccessProps) {
  const platform = PROVIDER_TO_PLATFORM[provider];
  const label = PLATFORM_LABELS[platform];

  return (
    <div className="space-y-6 text-center">
      {/* Success icon */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-950/50">
        <svg className="h-8 w-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-nyx-text">
          Account Connected!
        </h2>
        <p className="mt-1 text-sm text-nyx-muted">
          Your {label} account has been successfully linked.
        </p>
      </div>

      {/* Account details */}
      <div className="mx-auto inline-flex items-center gap-2 rounded-lg border border-nyx-border bg-nyx-surface px-4 py-3">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[platform]}`}>
          {label}
        </span>
        {username && (
          <span className="text-sm font-medium text-nyx-text">
            {username}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Connected
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          onClick={onConnectAnother}
          className="rounded-lg border border-nyx-border px-4 py-2 text-sm font-medium text-nyx-text transition-colors hover:bg-nyx-surface"
        >
          Connect Another Account
        </button>
        <button
          onClick={onDone}
          className="rounded-lg bg-nyx-cyan px-4 py-2 text-sm font-medium text-nyx-midnight transition-colors hover:bg-nyx-cyan/90"
        >
          Done
        </button>
      </div>
    </div>
  );
}
