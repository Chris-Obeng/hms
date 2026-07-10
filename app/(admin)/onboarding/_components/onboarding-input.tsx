"use client";

import { forwardRef, InputHTMLAttributes, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface OnboardingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const OnboardingInput = forwardRef<HTMLInputElement, OnboardingInputProps>(
  ({ label, error, hint, className = "", id, ...props }, ref) => {
    const uid = useId();
    const inputId = id ?? uid;
    const hasError = !!error;

    return (
      <div className="onboarding-form-group">
        <label htmlFor={inputId} className="onboarding-label">
          {label}
          {props.required && <span className="onboarding-label-required" aria-label="required">*</span>}
        </label>

        <input
          ref={ref}
          id={inputId}
          className={`onboarding-input ${className}`}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          {...props}
        />

        {hint && !hasError && (
          <p id={`${inputId}-hint`} className="onboarding-hint">
            {hint}
          </p>
        )}

        <AnimatePresence>
          {hasError && (
            <motion.div
              id={`${inputId}-error`}
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

OnboardingInput.displayName = "OnboardingInput";
