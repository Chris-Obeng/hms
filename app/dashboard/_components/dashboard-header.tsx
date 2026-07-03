"use client";

import * as React from "react";
import { format, addDays, subDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DashboardHeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

export function DashboardHeader({
  selectedDate,
  onDateChange,
}: DashboardHeaderProps) {
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
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-page-title text-foreground">
          Dashboard
        </h1>
        <p className="text-body text-muted-foreground mt-1">{dateStr}</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Date navigation — size-10 (40px) for tablet tap targets */}
        <div className="flex items-center rounded-xl border border-border/40 bg-background p-0.5 shadow-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-10 rounded-lg hover:bg-accent"
            onClick={goToPrevDay}
            aria-label="Previous day"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-10 px-3 text-sm font-semibold rounded-lg hover:bg-accent",
                    isTodayDate && "text-primary",
                  )}
                  aria-label="Open date picker"
                />
              }
            >
              <CalendarDays className="size-3.5 mr-1.5" />
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
            className="size-10 rounded-lg hover:bg-accent"
            onClick={goToNextDay}
            aria-label="Next day"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
