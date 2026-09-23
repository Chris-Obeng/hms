"use client";

import * as React from "react";
import { Calendar as CalendarIcon, Moon } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { Popover } from "@heroui/react";
import {
  CalendarDate,
  today,
  getLocalTimeZone,
} from "@internationalized/date";
import { cn } from "@/lib/utils";
import { StayRangeCalendar } from "@/components/ui/stay-range-calendar";

function stringToCalendarDate(dateStr?: string | null): CalendarDate | null {
  if (!dateStr) return null;
  try {
    const parts = dateStr.split("-").map(Number);
    if (parts.length === 3) {
      return new CalendarDate(parts[0], parts[1], parts[2]);
    }
  } catch {}
  return null;
}

function calendarDateToString(cd: CalendarDate): string {
  const y = cd.year;
  const m = String(cd.month).padStart(2, "0");
  const d = String(cd.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface BookingDateRangePickerProps {
  checkIn: string;
  checkOut: string;
  onDatesChange: (checkIn: string, checkOut: string) => void;
  className?: string;
  variant?: "hero" | "compact" | "card";
}

export function BookingDateRangePicker({
  checkIn,
  checkOut,
  onDatesChange,
  className,
  variant = "hero",
}: BookingDateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const nowCd = React.useMemo(() => today(getLocalTimeZone()), []);
  const startDate = React.useMemo(() => stringToCalendarDate(checkIn) ?? nowCd, [checkIn, nowCd]);
  const endDate = React.useMemo(() => stringToCalendarDate(checkOut) ?? nowCd.add({ days: 1 }), [checkOut, nowCd]);
  const rangeValue = React.useMemo(() => ({ start: startDate, end: endDate }), [startDate, endDate]);

  const checkInDate = React.useMemo(() => new Date(checkIn + "T00:00:00"), [checkIn]);
  const checkOutDate = React.useMemo(() => new Date(checkOut + "T00:00:00"), [checkOut]);
  const nights = React.useMemo(() => Math.max(1, differenceInDays(checkOutDate, checkInDate)), [checkInDate, checkOutDate]);

  const handleRangeChange = (val: { start: CalendarDate; end: CalendarDate } | null) => {
    if (val?.start && val?.end) {
      const startStr = calendarDateToString(val.start);
      let endStr = calendarDateToString(val.end);

      if (startStr === endStr) {
        const nextDay = val.end.add({ days: 1 });
        endStr = calendarDateToString(nextDay);
      }

      onDatesChange(startStr, endStr);
      setOpen(false);
    }
  };

  const sameYear = checkInDate.getFullYear() === checkOutDate.getFullYear();
  const formattedCheckIn = checkIn
    ? format(checkInDate, sameYear ? "MMM d" : "MMM d, yyyy")
    : "Select date";
  const formattedCheckOut = checkOut
    ? format(checkOutDate, sameYear ? "MMM d" : "MMM d, yyyy")
    : "Select date";

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <button
          type="button"
          className={cn(
            "flex min-w-0 w-full cursor-pointer items-center justify-between gap-2 outline-none transition-[border-color,box-shadow,background-color] sm:gap-3 focus-visible:ring-2 focus-visible:ring-[oklch(0.52_0.12_178)] focus-visible:ring-offset-2",
            variant === "hero" &&
              "h-12 sm:h-[52px] px-3 sm:px-3.5 rounded-xl bg-background/90 border border-border/80 hover:border-primary shadow-xs hover:shadow-sm text-left",
            variant === "compact" &&
              "h-10 px-2.5 sm:px-3 rounded-lg border border-border/60 bg-card hover:bg-accent/40 text-xs font-medium",
            variant === "card" &&
              "min-h-14 px-3 sm:px-3.5 rounded-xl bg-background border border-border/80 hover:border-[oklch(0.52_0.12_178)] shadow-xs text-left",
            className
          )}
          aria-label="Select check-in and check-out dates"
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <div className="shrink-0 rounded-lg bg-[oklch(0.94_0.035_178)] p-2 text-[oklch(0.42_0.1_178)] dark:bg-[oklch(0.25_0.04_178)] dark:text-[oklch(0.78_0.09_178)]">
              <CalendarIcon className="size-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Stay Dates
              </span>
              <span className="text-xs font-semibold text-foreground truncate font-mono">
                {formattedCheckIn}
                <span className="text-muted-foreground mx-1">→</span>
                {formattedCheckOut}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-full bg-[oklch(0.94_0.035_178)] px-2 py-1 text-[11px] font-semibold text-[oklch(0.36_0.09_178)] dark:bg-[oklch(0.25_0.04_178)] dark:text-[oklch(0.82_0.08_178)]">
            <Moon className="size-3" />
            <span className="tabular-nums whitespace-nowrap">
              {nights}
              <span className="hidden min-[380px]:inline">
                {" "}
                {nights === 1 ? "night" : "nights"}
              </span>
            </span>
          </div>
        </button>
      </Popover.Trigger>

      <Popover.Content
        placement="bottom"
        className="w-[min(46rem,calc(100vw-0.75rem))] max-w-[calc(100vw-0.75rem)] overflow-hidden border-border/60 p-0 shadow-xl"
      >
        <Popover.Dialog
          className="booking-calendar-panel light p-2.5 outline-none sm:p-5"
          data-theme="light"
        >
          <StayRangeCalendar
            value={rangeValue}
            onChange={handleRangeChange}
            minValue={nowCd}
            aria-label="Select stay dates"
          />
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
