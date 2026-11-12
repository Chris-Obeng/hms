"use client";

import * as React from "react";
import { addDays, differenceInCalendarDays, format, startOfDay, subDays } from "date-fns";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button, Calendar, Popover } from "@heroui/react";
import { CalendarDate } from "@internationalized/date";
import { cn } from "@/lib/utils";

function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function fromCalendarDate(cv: CalendarDate): Date {
  return new Date(cv.year, cv.month - 1, cv.day);
}

function parseLocalDate(dateStr?: string): Date {
  if (!dateStr) return startOfDay(new Date());
  return new Date(`${dateStr}T00:00:00`);
}

function relativeLabel(selected: Date, today: Date): string | null {
  const diff = differenceInCalendarDays(startOfDay(selected), startOfDay(today));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return null;
}

interface DateControlProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  /** Property-timezone business today (YYYY-MM-DD). */
  todayDateStr?: string;
}

/**
 * Desktop & tablet date card: stretched calendar trigger + inline Today reset +
 * ±1-day tactile stepper. No nested interactive buttons.
 */
export function DateCard({ selectedDate, onDateChange, todayDateStr }: DateControlProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const todayDate = React.useMemo(() => parseLocalDate(todayDateStr), [todayDateStr]);
  const isTodayDate =
    startOfDay(selectedDate).getTime() === startOfDay(todayDate).getTime();
  const calendarValue = toCalendarDate(selectedDate);
  const relative = relativeLabel(selectedDate, todayDate);

  const goToToday = React.useCallback(() => {
    onDateChange(todayDate);
    setCalendarOpen(false);
  }, [onDateChange, todayDate]);

  const goToPrevDay = React.useCallback(
    () => onDateChange(subDays(selectedDate, 1)),
    [selectedDate, onDateChange]
  );
  const goToNextDay = React.useCallback(
    () => onDateChange(addDays(selectedDate, 1)),
    [selectedDate, onDateChange]
  );

  return (
    <div className="group relative flex h-full flex-col justify-between rounded-[20px] border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:border-border">
      <Popover isOpen={calendarOpen} onOpenChange={setCalendarOpen}>
        <Button
          variant="ghost"
          aria-label={`Change date, currently ${format(selectedDate, "EEEE, MMMM d, yyyy")}`}
          className="absolute inset-0 h-full w-full min-w-0 cursor-pointer rounded-[20px] bg-transparent p-0 shadow-none outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Popover.Content
          placement="bottom start"
          className="w-auto rounded-2xl border border-border/60 bg-popover p-0 shadow-xl"
        >
          <Popover.Dialog aria-label="Select business date" className="p-3 outline-none">
            {!isTodayDate && (
              <div className="mb-2 flex justify-end border-b border-border/50 pb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={goToToday}
                  className="h-8 rounded-lg px-2.5 text-xs font-semibold text-primary"
                >
                  Jump to today
                </Button>
              </div>
            )}
            <Calendar
              aria-label="Select business date"
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

      {/* Non-interactive display layer so clicks pass through to Popover.Trigger */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col justify-between gap-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-muted-foreground">
            {format(selectedDate, "EEEE")}
          </span>

          {isTodayDate ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
              Today
            </span>
          ) : (
            <button
              type="button"
              onClick={goToToday}
              className="ui-press pointer-events-auto inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-md border border-border/70 bg-secondary/70 px-2 py-0.5 text-[11px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary"
            >
              <RotateCcw className="size-3 text-muted-foreground" aria-hidden="true" />
              {relative ?? "Today"}
            </button>
          )}
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-[2.625rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground">
            {format(selectedDate, "d")}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold text-foreground">
              {format(selectedDate, "MMMM")}
            </span>
            <span className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
              {format(selectedDate, "yyyy")}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-primary">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            Select date
          </span>

          {/* Day stepper: pointer-events re-enabled above trigger */}
          <div className="pointer-events-auto inline-flex items-center rounded-xl border border-border/60 bg-background/80 p-0.5">
            <button
              type="button"
              aria-label="Previous day"
              onClick={goToPrevDay}
              className="ui-press grid size-10 cursor-pointer place-items-center rounded-[9px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-8 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="h-4 w-px bg-border/60" aria-hidden="true" />
            <button
              type="button"
              aria-label="Next day"
              onClick={goToNextDay}
              className="ui-press grid size-10 cursor-pointer place-items-center rounded-[9px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-8 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Phone week strip (<768px): 44px week chevrons, tappable month-picker popover
 * on the range label, 1-tap Today return pill, and 48px+ thumb-friendly day cells.
 */
export function MobileWeekCalendar({
  selectedDate,
  onDateChange,
  todayDateStr,
}: DateControlProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const todayDate = React.useMemo(() => parseLocalDate(todayDateStr), [todayDateStr]);
  const isTodaySelected =
    startOfDay(selectedDate).getTime() === startOfDay(todayDate).getTime();
  const calendarValue = toCalendarDate(selectedDate);

  const weekDays = React.useMemo(() => {
    const dayOfWeek = selectedDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(selectedDate);
    monday.setDate(monday.getDate() + diff);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [selectedDate]);

  const goToPrevWeek = React.useCallback(() => {
    onDateChange(subDays(selectedDate, 7));
  }, [selectedDate, onDateChange]);

  const goToNextWeek = React.useCallback(() => {
    onDateChange(addDays(selectedDate, 7));
  }, [selectedDate, onDateChange]);

  const goToToday = React.useCallback(() => {
    onDateChange(todayDate);
    setCalendarOpen(false);
  }, [onDateChange, todayDate]);

  const sameMonth = weekDays[0].getMonth() === weekDays[6].getMonth();
  const rangeLabel = sameMonth
    ? `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], "d, yyyy")}`
    : `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], "MMM d, yyyy")}`;

  return (
    <section
      aria-label="Date navigation"
      className="rounded-[20px] border border-border/60 bg-card p-2 shadow-[0_1px_3px_rgb(0_0_0/0.04)] md:hidden"
    >
      <div className="flex items-center justify-between gap-1 px-0.5 pb-1">
        <button
          type="button"
          onClick={goToPrevWeek}
          aria-label="Previous week"
          className="ui-press grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/70"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="flex min-w-0 items-center justify-center gap-1.5">
          <Popover isOpen={calendarOpen} onOpenChange={setCalendarOpen}>
            <Button
              variant="ghost"
              aria-label="Open calendar"
              className="ui-press inline-flex min-h-11 min-w-0 cursor-pointer items-center gap-1.5 rounded-xl bg-transparent px-2.5 text-[13px] font-semibold text-foreground shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/60"
            >
              <CalendarDays className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate tabular-nums">{rangeLabel}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Button>
            <Popover.Content
              placement="bottom"
              className="w-auto rounded-2xl border border-border/60 bg-popover p-0 shadow-xl"
            >
              <Popover.Dialog aria-label="Select business date" className="p-3 outline-none">
                {!isTodaySelected && (
                  <div className="mb-2 flex justify-end border-b border-border/50 pb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={goToToday}
                      className="h-9 rounded-lg px-3 text-xs font-semibold text-primary"
                    >
                      Jump to today
                    </Button>
                  </div>
                )}
                <Calendar
                  aria-label="Select business date"
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

          {!isTodaySelected && (
            <button
              type="button"
              onClick={goToToday}
              className="ui-press inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-xl bg-primary/10 px-3 text-xs font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Today
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={goToNextWeek}
          aria-label="Next week"
          className="ui-press grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/70"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 px-0.5 pb-0.5">
        {weekDays.map((day) => {
          const dayStart = startOfDay(day).getTime();
          const isSel = dayStart === startOfDay(selectedDate).getTime();
          const isTod = dayStart === startOfDay(todayDate).getTime();

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDateChange(day)}
              aria-pressed={isSel}
              aria-label={format(day, "EEEE, MMMM d, yyyy")}
              className={cn(
                "ui-press relative flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSel
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : isTod
                    ? "bg-primary/[0.07] text-primary ring-1 ring-inset ring-primary/25"
                    : "text-muted-foreground active:bg-muted/70"
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-medium",
                  isSel
                    ? "text-primary-foreground/80"
                    : isTod
                      ? "text-primary"
                      : "text-muted-foreground"
                )}
              >
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "text-[15px] font-semibold leading-none tabular-nums",
                  isSel
                    ? "text-primary-foreground"
                    : isTod
                      ? "text-primary"
                      : "text-foreground"
                )}
              >
                {format(day, "d")}
              </span>
              {isTod && !isSel && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 size-1 rounded-full bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
