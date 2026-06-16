"use client";

import * as React from "react";
import { format, addDays, subDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DashboardHeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

export function DashboardHeader({ selectedDate, onDateChange }: DashboardHeaderProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  const dateStr = format(selectedDate, "EEEE, MMMM d, yyyy");
  const isTodayDate = isToday(selectedDate);

  const goToPrevDay = React.useCallback(() => {
    onDateChange(subDays(selectedDate, 1));
  }, [selectedDate, onDateChange]);

  const goToNextDay = React.useCallback(() => {
    onDateChange(addDays(selectedDate, 1));
  }, [selectedDate, onDateChange]);

  const goToToday = React.useCallback(() => {
    onDateChange(new Date());
  }, [onDateChange]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {dateStr}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Date navigation */}
        <div className="flex items-center rounded-lg border border-border/60 bg-background p-0.5 shadow-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 rounded-md"
            onClick={goToPrevDay}
          >
            <ChevronLeft className="size-3.5" />
          </Button>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 px-2.5 text-xs font-medium rounded-md",
                    isTodayDate && "text-primary"
                  )}
                />
              }
            >
              <CalendarDays className="size-3 mr-1" />
              {isTodayDate ? "Today" : format(selectedDate, "MMM d")}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    onDateChange(date);
                    setCalendarOpen(false);
                  }
                }}
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 rounded-md"
            onClick={goToNextDay}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
