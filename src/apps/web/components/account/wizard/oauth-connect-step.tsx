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
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Connect to {label}
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          You&apos;ll be redirected to {label} to authorize access.
        </p>
      </div>

      <div className="mx-auto max-w-sm rounded-xl border border-neutral-200 bg-white p-6 text-center dark:border-neutral-700 dark:bg-neutral-900">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </div>

        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          After clicking the button below, authorize minitik in the {label} login screen,
          then you&apos;ll be brought back here automatically.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={() => initiateConnect(provider, true)}
          disabled={connecting}
          className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
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
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Back
        </button>
      </div>
    </div>
  );
}
