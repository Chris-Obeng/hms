"use client";

import { motion } from "framer-motion";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
  labels?: string[];
}

export function StepIndicator({
  currentStep,
  totalSteps = 3,
  labels = ["Property", "Location", "Review"],
}: StepIndicatorProps) {
  const getStepState = (stepNum: number): "completed" | "active" | "upcoming" => {
    if (stepNum < currentStep) return "completed";
    if (stepNum === currentStep) return "active";
    return "upcoming";
  };

  return (
    <nav className="step-indicator" aria-label="Onboarding progress">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1;
        const state = getStepState(stepNum);
        const isLast = stepNum === totalSteps;

        return (
          <div key={stepNum} className="step-indicator-item">
            <div className="flex items-center shrink-0">
              <motion.div
                className="step-circle"
                data-state={state}
                animate={{
                  backgroundColor: state === "upcoming" ? "transparent" : "var(--onboarding-accent)",
                  borderColor: state === "upcoming" ? "var(--onboarding-border)" : "var(--onboarding-accent)",
                  color: state === "upcoming" ? "var(--onboarding-text-muted)" : "white",
                }}
                transition={{ duration: 0.25 }}
                role="img"
                aria-label={`Step ${stepNum} of ${totalSteps}: ${labels[i]}${
                  state === "completed" ? " - Completed" : state === "active" ? " - Current" : ""
                }`}
              >
                {state === "completed" ? (
                  <motion.svg
                    key="check"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </motion.svg>
                ) : (
                  <span aria-hidden="true">{stepNum}</span>
                )}
              </motion.div>

              <span className="step-label" data-state={state}>
                {labels[i]}
              </span>
            </div>

            {!isLast && (
              <div className="step-connector" aria-hidden="true">
                <motion.div
                  className="step-connector-progress"
                  data-completed={state === "completed"}
                  animate={{ scaleX: state === "completed" ? 1 : 0 }}
                  initial={{ scaleX: 0 }}
                  transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
