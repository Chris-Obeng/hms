"use client";

import { Button, Calendar, Popover } from "@heroui/react";
import { CalendarDays } from "lucide-react";
import { CalendarDate } from "@internationalized/date";
import { formatDate } from "@/lib/format";

function toCalendarDate(value: string): CalendarDate {
  const [year, month, day] = value.split("-").map(Number);
  return new CalendarDate(year, month, day);
}

function fromCalendarDate(value: CalendarDate): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function PaymentDateField({ label, value, min, max, onSelect }: {
  label: string;
  value: string;
  min?: string;
  max: string;
  onSelect: (value: string) => void;
}) {
  return <Popover>
    <Button variant="outline" size="sm" className="payments-date-trigger w-full justify-between sm:w-auto" aria-label={`${label}: ${formatDate(value, "MMM d, yyyy")}`}>
      <span className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{label}</span><span>{formatDate(value, "MMM d, yyyy")}</span></span>
      <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
    </Button>
    <Popover.Content placement="bottom start" className="w-auto border-border/60 p-0">
      <Popover.Dialog className="p-3 outline-none">
        <Calendar aria-label={`Select ${label.toLowerCase()} date`} value={toCalendarDate(value)} minValue={min ? toCalendarDate(min) : undefined} maxValue={toCalendarDate(max)} onChange={(date) => { if (date) onSelect(fromCalendarDate(date as CalendarDate)); }}>
          <Calendar.Header>
            <Calendar.NavButton slot="previous" />
            <Calendar.Heading />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
            <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
          </Calendar.Grid>
        </Calendar>
      </Popover.Dialog>
    </Popover.Content>
  </Popover>;
}
