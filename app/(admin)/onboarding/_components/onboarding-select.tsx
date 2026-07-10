"use client";

import { forwardRef, SelectHTMLAttributes, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface OnboardingSelectOption {
  value: string;
  label: string;
}

interface OnboardingSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: OnboardingSelectOption[];
  error?: string;
  hint?: string;
}

export const OnboardingSelect = forwardRef<HTMLSelectElement, OnboardingSelectProps>(
  ({ label, options, error, hint, className = "", id, ...props }, ref) => {
    const uid = useId();
    const selectId = id ?? uid;
    const hasError = !!error;

    return (
      <div className="onboarding-form-group">
        <label htmlFor={selectId} className="onboarding-label">
          {label}
          {props.required && <span className="onboarding-label-required" aria-label="required">*</span>}
        </label>

        <select
          ref={ref}
          id={selectId}
          className={`onboarding-select ${className}`}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined
          }
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hint && !hasError && (
          <p id={`${selectId}-hint`} className="onboarding-hint">
            {hint}
          </p>
        )}

        <AnimatePresence>
          {hasError && (
            <motion.div
              id={`${selectId}-error`}
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="onboarding-error-message"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

OnboardingSelect.displayName = "OnboardingSelect";
