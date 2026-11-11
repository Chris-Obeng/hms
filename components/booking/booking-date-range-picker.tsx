"use client";

import * as React from "react";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { Popover, Drawer, Button } from "@heroui/react";
import {
  CalendarDate,
  today,
  getLocalTimeZone,
} from "@internationalized/date";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
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
  minDate?: string;
  onDatesChange: (checkIn: string, checkOut: string) => void;
  className?: string;
}

export function BookingDateRangePicker({
  checkIn,
  checkOut,
  minDate,
  onDatesChange,
  className,
}: BookingDateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();

  const minCd = React.useMemo(
    () => stringToCalendarDate(minDate) ?? today(getLocalTimeZone()),
    [minDate]
  );
  const startDate = React.useMemo(
    () => stringToCalendarDate(checkIn) ?? minCd,
    [checkIn, minCd]
  );
  const endDate = React.useMemo(
    () => stringToCalendarDate(checkOut) ?? minCd.add({ days: 1 }),
    [checkOut, minCd]
  );
  const rangeValue = React.useMemo(
    () => ({ start: startDate, end: endDate }),
    [startDate, endDate]
  );

  const checkInDate = React.useMemo(
    () => new Date(checkIn + "T00:00:00"),
    [checkIn]
  );
  const checkOutDate = React.useMemo(
    () => new Date(checkOut + "T00:00:00"),
    [checkOut]
  );
  const nights = React.useMemo(
    () => Math.max(1, differenceInDays(checkOutDate, checkInDate)),
    [checkInDate, checkOutDate]
  );

  const handleRangeChange = (
    val: { start: CalendarDate; end: CalendarDate } | null
  ) => {
    if (val?.start && val?.end) {
      const startStr = calendarDateToString(val.start);
      let endStr = calendarDateToString(val.end);

      if (startStr === endStr) {
        const nextDay = val.end.add({ days: 1 });
        endStr = calendarDateToString(nextDay);
      }

      onDatesChange(startStr, endStr);
      if (!isMobile) {
        setOpen(false);
      }
    }
  };

  const formattedCheckIn = checkIn ? format(checkInDate, "EEE d MMM") : "Check-in";
  const formattedCheckOut = checkOut
    ? format(checkOutDate, "EEE d MMM")
    : "Check-out";
  const compactCheckIn = checkIn ? format(checkInDate, "d MMM") : "Check-in";
  const compactCheckOut = checkOut ? format(checkOutDate, "d MMM") : "Check-out";

  const triggerButton = (
    <button
      type="button"
      className={cn(
        "group flex w-full cursor-pointer text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0485F7] touch-manipulation",
        // Mobile (`v24Sj`): 50px soft grey cell, stacked When + range
        "h-[50px] flex-col justify-center gap-0.5 rounded-[12px] bg-[#F5F5F5] hover:bg-[#EBEBEC]/75 px-3",
        // Desktop (`dZjQo`): 52px soft grey cell, left calendar icon + stacked label/range
        "md:h-[52px] md:w-auto md:flex-row md:items-center md:justify-start md:gap-2.5 md:px-[18px]",
        className
      )}
      aria-label="Select check-in and check-out dates"
    >
      <CalendarIcon
        className="hidden md:block size-[17px] shrink-0 text-[#0485F7]"
        strokeWidth={2}
      />

      {/* Mobile top row */}
      <span className="flex md:hidden items-center gap-1.5">
        <CalendarIcon className="size-[11px] shrink-0 text-[#0485F7]" strokeWidth={2} />
        <span className="text-[10px] font-medium tracking-[0.2px] text-[#71717A]">
          When
        </span>
      </span>

      {/* Desktop stacked + Mobile bottom row */}
      <span className="flex flex-col min-w-0 w-full md:w-auto gap-0.5">
        <span className="hidden md:block text-[10px] font-medium tracking-[0.3px] text-[#71717A]">
          When
        </span>
        <span className="flex items-center justify-between md:justify-start gap-2 min-w-0">
          <span className="hidden min-[400px]:inline md:inline text-[11px] md:text-[13px] font-medium text-[#18181B] truncate whitespace-nowrap">
            {formattedCheckIn} — {formattedCheckOut}
          </span>
          <span className="inline min-[400px]:hidden text-[11px] font-medium text-[#18181B] truncate whitespace-nowrap">
            {compactCheckIn} — {compactCheckOut}
          </span>
          <ChevronDown
            className={cn(
              "size-3 md:size-3.5 shrink-0 text-[#71717A] transition-transform duration-150",
              open && "rotate-180"
            )}
            strokeWidth={2}
          />
        </span>
      </span>
    </button>
  );

  const summaryBar = (
    <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-[14px] bg-[#F5F5F5] px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-[#71717A]">Check-in</p>
        <p className="text-xs font-semibold text-[#18181B] truncate">
          {formattedCheckIn}
        </p>
      </div>
      <div className="min-w-0 border-l border-[#E4E4E7] pl-3">
        <p className="text-[10px] font-medium text-[#71717A]">Check-out</p>
        <p className="text-xs font-semibold text-[#18181B] truncate">
          {formattedCheckOut}
        </p>
      </div>
      <span className="inline-flex items-center rounded-full bg-[#0485F7]/15 px-2.5 py-1 text-[11px] font-semibold text-[#0485F7] tabular-nums">
        {nights} {nights === 1 ? "night" : "nights"}
      </span>
    </div>
  );

  const calendar = (
    <StayRangeCalendar
      value={rangeValue}
      onChange={handleRangeChange}
      minValue={minCd}
      aria-label="Select stay dates"
    />
  );

  if (isMobile) {
    return (
      <>
        {React.cloneElement(triggerButton, {
          onClick: () => setOpen(true),
          "aria-haspopup": "dialog",
          "aria-expanded": open,
        })}
        <Drawer.Backdrop
          isOpen={open}
          onOpenChange={setOpen}
          variant="blur"
          className="booking-portal"
        >
          <Drawer.Content placement="bottom" className="booking-portal">
            <Drawer.Dialog className="booking-sheet-dialog">
              <Drawer.Handle />
              <Drawer.CloseTrigger />
              <Drawer.Header>
                <Drawer.Heading>When are you staying?</Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body className="space-y-4">
                {summaryBar}
                <div className="booking-calendar-surface w-full pt-1">
                  {calendar}
                </div>
              </Drawer.Body>
              <Drawer.Footer>
                <Button
                  variant="primary"
                  slot="close"
                  className="booking-btn-primary h-11 w-full text-[15px] touch-manipulation"
                >
                  Apply · {nights} {nights === 1 ? "night" : "nights"}
                </Button>
              </Drawer.Footer>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </>
    );
  }

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger>{triggerButton}</Popover.Trigger>

      <Popover.Content
        placement="bottom start"
        className="booking-portal w-auto max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[24px] border border-[#E4E4E7] bg-white p-0 shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
      >
        <Popover.Dialog className="booking-calendar-surface p-5 outline-none space-y-4">
          {summaryBar}
          {calendar}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
