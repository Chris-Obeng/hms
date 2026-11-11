"use client";

import { forwardRef, InputHTMLAttributes, useId } from "react";
import { AlertCircle } from "lucide-react";

interface OnboardingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  prefixText?: string;
  mono?: boolean;
}

export const OnboardingInput = forwardRef<HTMLInputElement, OnboardingInputProps>(
  (
    {
      label,
      error,
      hint,
      optional = false,
      prefixText,
      mono = false,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const uid = useId();
    const inputId = id ?? uid;
    const hasError = Boolean(error);

    return (
      <div className="ob-field">
        <div className="ob-label-row">
          <label htmlFor={inputId} className="ob-label">
            {label}
          </label>
          {optional && <span className="ob-optional">Optional</span>}
        </div>

        <div className="ob-input-wrap" data-invalid={hasError ? "true" : undefined}>
          {prefixText && (
            <span className="ob-input-prefix" aria-hidden="true">
              {prefixText}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`ob-input ${mono ? "ob-input--mono" : ""} ${className}`.trim()}
            aria-invalid={hasError}
            aria-describedby={
              hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />
        </div>

        {hint && !hasError && (
          <p id={`${inputId}-hint`} className="ob-hint">
            {hint}
          </p>
        )}

        {hasError && (
          <p id={`${inputId}-error`} role="alert" className="ob-error">
            <AlertCircle size={14} strokeWidth={2} aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  }
);

OnboardingInput.displayName = "OnboardingInput";
