"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@heroui/react";
import { cn } from "@/lib/utils";

export type WizardStep = 1 | 2 | 3;

const STEPS: { num: WizardStep; label: string }[] = [
  { num: 1, label: "Dates" },
  { num: 2, label: "Rooms" },
  { num: 3, label: "Guest" },
];

interface BookingStepperProps {
  current: WizardStep;
  /** Whether the user may jump to this step (validation gate). */
  canReach: (step: WizardStep) => boolean;
  onStepChange: (step: WizardStep) => void;
  className?: string;
}

/**
 * Three labelled steps joined by a hairline. Reached steps are pressable to go
 * back; the same compact row works on phones and desktop.
 */
export function BookingStepper({ current, canReach, onStepChange, className }: BookingStepperProps) {
  return (
    <nav aria-label="Booking steps" className={cn("flex items-center gap-2", className)}>
      {STEPS.map((s, i) => {
        const done = current > s.num;
        const active = current === s.num;
        const reachable = canReach(s.num) && !active;
        return (
          <React.Fragment key={s.num}>
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "h-px min-w-4 flex-1 transition-colors duration-200",
                  current >= s.num ? "bg-primary/40" : "bg-border"
                )}
              />
            )}
            <Button
              size="sm"
              variant="ghost"
              isDisabled={!reachable && !active}
              onPress={() => reachable && onStepChange(s.num)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "h-11 shrink-0 gap-2 rounded-full px-2 text-sm font-medium md:h-8",
                active ? "pointer-events-none text-foreground" : "text-muted-foreground",
                "data-[disabled=true]:opacity-100"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-5 place-items-center rounded-full text-2xs font-semibold transition-colors duration-200",
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-primary/12 text-primary"
                      : "bg-secondary text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : s.num}
              </span>
              {s.label}
            </Button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
