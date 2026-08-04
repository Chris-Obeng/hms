"use client";

import * as React from "react";
import { RangeCalendar } from "@heroui/react";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface StayRangeValue {
  start: CalendarDate;
  end: CalendarDate;
}

interface StayRangeCalendarProps {
  value: { start: DateValue; end: DateValue } | null;
  onChange: (value: StayRangeValue | null) => void;
  minValue?: DateValue;
  maxValue?: DateValue;
  isDateUnavailable?: (date: DateValue) => boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Airbnb-style dual-month stay range picker.
 *
 * - ONE RangeCalendar state machine driving two month grids.
 * - Nav buttons sit on the outer edges: prev on the first month,
 *   next on the last. No per-month heading duplication issues —
 *   each grid header shows its own month label via `offset`.
 * - Range visuals: rounded pill start/end, soft track between —
 *   driven by `booking-range-calendar` CSS (globals.css).
 * - Mobile: renders a single month; desktop (md+): two months.
 */
export function StayRangeCalendar({
  value,
  onChange,
  minValue,
  maxValue,
  isDateUnavailable,
  className,
  "aria-label": ariaLabel = "Select stay dates",
}: StayRangeCalendarProps) {
  const isMobile = useIsMobile();
  const months = isMobile ? 1 : 2;

  return (
    <RangeCalendar
      aria-label={ariaLabel}
      className={cn("stay-range-calendar", className)}
      visibleDuration={{ months }}
      value={value}
      onChange={(v) =>
        onChange(v ? { start: v.start as CalendarDate, end: v.end as CalendarDate } : null)
      }
      minValue={minValue}
      maxValue={maxValue}
      isDateUnavailable={isDateUnavailable}
      firstDayOfWeek="mon"
      pageBehavior="single"
      selectionAlignment="start"
      weeksInMonth={6}
    >
      <div className="stay-range-months">
        <div className="stay-range-month">
          <RangeCalendar.Header>
            <RangeCalendar.NavButton slot="previous" />
            <RangeCalendar.Heading />
            {/* Spacer keeps heading centered when next-button column is absent */}
            {months === 1 ? <RangeCalendar.NavButton slot="next" /> : <span className="stay-range-nav-spacer" />}
          </RangeCalendar.Header>
          <RangeCalendar.Grid>
            <RangeCalendar.GridHeader>
              {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
            </RangeCalendar.GridHeader>
            <RangeCalendar.GridBody>
              {(date) => <RangeCalendar.Cell date={date} />}
            </RangeCalendar.GridBody>
          </RangeCalendar.Grid>
        </div>

        {months === 2 && (
          <div className="stay-range-month">
            <RangeCalendar.Header>
              <span className="stay-range-nav-spacer" />
              <RangeCalendar.Heading offset={{ months: 1 }} />
              <RangeCalendar.NavButton slot="next" />
            </RangeCalendar.Header>
            <RangeCalendar.Grid offset={{ months: 1 }}>
              <RangeCalendar.GridHeader>
                {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
              </RangeCalendar.GridHeader>
              <RangeCalendar.GridBody>
                {(date) => <RangeCalendar.Cell date={date} />}
              </RangeCalendar.GridBody>
            </RangeCalendar.Grid>
          </div>
        )}
      </div>
    </RangeCalendar>
  );
}
