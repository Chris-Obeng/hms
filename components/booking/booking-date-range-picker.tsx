"use client";

import * as React from "react";
import { Calendar as CalendarIcon, Moon } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { Popover, RangeCalendar } from "@heroui/react";
import {
  CalendarDate,
  today,
  getLocalTimeZone,
} from "@internationalized/date";
import { cn } from "@/lib/utils";

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

  const nowCd = today(getLocalTimeZone());
  const startDate = stringToCalendarDate(checkIn) ?? nowCd;
  const endDate =
    stringToCalendarDate(checkOut) ??
    new CalendarDate(nowCd.year, nowCd.month, nowCd.day + 1);

  const rangeValue = { start: startDate, end: endDate };

  const checkInDate = new Date(checkIn + "T00:00:00");
  const checkOutDate = new Date(checkOut + "T00:00:00");
  const nights = Math.max(1, differenceInDays(checkOutDate, checkInDate));

  const handleRangeChange = (val: { start: CalendarDate; end: CalendarDate } | null) => {
    if (val?.start && val?.end) {
      const startStr = calendarDateToString(val.start);
      let endStr = calendarDateToString(val.end);

      if (startStr === endStr) {
        const nextDay = new CalendarDate(val.end.year, val.end.month, val.end.day + 1);
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
      <Popover.Trigger
        className={cn(
          "flex items-center justify-between gap-2 sm:gap-3 cursor-pointer outline-none transition-all w-full min-w-0",
          variant === "hero" &&
            "h-[52px] px-3 sm:px-3.5 rounded-xl bg-background/90 border border-border/80 hover:border-primary shadow-xs hover:shadow-sm text-left",
          variant === "compact" &&
            "h-11 sm:h-10 px-2.5 sm:px-3 rounded-lg border border-border/60 bg-card hover:bg-accent/40 text-xs font-medium",
          variant === "card" &&
            "h-[52px] px-3.5 rounded-xl bg-background/90 border border-border/80 hover:border-primary shadow-xs text-left",
          className
        )}
        aria-label="Select check-in and check-out dates"
      >
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
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

        <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-accent/60 text-foreground text-[10px] sm:text-[11px] font-semibold shrink-0">
          <Moon className="size-3 text-primary" />
          <span className="tabular-nums whitespace-nowrap">
            {nights}
            <span className="hidden min-[380px]:inline">
              {" "}
              {nights === 1 ? "night" : "nights"}
            </span>
          </span>
        </div>
      </Popover.Trigger>

      <Popover.Content
        placement="bottom"
        className="p-0 w-auto border-border/60 max-w-[calc(100vw-1rem)]"
      >
        <Popover.Dialog className="outline-none p-3 sm:p-3.5 bg-white rounded-2xl shadow-xl booking-calendar-panel">
          <RangeCalendar
            aria-label="Select stay dates"
            className="booking-range-calendar w-full"
            minValue={nowCd}
            value={rangeValue}
            onChange={handleRangeChange}
            firstDayOfWeek="mon"
          >
            <RangeCalendar.Header className="pb-2">
              <RangeCalendar.Heading className="text-slate-900 font-semibold" />
              <RangeCalendar.NavButton slot="previous" className="text-slate-800" />
              <RangeCalendar.NavButton slot="next" className="text-slate-800" />
            </RangeCalendar.Header>

            <RangeCalendar.Grid>
              <RangeCalendar.GridHeader>
                {(day) => (
                  <RangeCalendar.HeaderCell className="text-slate-600 font-bold uppercase tracking-wide">
                    {day}
                  </RangeCalendar.HeaderCell>
                )}
              </RangeCalendar.GridHeader>
              <RangeCalendar.GridBody>
                {(date) => <RangeCalendar.Cell date={date} />}
              </RangeCalendar.GridBody>
            </RangeCalendar.Grid>
          </RangeCalendar>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
