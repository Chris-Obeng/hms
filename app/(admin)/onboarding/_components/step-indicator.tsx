"use client";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
  labels?: string[];
  onStepSelect?: (step: number) => void;
  disabled?: boolean;
}

export function StepIndicator({
  currentStep,
  totalSteps = 2,
  labels = ["Property", "Location & contact"],
  onStepSelect,
  disabled = false,
}: StepIndicatorProps) {
  return (
    <nav className="ob-progress" aria-label="Setup progress">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1;
        const state: "completed" | "active" | "upcoming" =
          stepNum < currentStep
            ? "completed"
            : stepNum === currentStep
              ? "active"
              : "upcoming";
        const canGoBack = state === "completed" && !!onStepSelect && !disabled;

        return canGoBack ? (
          <button
            key={stepNum}
            type="button"
            className="ob-progress-seg"
            data-state={state}
            onClick={() => onStepSelect(stepNum)}
            aria-label={`Back to step ${stepNum}: ${labels[i]}`}
          />
        ) : (
          <span
            key={stepNum}
            className="ob-progress-seg"
            data-state={state}
            role="img"
            aria-label={`Step ${stepNum} of ${totalSteps}: ${labels[i]}${
              state === "active" ? " (current)" : ""
            }`}
          />
        );
      })}
    </nav>
  );
}
