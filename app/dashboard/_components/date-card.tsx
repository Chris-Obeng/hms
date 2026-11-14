"use client";

import * as React from "react";
import { addDays, differenceInCalendarDays, format, startOfDay, subDays } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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

const RELATIVE: Record<number, string> = { [-1]: "Yesterday", 0: "Today", 1: "Tomorrow" };

interface DateNavigatorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  /** Property-timezone business today (YYYY-MM-DD). */
  todayDateStr?: string;
  /** Inclusive bounds (YYYY-MM-DD); stepping and the calendar stop here. */
  minDateStr?: string;
  maxDateStr?: string;
  /** Disables every control (e.g. while a navigation is in flight). */
  isDisabled?: boolean;
  className?: string;
}

/**
 * The business-date control: one white pill with a day back, the date, and a
 * day forward. The date reads day-first ("Sat 14 Nov", as the booking rows
 * do); Yesterday, Today and Tomorrow get a small tag. Pressing the date opens
 * a calendar with those three as one-tap shortcuts. Away from today, a "Today"
 * button sits beside the pill.
 *
 * No motion on stepping: people page through days many times a shift, and the
 * new date should simply be there. The popover grows from the pill (HeroUI
 * sets the transform origin to the trigger).
 */
export function DateNavigator({
  selectedDate,
  onDateChange,
  todayDateStr,
  minDateStr,
  maxDateStr,
  isDisabled = false,
  className,
}: DateNavigatorProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const todayDate = React.useMemo(() => parseLocalDate(todayDateStr), [todayDateStr]);
  const offset = differenceInCalendarDays(startOfDay(selectedDate), startOfDay(todayDate));
  const isToday = offset === 0;
  const relative = RELATIVE[offset] ?? null;
  const selectedStr = format(selectedDate, "yyyy-MM-dd");
  const atMin = Boolean(minDateStr && selectedStr <= minDateStr);
  const atMax = Boolean(maxDateStr && selectedStr >= maxDateStr);
  const inBounds = (d: Date) => {
    const s = format(d, "yyyy-MM-dd");
    return (!minDateStr || s >= minDateStr) && (!maxDateStr || s <= maxDateStr);
  };
  const toCd = (value: string) => toCalendarDate(parseLocalDate(value));
  const showYear = selectedDate.getFullYear() !== todayDate.getFullYear();
  const label = format(selectedDate, showYear ? "EEE d MMM yyyy" : "EEE d MMM");

  const pick = React.useCallback(
    (date: Date) => {
      onDateChange(date);
      setCalendarOpen(false);
    },
    [onDateChange]
  );

  const shortcuts = [-1, 0, 1].map((days) => {
    const date = addDays(todayDate, days);
    return { days, date, label: RELATIVE[days], enabled: inBounds(date) };
  });

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        role="group"
        aria-label="Business date"
        aria-disabled={isDisabled || undefined}
        className="flex h-12 min-w-0 flex-1 items-center gap-1 rounded-full border border-border bg-card p-1 shadow-[0_1px_2px_rgb(20_20_19/0.04)] sm:flex-initial md:h-10"
      >
        <StepButton
          label="Previous day"
          isDisabled={isDisabled || atMin}
          onPress={() => onDateChange(subDays(selectedDate, 1))}
        >
          <ChevronLeft className="size-4" />
        </StepButton>

        <Popover isOpen={calendarOpen} onOpenChange={setCalendarOpen}>
          <Button
            variant="ghost"
            isDisabled={isDisabled}
            aria-label={`Change date, currently ${format(selectedDate, "EEEE d MMMM yyyy")}`}
            className="h-10 min-w-0 flex-1 justify-center gap-2 rounded-full px-3 text-sm font-semibold tabular-nums text-foreground sm:min-w-48 md:h-8 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary"
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{label}</span>
            {relative && (
              <span
                className={cn(
                  "inline-grid h-5 shrink-0 place-items-center rounded-full px-2 text-2xs font-semibold",
                  isToday ? "bg-[var(--accent-soft)] text-primary" : "bg-secondary text-muted-foreground"
                )}
              >
                {relative}
              </span>
            )}
          </Button>
          <Popover.Content placement="bottom" className="w-auto rounded-2xl p-0">
            <Popover.Dialog aria-label="Select business date" className="p-3 outline-none">
              {/* One-tap days, the ones the desk asks for most */}
              <div role="group" aria-label="Shortcuts" className="mb-3 grid grid-cols-3 gap-1 rounded-full bg-secondary p-1">
                {shortcuts.map((s) => {
                  const current = s.days === offset;
                  return (
                    <Button
                      key={s.days}
                      size="sm"
                      variant="ghost"
                      aria-pressed={current}
                      isDisabled={!s.enabled}
                      onPress={() => pick(s.date)}
                      className={cn(
                        "h-8 w-full min-w-0 rounded-full px-2 text-xs font-semibold",
                        current
                          ? "bg-card text-foreground shadow-[0_1px_2px_rgb(20_20_19/0.08)]"
                          : "text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                      )}
                    >
                      {s.label}
                    </Button>
                  );
                })}
              </div>
              <Calendar
                aria-label="Select business date"
                value={toCalendarDate(selectedDate)}
                minValue={minDateStr ? toCd(minDateStr) : undefined}
                maxValue={maxDateStr ? toCd(maxDateStr) : undefined}
                onChange={(date) => {
                  if (date) pick(fromCalendarDate(date as CalendarDate));
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
                  <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                </Calendar.Grid>
              </Calendar>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>

        <StepButton
          label="Next day"
          isDisabled={isDisabled || atMax}
          onPress={() => onDateChange(addDays(selectedDate, 1))}
        >
          <ChevronRight className="size-4" />
        </StepButton>
      </div>

      {!isToday && inBounds(todayDate) && (
        <Button
          variant="ghost"
          onPress={() => pick(todayDate)}
          isDisabled={isDisabled}
          className="h-12 shrink-0 rounded-full px-4 font-semibold text-primary md:h-10 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--accent-soft)]"
        >
          Today
        </Button>
      )}
    </div>
  );
}

function StepButton({
  label,
  isDisabled,
  onPress,
  children,
}: {
  label: string;
  isDisabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      isIconOnly
      variant="ghost"
      aria-label={label}
      isDisabled={isDisabled}
      onPress={onPress}
      className="size-10 min-w-10 shrink-0 rounded-full text-foreground md:size-8 md:min-w-8 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary"
    >
      {children}
    </Button>
  );
}
