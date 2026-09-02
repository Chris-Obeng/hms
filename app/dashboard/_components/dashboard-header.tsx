"use client";

import * as React from "react";
import { format, addDays, subDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Calendar, Popover } from "@heroui/react";
import { CalendarDate } from "@internationalized/date";

// ── helpers ────────────────────────────────────────────────────

/** Convert JS Date → @internationalized/date CalendarDate */
function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Convert CalendarDate → JS Date */
function fromCalendarDate(cv: CalendarDate): Date {
  return new Date(cv.year, cv.month - 1, cv.day);
}

// ── Props ──────────────────────────────────────────────────────

interface DashboardHeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

// ── Component ──────────────────────────────────────────────────

export function DashboardHeader({
  selectedDate,
  onDateChange,
}: DashboardHeaderProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  const isTodayDate = isToday(selectedDate);

  const goToPrevDay = React.useCallback(() => {
    onDateChange(subDays(selectedDate, 1));
  }, [selectedDate, onDateChange]);

  const goToNextDay = React.useCallback(() => {
    onDateChange(addDays(selectedDate, 1));
  }, [selectedDate, onDateChange]);

  const goToToday = React.useCallback(() => {
    onDateChange(new Date());
    setCalendarOpen(false);
  }, [onDateChange]);

  const calendarValue = toCalendarDate(selectedDate);

  return (
    <div className="flex items-center justify-center gap-1">
      {/* Date navigation */}
      <div className="flex items-center rounded-lg border border-border/40 bg-background">
        {/* Prev day */}
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          onPress={goToPrevDay}
          aria-label="Previous day"
          className="size-8"
        >
          <ChevronLeft className="size-4" />
        </Button>

        {/* Date picker trigger */}
        <Popover isOpen={calendarOpen} onOpenChange={setCalendarOpen}>
          <Popover.Trigger>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Open date picker"
              className={cn(
                "h-8 px-3 text-xs font-semibold",
                isTodayDate && "text-primary",
              )}
            >
              {isTodayDate ? "Today" : format(selectedDate, "MMM d")}
            </Button>
          </Popover.Trigger>
          <Popover.Content placement="bottom" className="p-0 w-auto border-border/60">
            <Popover.Dialog className="outline-none bg-card p-3 text-foreground">
              {/* Jump-to-today shortcut */}
              {!isTodayDate && (
                <div className="mb-2 flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={goToToday}
                    className="text-xs text-primary"
                  >
                    Jump to today
                  </Button>
                </div>
              )}
              {/* HeroUI Calendar */}
              <Calendar
                aria-label="Select date"
                value={calendarValue}
                onChange={(date) => {
                  if (date) {
                    onDateChange(fromCalendarDate(date as CalendarDate));
                    setCalendarOpen(false);
                  }
                }}
              >
                <Calendar.Header className="pb-2 text-foreground">
                  <Calendar.NavButton slot="previous" />
                  <Calendar.Heading />
                  <Calendar.NavButton slot="next" />
                </Calendar.Header>
                <Calendar.Grid>
                  <Calendar.GridHeader className="text-foreground">
                    {(day) => (
                      <Calendar.HeaderCell className="text-xs font-semibold text-foreground">{day}</Calendar.HeaderCell>
                    )}
                  </Calendar.GridHeader>
                  <Calendar.GridBody>
                    {(date) => <Calendar.Cell date={date} className="text-sm text-foreground" />}
                  </Calendar.GridBody>
                </Calendar.Grid>
              </Calendar>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>

        {/* Next day */}
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          onPress={goToNextDay}
          aria-label="Next day"
          className="size-8"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
