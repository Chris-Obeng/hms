"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { today, getLocalTimeZone } from "@internationalized/date";
import { StayRangeCalendar, type StayRangeValue } from "@/components/ui/stay-range-calendar";
import { formatDate, nightsLabel } from "@/lib/format";

interface DatesStepProps {
  value: StayRangeValue | null;
  onChange: (value: StayRangeValue | null) => void;
  nights: number;
  error?: string;
}

/**
 * Step 1 — pick the stay. A centred dual-month calendar (single month on
 * mobile), then a live range + nights pill once both ends are set.
 */
export function DatesStep({ value, onChange, nights, error }: DatesStepProps) {
  const minValue = today(getLocalTimeZone());

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-start gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <CalendarDays className="size-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Stay dates</p>
          <p className="text-xs text-muted-foreground">Select check-in and check-out</p>
        </div>
      </div>

      <div className="flex justify-center rounded-xl border border-border bg-background p-2 sm:p-3">
        <StayRangeCalendar
          value={value}
          onChange={onChange}
          minValue={minValue}
          aria-label="Select stay dates"
        />
      </div>

      {value && nights > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">Stay:</span>
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {formatDate(new Date(value.start.year, value.start.month - 1, value.start.day))} →{" "}
            {formatDate(new Date(value.end.year, value.end.month - 1, value.end.day))}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {nightsLabel(nights)}
          </span>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Pick a check-in date, then a check-out date to see available rooms.
        </p>
      )}

      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}
