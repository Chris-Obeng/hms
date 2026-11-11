"use client";

import { useId } from "react";
import { AlertCircle } from "lucide-react";
import { HeroSelectField } from "@/components/ui/hero-select";

interface OnboardingSelectOption {
  value: string;
  label: string;
}

interface OnboardingSelectProps {
  label: string;
  options: OnboardingSelectOption[];
  error?: string;
  hint?: string;
  optional?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string } }) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function OnboardingSelect({
  label,
  options,
  error,
  hint,
  optional = false,
  value,
  defaultValue,
  onChange,
  className = "",
  id,
  required,
  disabled,
}: OnboardingSelectProps) {
  const uid = useId();
  const selectId = id ?? uid;
  const hasError = Boolean(error);

  return (
    <div className="ob-field">
      <div className="ob-label-row">
        <span id={`${selectId}-label`} className="ob-label">
          {label}
        </span>
        {optional && <span className="ob-optional">Optional</span>}
      </div>

      <HeroSelectField
        value={value ?? defaultValue}
        onValueChange={(next) => onChange?.({ target: { value: next } })}
        options={options}
        label={null}
        isInvalid={hasError}
        isRequired={required}
        isDisabled={disabled}
        ariaLabel={label}
        className={className}
        triggerClassName="ob-select-trigger"
        popoverClassName="ob-portal"
      />

      {hint && !hasError && (
        <p id={`${selectId}-hint`} className="ob-hint">
          {hint}
        </p>
      )}

      {hasError && (
        <p id={`${selectId}-error`} role="alert" className="ob-error">
          <AlertCircle size={14} strokeWidth={2} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
