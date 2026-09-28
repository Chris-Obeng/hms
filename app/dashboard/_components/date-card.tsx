"use client";

import * as React from "react";
import { addDays, format, isToday, isTomorrow, isYesterday, subDays } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Calendar, Popover } from "@heroui/react";
import { CalendarDate } from "@internationalized/date";

function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function fromCalendarDate(cv: CalendarDate): Date {
  return new Date(cv.year, cv.month - 1, cv.day);
}

function relativeLabel(date: Date): string | null {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  return null;
}

interface DateCardProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

/**
 * Date display + calendar trigger + a ±1-day stepper. The whole card is a
 * stretched trigger button (invisible, inset-0) that opens the calendar; the
 * chevron stepper re-enables pointer events above it, so day-stepping and the
 * calendar coexist without nesting buttons.
 */
export function DateCard({ selectedDate, onDateChange }: DateCardProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const isTodayDate = isToday(selectedDate);
  const calendarValue = toCalendarDate(selectedDate);
  const relative = relativeLabel(selectedDate);

  const goToToday = React.useCallback(() => {
    onDateChange(new Date());
    setCalendarOpen(false);
  }, [onDateChange]);

  const goToPrevDay = React.useCallback(
    () => onDateChange(subDays(selectedDate, 1)),
    [selectedDate, onDateChange]
  );
  const goToNextDay = React.useCallback(
    () => onDateChange(addDays(selectedDate, 1)),
    [selectedDate, onDateChange]
  );

  return (
    <div className="group relative rounded-2xl border border-border/50 bg-card p-5 shadow-xs transition-all hover:border-border hover:shadow-sm">
      <Popover isOpen={calendarOpen} onOpenChange={setCalendarOpen}>
        <Popover.Trigger>
          <button
            type="button"
            aria-label="Change date"
            className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Popover.Trigger>
        <Popover.Content placement="bottom start" className="w-auto border-border/60 p-0">
          <Popover.Dialog className="p-3 outline-none">
            {!isTodayDate && (
              <div className="mb-2 flex justify-center">
                <Button variant="ghost" size="sm" onPress={goToToday} className="text-xs text-primary">
                  Jump to today
                </Button>
              </div>
            )}
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
              <Calendar.Header>
                <Calendar.NavButton slot="previous" />
                <Calendar.Heading />
                <Calendar.NavButton slot="next" />
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>
                  {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                </Calendar.GridHeader>
                <Calendar.GridBody>
                  {(date) => <Calendar.Cell date={date} />}
                </Calendar.GridBody>
              </Calendar.Grid>
            </Calendar>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>

      {/* Display layer: non-interactive, so clicks fall through to the trigger. */}
      <div className="pointer-events-none relative z-10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold tracking-wide text-muted-foreground">
            {format(selectedDate, "EEEE")}
          </span>
          {relative && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {relative}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-baseline gap-2.5">
          <span className="text-5xl font-bold leading-none tracking-tight tabular-nums text-foreground">
            {format(selectedDate, "d")}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-base font-semibold text-foreground">
              {format(selectedDate, "MMMM")}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {format(selectedDate, "yyyy")}
            </span>
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground/80 transition-colors group-hover:text-primary">
            <CalendarDays className="size-3.5" />
            Change date
          </span>

          {/* Day stepper: re-enable pointer events above the display layer. */}
          <div className="pointer-events-auto flex items-center rounded-lg border border-border/50 bg-background/60">
            <button
              type="button"
              aria-label="Previous day"
              onClick={goToPrevDay}
              className="grid size-8 place-items-center rounded-l-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="h-4 w-px bg-border/60" />
            <button
              type="button"
              aria-label="Next day"
              onClick={goToNextDay}
              className="grid size-8 place-items-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
