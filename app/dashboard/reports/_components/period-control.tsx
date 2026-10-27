"use client";

import { useState } from "react";
import { Button, Calendar, Popover, ToggleButton } from "@heroui/react";
import { CalendarDays } from "lucide-react";
import { CalendarDate } from "@internationalized/date";
import { formatDate } from "@/lib/format";
import { shiftReportDate, validateReportRange, type ReportRange } from "./report-utils";

const PRESETS = [7, 30, 90] as const;
const DAY_MS = 86_400_000;

function toCalendarDate(value: string): CalendarDate {
  const [year, month, day] = value.split("-").map(Number);
  return new CalendarDate(year, month, day);
}

function fromCalendarDate(value: CalendarDate): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function daysBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / DAY_MS + 1;
}

/** Inclusive range guard: clamping keeps every selection exportable and readable. */
function normalize(range: ReportRange, today: string): ReportRange {
  let { startDate, endDate } = range;
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  if (endDate > today) endDate = today;
  if (startDate > endDate) startDate = endDate;
  if (daysBetween(startDate, endDate) > 366) {
    startDate = shiftReportDate(endDate, -365);
  }
  return { startDate, endDate };
}

export function PeriodControl({ startDate, endDate, today, onChange }: {
  startDate: string;
  endDate: string;
  today: string;
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function commit(range: ReportRange) {
    const next = normalize(range, today);
    const validation = validateReportRange(next, today);
    setError(validation);
    if (!validation) onChange(next.startDate, next.endDate);
  }

  const activePreset = PRESETS.find((days) =>
    startDate === shiftReportDate(today, 1 - days) && endDate === today,
  );

  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Report date range">
    <p className={error ? "w-full text-[13px] text-destructive" : "sr-only"} role={error ? "alert" : undefined}>
      {error ?? "Inclusive dates, up to 366 days."}
    </p>
    <div className="inline-flex items-center rounded-lg bg-muted p-0.5" role="group" aria-label="Quick date ranges">
      {PRESETS.map((days) => <ToggleButton key={days} variant="ghost" size="sm"
        className="h-8 min-w-0 rounded-[7px] px-2.5 text-[13px] font-medium text-muted-foreground transition-[background-color,box-shadow,color] duration-150 data-[selected=true]:bg-card data-[selected=true]:text-foreground data-[selected=true]:shadow-sm"
        isSelected={activePreset === days}
        onChange={() => { setOpen(null); commit({ startDate: shiftReportDate(today, 1 - days), endDate: today }); }}>
        {days} days
      </ToggleButton>)}
    </div>

    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <DateField label="Start date" value={startDate} max={endDate > today ? today : endDate}
        isOpen={open === "start"} onOpenChange={(next) => setOpen(next ? "start" : null)}
        onSelect={(value) => { commit({ startDate: value, endDate }); setOpen(null); }} />
      <span className="px-0.5 text-caption text-muted-foreground" aria-hidden="true">–</span>
      <DateField label="End date" value={endDate} min={startDate} max={today}
        isOpen={open === "end"} onOpenChange={(next) => setOpen(next ? "end" : null)}
        onSelect={(value) => { commit({ startDate, endDate: value }); setOpen(null); }} />
    </div>
  </div>;
}

function DateField({ label, value, min, max, isOpen, onOpenChange, onSelect }: {
  label: string;
  value: string;
  min?: string;
  max: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
}) {
  return <Popover isOpen={isOpen} onOpenChange={onOpenChange}>
    {/* HeroUI makes its direct child the pressable trigger (as its own Popover example does).
     * Wrapping a Button in Popover.Trigger would nest two pressables. */}
    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border/70 px-2.5 text-[13px] font-medium tabular-nums" aria-label={`${label}: ${formatDate(value, "MMM d, yyyy")}`}>
      <CalendarDays size={15} aria-hidden="true" />
      {formatDate(value, "MMM d, yyyy")}
    </Button>
    <Popover.Content placement="bottom start" className="w-auto border-border/60 p-0">
      <Popover.Dialog className="p-3 outline-none">
        <p className="mb-2 text-label text-muted-foreground">{label}</p>
        <Calendar aria-label={`Select ${label.toLowerCase()}`} value={toCalendarDate(value)}
          minValue={min ? toCalendarDate(min) : undefined} maxValue={toCalendarDate(max)}
          onChange={(date) => { if (date) onSelect(fromCalendarDate(date as CalendarDate)); }}>
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
  </Popover>;
}
