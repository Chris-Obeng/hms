"use client";

import { useState } from "react";
import { Button, Calendar, Popover, ToggleButton } from "@heroui/react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { CalendarDate } from "@internationalized/date";
import { formatDate } from "@/lib/format";
import { reportPeriodLabel, shiftReportDate, validateReportRange } from "@/lib/report-dates";

export interface DateRange { startDate: string; endDate: string }
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
function normalize(range: DateRange, today: string): DateRange {
  let { startDate, endDate } = range;
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  if (endDate > today) endDate = today;
  if (startDate > endDate) startDate = endDate;
  if (daysBetween(startDate, endDate) > 366) startDate = shiftReportDate(endDate, -365);
  return { startDate, endDate };
}

/**
 * The header date-range chip from the pen design file: one quiet trigger that
 * opens the presets and calendar pair. The chip sits alone top-right — the
 * only apply action is choosing dates.
 */
export function RangeControl({ range, today, onChange }: {
  range: DateRange;
  today: string;
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState<"range" | "start" | "end" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function commit(next: DateRange) {
    const normalized = normalize(next, today);
    const validation = validateReportRange(normalized, today);
    setError(validation);
    if (!validation) onChange(normalized.startDate, normalized.endDate);
  }

  const activePreset = PRESETS.find((days) =>
    range.startDate === shiftReportDate(today, 1 - days) && range.endDate === today,
  );

  return <div className="flex flex-col items-start gap-2" role="group" aria-label="Report date range">
    <Popover isOpen={open !== null} onOpenChange={(next) => setOpen(next ? "range" : null)}>
      <Button variant="outline" aria-label={`Date range: ${reportPeriodLabel(range)}`}
        className="h-10 gap-2 border-border/70 rounded-[10px] px-4 text-[13px] font-medium tabular-nums">
        <CalendarDays size={16} aria-hidden="true" className="text-muted-foreground" />
        {reportPeriodLabel(range)}
        <ChevronDown size={16} aria-hidden="true" className="text-muted-foreground/70" />
      </Button>
      <Popover.Content placement="bottom end" className="w-auto border-border/60 p-0">
        <Popover.Dialog className="flex flex-col gap-3 p-3 outline-none">
          <p className={error ? "text-[13px] text-destructive" : "sr-only"} role={error ? "alert" : undefined}>
            {error ?? "Inclusive dates, up to 366 days."}
          </p>
          <div className="inline-flex items-center rounded-lg bg-muted p-1" role="group" aria-label="Quick date ranges">
            {PRESETS.map((days) => <ToggleButton key={days} variant="ghost" size="sm"
              className="h-8 min-w-0 rounded-[7px] px-3 text-[13px] font-medium text-muted-foreground data-[selected=true]:bg-card data-[selected=true]:text-foreground data-[selected=true]:shadow-sm"
              isSelected={activePreset === days}
              onChange={() => { setOpen(null); commit({ startDate: shiftReportDate(today, 1 - days), endDate: today }); }}>
              {days} days
            </ToggleButton>)}
          </div>
          <div className="flex items-center gap-2">
            <DateField label="Start date" value={range.startDate} max={range.endDate > today ? today : range.endDate}
              isOpen={open === "start"} onOpenChange={(next) => setOpen(next ? "start" : null)}
              onSelect={(value) => { commit({ startDate: value, endDate: range.endDate }); setOpen(null); }} />
            <span className="px-1 text-caption text-muted-foreground" aria-hidden="true">–</span>
            <DateField label="End date" value={range.endDate} min={range.startDate} max={today}
              isOpen={open === "end"} onOpenChange={(next) => setOpen(next ? "end" : null)}
              onSelect={(value) => { commit({ startDate: range.startDate, endDate: value }); setOpen(null); }} />
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
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
    <Button variant="outline" size="sm" className="h-8 gap-2 border-border/70 px-3 text-[13px] font-medium tabular-nums"
      aria-label={`${label}: ${formatDate(value, "MMM d, yyyy")}`}>
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
