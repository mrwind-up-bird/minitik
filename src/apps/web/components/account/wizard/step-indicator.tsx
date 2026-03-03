const STEPS = ["Platform", "Setup", "Connect", "Done"] as const;

interface StepIndicatorProps {
  currentStep: number;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const isCompleted = step < currentStep;
        const isCurrent = step === currentStep;

        return (
          <div key={label} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isCompleted
                    ? "bg-nyx-cyan text-nyx-midnight"
                    : isCurrent
                      ? "bg-nyx-cyan text-nyx-midnight ring-2 ring-nyx-cyan/30"
                      : "bg-nyx-border text-nyx-muted"
                }`}
              >
                {isCompleted ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  step
                )}
              </div>
              <span
                className={`hidden text-xs font-medium sm:inline ${
                  isCurrent
                    ? "text-nyx-cyan"
                    : isCompleted
                      ? "text-nyx-text"
                      : "text-nyx-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-6 sm:w-10 ${
                  step < currentStep
                    ? "bg-nyx-cyan"
                    : "bg-nyx-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
