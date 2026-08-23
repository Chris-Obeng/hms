"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type BookingStepId = 1 | 2 | 3;

export interface BookingStep {
  num: BookingStepId;
  /** Short label for desktop / sr */
  label: string;
  /** Mobile title for current step */
  title: string;
}

export const BOOKING_STEPS: BookingStep[] = [
  { num: 1, label: "Stay", title: "Choose stay" },
  { num: 2, label: "Guest", title: "Guest details" },
  { num: 3, label: "Confirm", title: "Review & pay" },
];

interface BookingProgressProps {
  current: BookingStepId;
  /** Whether the guest can jump to a step (validation gates) */
  canReach: (step: BookingStepId) => boolean;
  /** Whether a step is complete */
  isComplete: (step: BookingStepId) => boolean;
  onStepChange: (step: BookingStepId) => void;
  className?: string;
}

/**
 * Booking funnel progress — industry pattern (Booking.com / Expedia style):
 * sits sticky *under* brand chrome, never inside the hotel logo header.
 *
 * Mobile: compact "Step X of 3" + thin progress track (saves vertical space).
 * Desktop: full labeled steps with connectors.
 */
export function BookingProgress({
  current,
  canReach,
  isComplete,
  onStepChange,
  className,
}: BookingProgressProps) {
  const total = BOOKING_STEPS.length;
  const activeMeta = BOOKING_STEPS.find((s) => s.num === current) ?? BOOKING_STEPS[0];
  const progressPct = ((current - 1) / (total - 1)) * 100;

  return (
    <div
      className={cn(
        "border-b border-[var(--bk-line)] bg-[var(--bk-bg)]/95 backdrop-blur-md",
        className
      )}
    >
      {/* Mobile compact progress — OTA checkout style */}
      <div className="sm:hidden booking-safe-x py-2.5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-semibold text-[var(--bk-ink)] truncate">
            <span className="text-[var(--bk-muted)] font-medium">
              Step {current} of {total}
            </span>
            <span className="mx-1.5 text-[var(--bk-line-strong)]" aria-hidden>
              ·
            </span>
            {activeMeta.title}
          </p>
          <p className="text-[10px] font-medium text-[var(--bk-muted)] tabular-nums shrink-0">
            {Math.round((current / total) * 100)}%
          </p>
        </div>
        <div
          className="h-1 w-full rounded-full bg-[var(--bk-line)] overflow-hidden"
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={`Booking progress: step ${current} of ${total}`}
        >
          <div
            className="h-full rounded-full bg-[var(--bk-ink)] transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(progressPct, current === 1 ? 8 : progressPct)}%` }}
          />
        </div>
        {/* Jump targets — min 44px tap height via py */}
        <nav
          aria-label="Booking steps"
          className="mt-2 flex items-stretch gap-1"
        >
          {BOOKING_STEPS.map((s) => {
            const done = isComplete(s.num);
            const active = current === s.num;
            const reachable = canReach(s.num);
            return (
              <button
                key={s.num}
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onStepChange(s.num)}
                className={cn(
                  "flex-1 min-h-9 rounded-lg px-1 py-1.5 text-[10px] font-semibold tracking-wide uppercase transition-colors touch-manipulation",
                  active && "bg-[var(--bk-ink)] text-[var(--bk-on-ink)]",
                  !active && done && "bg-[var(--bk-surface-soft)] text-[var(--bk-ink)]",
                  !active &&
                    !done &&
                    reachable &&
                    "bg-transparent text-[var(--bk-muted)]",
                  !reachable && "opacity-40 cursor-not-allowed"
                )}
                aria-current={active ? "step" : undefined}
              >
                {s.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Desktop full stepper */}
      <nav
        aria-label="Booking progress"
        className="hidden sm:flex max-w-2xl mx-auto booking-safe-x py-3 items-center gap-2"
      >
        {BOOKING_STEPS.map((s, i) => {
          const done = isComplete(s.num);
          const active = current === s.num;
          const reachable = canReach(s.num);

          return (
            <React.Fragment key={s.num}>
              {i > 0 && (
                <div
                  className="booking-step-track"
                  data-done={current > s.num - 1 ? "true" : "false"}
                  aria-hidden
                />
              )}
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onStepChange(s.num)}
                className={cn(
                  "flex items-center gap-2 shrink-0 rounded-full px-1 py-1 transition-opacity touch-manipulation",
                  reachable ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "size-6 rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0 transition-colors",
                    (done && !active) || active
                      ? "bg-[var(--bk-ink)] text-[var(--bk-on-ink)]"
                      : "bg-[var(--bk-surface-soft)] text-[var(--bk-muted)] border border-[var(--bk-line)]"
                  )}
                >
                  {done && !active ? (
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  ) : (
                    s.num
                  )}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    active ? "text-[var(--bk-ink)]" : "text-[var(--bk-muted)]"
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
