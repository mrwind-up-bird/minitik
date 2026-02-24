"use client";

import { useState } from "react";
import type { OAuthProvider } from "./platform-config";

interface SetupGuideProps {
  provider: OAuthProvider;
  onContinue: () => void;
  onBack: () => void;
}

interface SetupStep {
  title: string;
  detail: string;
}

interface PlatformGuide {
  portalName: string;
  portalUrl: string;
  steps: SetupStep[];
  scopes: string[];
  tip: string;
}

const SETUP_GUIDES: Record<OAuthProvider, PlatformGuide> = {
  tiktok: {
    portalName: "TikTok Developer Portal",
    portalUrl: "https://developers.tiktok.com/",
    steps: [
      { title: "Create a TikTok Developer account", detail: "Go to the developer portal and sign in with your TikTok account." },
      { title: "Create a new app", detail: "Click 'Manage apps' and create a new application." },
      { title: "Enable Login Kit & Content Posting API", detail: "In your app settings, add the Login Kit and Content Posting API products." },
      { title: "Configure redirect URI", detail: "Add your redirect URI in the app's Login Kit settings." },
      { title: "Copy your Client Key", detail: "Find the Client Key in your app's basic information section." },
    ],
    scopes: ["user.info.basic", "video.list", "video.upload"],
    tip: "TikTok apps require review before going live. Use the sandbox environment for testing.",
  },
  instagram: {
    portalName: "Meta Developer Portal",
    portalUrl: "https://developers.facebook.com/",
    steps: [
      { title: "Create a Meta Developer account", detail: "Go to the Meta developer portal and register as a developer." },
      { title: "Create a new Consumer app", detail: "Select 'Consumer' as the app type when creating your application." },
      { title: "Add Instagram Basic Display", detail: "In your app dashboard, add the Instagram Basic Display product." },
      { title: "Configure redirect URI", detail: "Add your redirect URI under Instagram Basic Display settings." },
      { title: "Copy your App ID and Secret", detail: "Find these in your app's basic settings page." },
    ],
    scopes: ["user_profile", "user_media"],
    tip: "You'll need an Instagram Business or Creator account linked to a Facebook Page.",
  },
  youtube: {
    portalName: "Google Cloud Console",
    portalUrl: "https://console.cloud.google.com/",
    steps: [
      { title: "Create a Google Cloud project", detail: "Go to the Cloud Console and create a new project (or select existing)." },
      { title: "Enable YouTube Data API v3", detail: "Navigate to 'APIs & Services' > 'Library' and enable the YouTube Data API v3." },
      { title: "Configure OAuth consent screen", detail: "Set up the consent screen with your app name, scopes, and test users." },
      { title: "Create OAuth 2.0 credentials", detail: "Go to 'Credentials' and create an OAuth 2.0 Client ID (Web application type)." },
      { title: "Add redirect URI", detail: "Add your redirect URI under 'Authorized redirect URIs' in the credential settings." },
    ],
    scopes: ["youtube.upload", "youtube.readonly"],
    tip: "While in testing mode, add your Google account as a test user in the consent screen settings.",
  },
};

export function PlatformSetupGuide({ provider, onContinue, onBack }: SetupGuideProps) {
  const guide = SETUP_GUIDES[provider];
  const [copied, setCopied] = useState(false);

  const redirectUri = typeof window !== "undefined"
    ? `${window.location.origin}/api/accounts/callback/${provider}`
    : `/api/accounts/callback/${provider}`;

  function handleCopy() {
    navigator.clipboard.writeText(redirectUri).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Set up your {provider === "tiktok" ? "TikTok" : provider === "instagram" ? "Instagram" : "YouTube"} developer app
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Follow these steps in the{" "}
          <a
            href={guide.portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
          >
            {guide.portalName} &nearr;
          </a>
        </p>
      </div>

      {/* Steps */}
      <ol className="space-y-4">
        {guide.steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-400">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {step.title}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {/* Redirect URI */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Redirect URI
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded bg-white px-3 py-1.5 text-xs text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
            {redirectUri}
          </code>
          <button
            onClick={handleCopy}
            className="shrink-0 rounded border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-700"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Required scopes */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Required Scopes
        </p>
        <div className="flex flex-wrap gap-1.5">
          {guide.scopes.map((scope) => (
            <code
              key={scope}
              className="rounded bg-white px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            >
              {scope}
            </code>
          ))}
        </div>
      </div>

      {/* Tip */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          <span className="font-medium">Tip:</span> {guide.tip}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Back
        </button>
        <button
          onClick={onContinue}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
        >
          I&apos;ve completed setup, continue
        </button>
      </div>
    </div>
  );
}
