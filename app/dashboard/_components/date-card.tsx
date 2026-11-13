"use client";

import * as React from "react";
import { addDays, differenceInCalendarDays, format, startOfDay, subDays } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, ButtonGroup, Calendar, Popover } from "@heroui/react";
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
 * One business-date control for every viewport: step a day back or forward,
 * or open the calendar from the centre segment. A "Today" shortcut appears
 * only once the operator has moved away from the property's current day.
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
  const isToday = startOfDay(selectedDate).getTime() === startOfDay(todayDate).getTime();
  const relative = relativeLabel(selectedDate, todayDate);
  const selectedStr = format(selectedDate, "yyyy-MM-dd");
  const atMin = Boolean(minDateStr && selectedStr <= minDateStr);
  const atMax = Boolean(maxDateStr && selectedStr >= maxDateStr);
  const toCd = (value: string) => toCalendarDate(parseLocalDate(value));

  const goToToday = React.useCallback(() => {
    onDateChange(todayDate);
    setCalendarOpen(false);
  }, [onDateChange, todayDate]);

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <ButtonGroup variant="secondary" className="min-w-0 flex-1 sm:flex-initial">
        <Button
          isIconOnly
          aria-label="Previous day"
          isDisabled={isDisabled || atMin}
          onPress={() => onDateChange(subDays(selectedDate, 1))}
          className="text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <Popover isOpen={calendarOpen} onOpenChange={setCalendarOpen}>
          <Button
            variant="secondary"
            isDisabled={isDisabled}
            aria-label={`Change date, currently ${format(selectedDate, "EEEE, MMMM d, yyyy")}`}
            className="min-w-0 flex-1 gap-2 px-3 font-semibold tabular-nums sm:min-w-48"
          >
            <ButtonGroup.Separator />
            <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">
              {relative ? (
                <>
                  {relative}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {format(selectedDate, "EEE, MMM d")}
                  </span>
                </>
              ) : (
                format(selectedDate, "EEE, MMM d, yyyy")
              )}
            </span>
          </Button>
          <Popover.Content placement="bottom" className="w-auto rounded-2xl p-0">
            <Popover.Dialog aria-label="Select business date" className="p-3 outline-none">
              <Calendar
                aria-label="Select business date"
                value={toCalendarDate(selectedDate)}
                minValue={minDateStr ? toCd(minDateStr) : undefined}
                maxValue={maxDateStr ? toCd(maxDateStr) : undefined}
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
                  <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                </Calendar.Grid>
              </Calendar>
              {!isToday && (
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onPress={goToToday}
                  className="mt-2 font-semibold text-primary"
                >
                  Jump to today
                </Button>
              )}
            </Popover.Dialog>
          </Popover.Content>
        </Popover>

        <Button
          isIconOnly
          aria-label="Next day"
          isDisabled={isDisabled || atMax}
          onPress={() => onDateChange(addDays(selectedDate, 1))}
          className="text-muted-foreground"
        >
          <ButtonGroup.Separator />
          <ChevronRight className="size-4" />
        </Button>
      </ButtonGroup>

      {!isToday && (
        <Button variant="ghost" onPress={goToToday} isDisabled={isDisabled} className="shrink-0 font-semibold text-primary">
          Today
        </Button>
      )}
    </div>
  );
}
