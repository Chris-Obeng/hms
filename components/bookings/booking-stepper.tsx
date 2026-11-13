"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type WizardStep = 1 | 2 | 3;

interface StepMeta {
  num: WizardStep;
  label: string;
}

const STEPS: StepMeta[] = [
  { num: 1, label: "Dates" },
  { num: 2, label: "Availability" },
  { num: 3, label: "Summary" },
];

interface BookingStepperProps {
  current: WizardStep;
  /** Whether the user may jump to this step (validation gate). */
  canReach: (step: WizardStep) => boolean;
  onStepChange: (step: WizardStep) => void;
  className?: string;
}

/** 3-step indicator for the new-reservation wizard; click-to-return on reached steps. */
export function BookingStepper({ current, canReach, onStepChange, className }: BookingStepperProps) {
  const total = STEPS.length;
  const activeMeta = STEPS.find((s) => s.num === current) ?? STEPS[0];
  const progressPct = ((current - 1) / (total - 1)) * 100;

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile: compact step counter + track */}
      <div className="sm:hidden">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="truncate text-xs font-semibold text-foreground">
            <span className="font-medium text-muted-foreground">
              Step {current} of {total}
            </span>
            <span className="mx-2 text-border" aria-hidden>
              ·
            </span>
            {activeMeta.label}
          </p>
          <p className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
            {Math.round((current / total) * 100)}%
          </p>
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={`Reservation progress: step ${current} of ${total}`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(progressPct, current === 1 ? 8 : progressPct)}%` }}
          />
        </div>
      </div>

      {/* Desktop: numbered stepper with connectors */}
      <nav aria-label="Reservation progress" className="hidden items-center gap-2 sm:flex">
        {STEPS.map((s, i) => {
          const done = current > s.num;
          const active = current === s.num;
          const reachable = canReach(s.num);
          return (
            <React.Fragment key={s.num}>
              {i > 0 && (
                <div
                  aria-hidden
                  className={cn(
                    "h-px flex-1 rounded-full transition-colors",
                    current > s.num - 1 ? "bg-primary/40" : "bg-border"
                  )}
                />
              )}
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onStepChange(s.num)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full px-1 py-1 transition-opacity",
                  reachable ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-primary/15 text-primary"
                        : "border border-border bg-muted text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={2.5} aria-hidden /> : s.num}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
}
