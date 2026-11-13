"use client";

import * as React from "react";
import { today, getLocalTimeZone } from "@internationalized/date";
import { StayRangeCalendar, type StayRangeValue } from "@/components/ui/stay-range-calendar";

interface DatesStepProps {
  value: StayRangeValue | null;
  onChange: (value: StayRangeValue | null) => void;
  nights: number;
  error?: string;
}

/**
 * Step 1: the calendar and nothing else. The chosen range and night count
 * appear in the modal footer, so the step needs no summary of its own.
 */
export function DatesStep({ value, onChange, nights, error }: DatesStepProps) {
  const minValue = today(getLocalTimeZone());

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <StayRangeCalendar
        value={value}
        onChange={onChange}
        minValue={minValue}
        aria-label="Select stay dates"
      />
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        {!value ? "Select check-in, then check-out" : nights > 0 ? "\u00a0" : "Select check-out"}
      </p>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}
