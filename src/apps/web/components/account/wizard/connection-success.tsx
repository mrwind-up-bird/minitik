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
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/50">
        <svg className="h-8 w-8 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Account Connected!
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Your {label} account has been successfully linked.
        </p>
      </div>

      {/* Account details */}
      <div className="mx-auto inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[platform]}`}>
          {label}
        </span>
        {username && (
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {username}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
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
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Connect Another Account
        </button>
        <button
          onClick={onDone}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}
