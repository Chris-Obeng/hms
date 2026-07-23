"use client";

import * as React from "react";
import { format, addDays, subDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Calendar, Popover } from "@heroui/react";
import { CalendarDate } from "@internationalized/date";

function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function fromCalendarDate(cv: CalendarDate): Date {
  return new Date(cv.year, cv.month - 1, cv.day);
}

interface DateCardProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

export function DateCard({ selectedDate, onDateChange }: DateCardProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const isTodayDate = isToday(selectedDate);
  const calendarValue = toCalendarDate(selectedDate);

  const goToToday = React.useCallback(() => {
    onDateChange(new Date());
    setCalendarOpen(false);
  }, [onDateChange]);

  return (
    <div className="rounded-xl border border-border/50 bg-card p-5 shadow-xs transition-all hover:shadow-sm">
      <div className="flex flex-col items-start justify-between">
        <span className="text-sm font-semibold text-muted-foreground tracking-wide">
          {format(selectedDate, "EEEE")}
        </span>
        
        <div className="my-1">
          <span className="text-6xl font-bold tracking-tight text-foreground font-mono">
            {format(selectedDate, "d")}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mt-1">
          <Popover isOpen={calendarOpen} onOpenChange={setCalendarOpen}>
            <Popover.Trigger className="flex items-center gap-1.5 text-sm font-semibold text-foreground/80 hover:text-primary transition-colors cursor-pointer outline-none">
              <span>{format(selectedDate, "MMMM")}</span>
              <CalendarIcon className="size-3.5 text-muted-foreground/70" />
            </Popover.Trigger>
            <Popover.Content placement="bottom start" className="p-0 w-auto border-border/60">
              <Popover.Dialog className="outline-none p-3">
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
                  <Calendar.Header className="pb-2">
                    <Calendar.NavButton slot="previous" />
                    <Calendar.Heading />
                    <Calendar.NavButton slot="next" />
                  </Calendar.Header>
                  <Calendar.Grid>
                    <Calendar.GridHeader>
                      {(day) => (
                        <Calendar.HeaderCell>{day}</Calendar.HeaderCell>
                      )}
                    </Calendar.GridHeader>
                    <Calendar.GridBody>
                      {(date) => <Calendar.Cell date={date} />}
                    </Calendar.GridBody>
                  </Calendar.Grid>
                </Calendar>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        </div>
      </div>
    </div>
  );
}
