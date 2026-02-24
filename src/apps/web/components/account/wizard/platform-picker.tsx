import type { Platform } from "@prisma/client";
import { PLATFORM_LABELS, PROVIDER_TO_PLATFORM, type OAuthProvider } from "./platform-config";

interface PlatformPickerProps {
  connectedPlatforms: Set<Platform>;
  accountCount: number;
  onSelect: (provider: OAuthProvider) => void;
}

const PLATFORMS: { provider: OAuthProvider; description: string; icon: React.ReactNode }[] = [
  {
    provider: "tiktok",
    description: "Short-form video sharing",
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.81a8.23 8.23 0 004.8 1.53V6.89a4.85 4.85 0 01-1.04-.2z" />
      </svg>
    ),
  },
  {
    provider: "instagram",
    description: "Photo & video sharing",
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    provider: "youtube",
    description: "Video hosting & streaming",
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
];

export function PlatformPicker({ connectedPlatforms, accountCount, onSelect }: PlatformPickerProps) {
  const atLimit = accountCount >= 5;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Choose a platform
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Select the platform you want to connect.
        </p>
      </div>

      {atLimit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          You&apos;ve reached the maximum of 5 connected accounts.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PLATFORMS.map(({ provider, description, icon }) => {
          const platform = PROVIDER_TO_PLATFORM[provider];
          const isConnected = connectedPlatforms.has(platform);
          const disabled = atLimit || isConnected;

          return (
            <button
              key={provider}
              onClick={() => onSelect(provider)}
              disabled={disabled}
              className={`relative flex flex-col items-center gap-3 rounded-xl border p-6 text-center transition-all ${
                disabled
                  ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60 dark:border-neutral-700 dark:bg-neutral-800/50"
                  : "border-neutral-200 bg-white hover:border-violet-400 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-violet-500"
              }`}
            >
              {isConnected && (
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-950/50 dark:text-green-400">
                  <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Connected
                </span>
              )}
              <div className="text-neutral-700 dark:text-neutral-300">{icon}</div>
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {PLATFORM_LABELS[platform]}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
