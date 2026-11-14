"use client";

import type { ReactNode } from "react";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
  labels?: string[];
  onStepSelect?: (step: number) => void;
  disabled?: boolean;
  /** Right-aligned status next to the step label, e.g. "Draft saved". */
  aside?: ReactNode;
}

/**
 * "Step 1 of 2 · Property" over one segment per step. Completed segments are
 * buttons back to that step; the label is the visible progress for everyone,
 * the live region in the page announces changes.
 */
export function StepIndicator({
  currentStep,
  totalSteps = 2,
  labels = ["Property", "Location & contact"],
  onStepSelect,
  disabled = false,
  aside,
}: StepIndicatorProps) {
  return (
    <div className="ob-progress-row">
      <div className="ob-progress-meta">
        <p className="ob-progress-label">
          Step {currentStep} of {totalSteps} · <strong>{labels[currentStep - 1]}</strong>
        </p>
        {aside}
      </div>
      <nav className="ob-progress" aria-label="Setup progress">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const state: "completed" | "active" | "upcoming" =
            stepNum < currentStep ? "completed" : stepNum === currentStep ? "active" : "upcoming";
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
    </div>
  );
}
