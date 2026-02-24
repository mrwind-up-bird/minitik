"use client";

import { useState } from "react";
import type { Platform } from "@prisma/client";
import type { OAuthProvider } from "./wizard/platform-config";
import { StepIndicator } from "./wizard/step-indicator";
import { PlatformPicker } from "./wizard/platform-picker";
import { PlatformSetupGuide } from "./wizard/platform-setup-guide";
import { OAuthConnectStep } from "./wizard/oauth-connect-step";
import { ConnectionSuccess } from "./wizard/connection-success";

interface ConnectionWizardProps {
  connectedPlatforms: Set<Platform>;
  accountCount: number;
  /** Provider and username to show on the success step (set when returning from OAuth). */
  initialSuccess?: { provider: OAuthProvider; username?: string | null } | null;
  onComplete: () => void;
  onCancel: () => void;
}

export function ConnectionWizard({
  connectedPlatforms,
  accountCount,
  initialSuccess,
  onComplete,
  onCancel,
}: ConnectionWizardProps) {
  const [step, setStep] = useState(initialSuccess ? 4 : 1);
  const [selectedProvider, setSelectedProvider] = useState<OAuthProvider | null>(
    initialSuccess?.provider ?? null
  );

  function handlePlatformSelect(provider: OAuthProvider) {
    setSelectedProvider(provider);
    setStep(2);
  }

  function handleConnectAnother() {
    setSelectedProvider(null);
    setStep(1);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Connect Account
        </h2>
        <button
          onClick={onCancel}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Cancel
        </button>
      </div>

      {/* Step indicator */}
      <StepIndicator currentStep={step} />

      {/* Step content */}
      <div className="mx-auto max-w-2xl">
        {step === 1 && (
          <PlatformPicker
            connectedPlatforms={connectedPlatforms}
            accountCount={accountCount}
            onSelect={handlePlatformSelect}
          />
        )}

        {step === 2 && selectedProvider && (
          <PlatformSetupGuide
            provider={selectedProvider}
            onContinue={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && selectedProvider && (
          <OAuthConnectStep
            provider={selectedProvider}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && selectedProvider && (
          <ConnectionSuccess
            provider={selectedProvider}
            username={initialSuccess?.username}
            onConnectAnother={handleConnectAnother}
            onDone={onComplete}
          />
        )}
      </div>
    </div>
  );
}
