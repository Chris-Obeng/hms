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
 * HeroUI Pro style Capsule Number Stepper component.
 * Matches HeroUI Pro pill track + floating circular disc buttons design.
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
    size === "sm" ? "size-7" : size === "lg" ? "size-9" : "size-8";
  const iconSizeClass =
    size === "sm" ? "size-3" : size === "lg" ? "size-4" : "size-3.5";

  return (
    <div className={cn("flex items-center justify-between py-2", className)}>
      {/* Label & Description */}
      {label && (
        <div className="flex flex-col min-w-0 pr-4">
          <span className="text-sm font-semibold text-foreground select-none">
            {label}
          </span>
          {description && (
            <span className="text-xs text-muted-foreground select-none mt-0.5">
              {description}
            </span>
          )}
        </div>
      )}

      {/* HeroUI Pro Style Pill Track Container */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-full bg-muted/60 dark:bg-muted/30 border border-border/40 shadow-inner shrink-0"
        role="spinbutton"
        aria-label={label || "Numeric stepper"}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
      >
        {/* Decrement Disc Button */}
        <button
          type="button"
          onClick={handleDecrement}
          disabled={!canDecrement}
          aria-label={label ? `Decrease ${label}` : "Decrease value"}
          className={cn(
            buttonSizeClass,
            "rounded-full bg-background dark:bg-card text-foreground flex items-center justify-center shadow-xs hover:shadow-sm active:scale-95 transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30 disabled:pointer-events-none disabled:shadow-none"
          )}
        >
          <Minus className={cn(iconSizeClass, "stroke-[2.5]")} />
        </button>

        {/* Value Display */}
        <span className="w-7 text-center font-bold text-sm text-foreground tabular-nums select-none">
          {value}
        </span>

        {/* Increment Disc Button */}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={!canIncrement}
          aria-label={label ? `Increase ${label}` : "Increase value"}
          className={cn(
            buttonSizeClass,
            "rounded-full bg-background dark:bg-card text-foreground flex items-center justify-center shadow-xs hover:shadow-sm active:scale-95 transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30 disabled:pointer-events-none disabled:shadow-none"
          )}
        >
          <Plus className={cn(iconSizeClass, "stroke-[2.5]")} />
        </button>
      </div>
    </div>
  );
}
