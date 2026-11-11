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
 * Dual-month stay range picker on desktop, responsive full-width single-month
 * grid on mobile so bottom-sheet calendars have generous touch cells with zero
 * horizontal overflow.
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
      className={cn(
        "@container-normal w-full max-w-none",
        months === 2 ? "overflow-x-auto" : "overflow-visible",
        className
      )}
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
      <div
        className={
          months === 1
            ? "mx-auto flex w-full max-w-[21rem] justify-center"
            : "mx-auto flex w-max gap-8"
        }
      >
        <div className={months === 1 ? "w-full" : "w-64"}>
          <RangeCalendar.Header>
            <RangeCalendar.NavButton slot="previous" />
            <RangeCalendar.Heading className="flex-none text-center" />
            {/* One month: next lives here; two months: next sits on the last */}
            {months === 1 ? <RangeCalendar.NavButton slot="next" /> : <div className="size-7" />}
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
          <div className="w-64">
            <RangeCalendar.Header>
              <div className="size-7" />
              <RangeCalendar.Heading className="flex-none text-center" offset={{ months: 1 }} />
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
