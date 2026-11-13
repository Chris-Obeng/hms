"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumericStepperProps {
  label?: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Capsule number stepper styled explicitly with guest booking `--bk-*` tokens
 * so it remains high-contrast both inline and inside portaled bottom sheets /
 * popovers.
 */
export function NumericStepper({
  label,
  description,
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  className,
  size = "md",
}: NumericStepperProps) {
  const canDecrement = value > min;
  const canIncrement = value < max;

  const handleDecrement = React.useCallback(() => {
    if (canDecrement) {
      onChange(Math.max(min, value - step));
    }
  }, [canDecrement, min, value, step, onChange]);

  const handleIncrement = React.useCallback(() => {
    if (canIncrement) {
      onChange(Math.min(max, value + step));
    }
  }, [canIncrement, max, value, step, onChange]);

  const buttonSizeClass =
    size === "sm" ? "size-8" : size === "lg" ? "size-10" : "size-8";
  const iconSizeClass =
    size === "sm" ? "size-3" : size === "lg" ? "size-4" : "size-4";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        size === "lg" ? "py-4" : "py-2",
        className
      )}
    >
      {label && (
        <div className="flex flex-col min-w-0">
          <span
            className={cn(
              "font-semibold text-[var(--bk-ink)] select-none leading-snug",
              size === "lg" ? "text-md" : "text-sm"
            )}
          >
            {label}
          </span>
          {description && (
            <span className="text-xs text-[var(--bk-muted)] select-none mt-1 leading-snug">
              {description}
            </span>
          )}
        </div>
      )}

      <div
        className="inline-flex items-center gap-2 p-1 rounded-full bg-[var(--bk-surface-soft)] border border-[var(--bk-line)] shrink-0"
        role="spinbutton"
        aria-label={label || "Numeric stepper"}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
      >
        <button
          type="button"
          onClick={handleDecrement}
          disabled={!canDecrement}
          aria-label={label ? `Decrease ${label}` : "Decrease value"}
          className={cn(
            buttonSizeClass,
            "rounded-full bg-[var(--bk-surface)] text-[var(--bk-ink)] border border-[var(--bk-line)] flex items-center justify-center shadow-2xs hover:border-[var(--bk-line-strong)] active:scale-95 transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)] disabled:opacity-35 disabled:pointer-events-none disabled:shadow-none touch-manipulation"
          )}
        >
          <Minus className={cn(iconSizeClass, "stroke-[2.25]")} />
        </button>

        <span
          className={cn(
            "text-center font-semibold text-[var(--bk-ink)] tabular-nums select-none",
            size === "lg" ? "w-8 text-md" : "w-7 text-sm"
          )}
        >
          {value}
        </span>

        <button
          type="button"
          onClick={handleIncrement}
          disabled={!canIncrement}
          aria-label={label ? `Increase ${label}` : "Increase value"}
          className={cn(
            buttonSizeClass,
            "rounded-full bg-[var(--bk-surface)] text-[var(--bk-ink)] border border-[var(--bk-line)] flex items-center justify-center shadow-2xs hover:border-[var(--bk-line-strong)] active:scale-95 transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)] disabled:opacity-35 disabled:pointer-events-none disabled:shadow-none touch-manipulation"
          )}
        >
          <Plus className={cn(iconSizeClass, "stroke-[2.25]")} />
        </button>
      </div>
    </div>
  );
}
