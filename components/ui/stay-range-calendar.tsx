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
 * Dual-month stay range picker — HeroUI defaults only.
 *
 * One RangeCalendar drives two month grids (composed via visibleDuration +
 * per-grid offset). Two months on desktop, one on mobile. No custom styling:
 * selection/colors come straight from HeroUI's stock RangeCalendar.
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
      className={cn("@container-normal w-full max-w-none overflow-x-auto", className)}
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
      <div className="mx-auto flex w-max gap-8">
        <div className="w-64">
          <RangeCalendar.Header>
            <RangeCalendar.NavButton slot="previous" />
            <RangeCalendar.Heading className="flex-none" />
            {/* One month: next lives here; two months: next sits on the last */}
            {months === 1 ? <RangeCalendar.NavButton slot="next" /> : <div className="size-6" />}
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
              <div className="size-6" />
              <RangeCalendar.Heading className="flex-none" offset={{ months: 1 }} />
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
