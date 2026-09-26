"use client";

import * as React from "react";
import { addDays, format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { Button, ButtonGroup, Calendar, Popover, SearchField, Select, ListBox, Label, Tooltip } from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import { cn } from "@/lib/utils";
import { toCalendarDate, fromCalendarDate } from "@/lib/date-convert";
import { CALENDAR_LEGEND, VIEW_PRESETS, type ViewPreset } from "./calendar-helpers";

export interface CalendarToolbarProps {
  startDate: Date;
  days: number;
  viewPreset: ViewPreset;
  realtimeStatus: "live" | "reconnecting";
  activeFilterCount: number;
  searchQuery: string;
  canBlock: boolean;
  onNavigate(direction: -1 | 1): void;
  onToday(): void;
  onSelectDate(date: Date): void;
  onViewPresetChange(preset: ViewPreset): void;
  onSearchQueryChange(query: string): void;
  onOpenFilters(): void;
  onBlockRoom(): void;
}

const NAV_TOOLTIP_DELAY = 350;

function NavButtonGroup({ onNavigate, onToday }: Pick<CalendarToolbarProps, "onNavigate" | "onToday">) {
  return (
    <ButtonGroup variant="outline" size="sm">
      <Tooltip delay={NAV_TOOLTIP_DELAY}>
        <Tooltip.Trigger>
          <Button isIconOnly aria-label="Previous period" onPress={() => onNavigate(-1)} className="tap-target">
            <ChevronLeft className="size-3.5" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>Previous period (Shift+←)</Tooltip.Content>
      </Tooltip>
      <Tooltip delay={NAV_TOOLTIP_DELAY}>
        <Tooltip.Trigger>
          <Button aria-label="Jump to today" onPress={onToday} className="tap-target h-8 px-2.5 text-xs font-semibold tabular-nums">
            Today
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>Jump to today (T)</Tooltip.Content>
      </Tooltip>
      <Tooltip delay={NAV_TOOLTIP_DELAY}>
        <Tooltip.Trigger>
          <Button isIconOnly aria-label="Next period" onPress={() => onNavigate(1)} className="tap-target">
            <ChevronRight className="size-3.5" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>Next period (Shift+→)</Tooltip.Content>
      </Tooltip>
    </ButtonGroup>
  );
}

function RangePicker({ startDate, days, onSelectDate }: Pick<CalendarToolbarProps, "startDate" | "days" | "onSelectDate">) {
  const [open, setOpen] = React.useState(false);
  const rangeLabel = `${format(startDate, "MMM d")} – ${format(addDays(startDate, days - 1), "MMM d")}`;

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button variant="outline" size="sm" aria-label="Pick start date" className="h-8 min-w-[132px] gap-1.5 px-3 text-xs font-semibold tabular-nums">
          <CalendarDays className="size-3.5 opacity-60" />
          {rangeLabel}
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="bottom start" className="p-0 w-auto border-border/60">
        <Popover.Dialog className="bg-card p-3 text-foreground outline-none">
          <Calendar
            aria-label="Start date"
            value={toCalendarDate(startDate)}
            onChange={(date) => {
              if (date) {
                onSelectDate(fromCalendarDate(date as CalendarDate));
                setOpen(false);
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
          <div className="mt-1 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                onSelectDate(new Date());
                setOpen(false);
              }}
              className="text-xs text-primary"
            >
              Jump to today
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function ViewPresetSelect({ viewPreset, onViewPresetChange }: Pick<CalendarToolbarProps, "viewPreset" | "onViewPresetChange">) {
  return (
    <Select
      aria-label="Visible days"
      value={viewPreset}
      onChange={(value) => {
        if (value != null) onViewPresetChange(String(value) as ViewPreset);
      }}
      className="w-[104px]"
      placeholder="View"
    >
      <Select.Trigger className="h-8 min-h-8 rounded-lg border-border/60 bg-background px-2.5 text-xs shadow-none">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="min-w-(--trigger-width) rounded-lg border-border/70 p-1">
        <ListBox>
          {VIEW_PRESETS.map((preset) => (
            <ListBox.Item key={preset.label} id={preset.label} textValue={`${preset.label} ${preset.days} days`} className="rounded-md px-2.5 py-1.5 text-xs">
              <span className="flex items-center justify-between gap-3">
                <Label>{preset.label}</Label>
                <ListBox.ItemIndicator />
              </span>
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function LegendPopover() {
  return (
    <Popover>
      <Popover.Trigger>
        <Button variant="ghost" size="sm" aria-label="Legend" className="h-8 gap-2 px-2.5 text-xs text-muted-foreground">
          <span className="flex gap-1" aria-hidden>
            <span className="size-2 rounded-sm" style={{ background: "#16A7D8" }} />
            <span className="size-2 rounded-sm" style={{ background: "#2FAA67" }} />
            <span className="size-2 rounded-sm" style={{ background: "#16A34A" }} />
          </span>
          Legend
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="p-0 w-auto border-border/60">
        <Popover.Dialog className="w-52 bg-card p-3 text-foreground outline-none">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status colors</p>
          <ul className="space-y-1.5">
            {CALENDAR_LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-xs text-foreground">
                <span
                  className={cn("size-2.5 shrink-0 rounded-sm", item.type === "block" && "rounded-[3px]")}
                  style={
                    item.type === "block"
                      ? { background: "repeating-linear-gradient(135deg, rgba(100,116,139,0.25) 0 3px, rgba(100,116,139,0.5) 3px 6px)" }
                      : { background: item.color }
                  }
                />
                {item.label}
              </li>
            ))}
          </ul>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function ToolbarSearch({ searchQuery, onSearchQueryChange }: Pick<CalendarToolbarProps, "searchQuery" | "onSearchQueryChange">) {
  return (
    <SearchField
      aria-label="Search bookings"
      value={searchQuery}
      onChange={onSearchQueryChange}
      className="w-44"
    >
      <SearchField.Group className="h-8 rounded-lg border-border/60 bg-background shadow-none">
        <SearchField.SearchIcon className="ml-2.5 size-3.5" />
        <SearchField.Input className="px-2 text-xs" placeholder="Guest or reference…" />
        <SearchField.ClearButton>
          <X className="size-3.5" />
        </SearchField.ClearButton>
      </SearchField.Group>
    </SearchField>
  );
}

function FiltersButton({ activeFilterCount, onOpenFilters }: Pick<CalendarToolbarProps, "activeFilterCount" | "onOpenFilters">) {
  return (
    <Tooltip delay={NAV_TOOLTIP_DELAY}>
      <Tooltip.Trigger>
        <Button
          variant={activeFilterCount > 0 ? "secondary" : "outline"}
          size="sm"
          isIconOnly
          aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
          onPress={onOpenFilters}
          className={cn("tap-target relative", activeFilterCount > 0 && "border-primary/40 text-primary")}
        >
          <SlidersHorizontal className="size-3.5" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold leading-none text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>Filters</Tooltip.Content>
    </Tooltip>
  );
}

function BlockRoomButton({ onBlockRoom }: Pick<CalendarToolbarProps, "onBlockRoom">) {
  return (
    <Tooltip delay={NAV_TOOLTIP_DELAY}>
      <Tooltip.Trigger>
        <Button variant="outline" size="sm" isIconOnly aria-label="Block room" onPress={onBlockRoom} className="tap-target">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="size-3.5" aria-hidden>
            <rect x="1" y="1" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <line x1="3.5" y1="7.5" x2="11.5" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>Block room</Tooltip.Content>
    </Tooltip>
  );
}

export function CalendarToolbar(props: CalendarToolbarProps) {
  const { realtimeStatus, canBlock } = props;

  return (
    <>
      {/* ── Desktop ── */}
      <div className="hidden h-12 items-center gap-1.5 border-b border-border bg-background px-3 md:flex">
        <NavButtonGroup onNavigate={props.onNavigate} onToday={props.onToday} />
        <RangePicker startDate={props.startDate} days={props.days} onSelectDate={props.onSelectDate} />
        <ViewPresetSelect viewPreset={props.viewPreset} onViewPresetChange={props.onViewPresetChange} />

        <div className="flex-1" />

        <LegendPopover />
        <ToolbarSearch searchQuery={props.searchQuery} onSearchQueryChange={props.onSearchQueryChange} />
        <FiltersButton activeFilterCount={props.activeFilterCount} onOpenFilters={props.onOpenFilters} />
        {canBlock && <BlockRoomButton onBlockRoom={props.onBlockRoom} />}
      </div>

      {/* ── Mobile ── */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background px-3 md:hidden">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-foreground">
            Calendar
            <span
              className={cn("size-1.5 rounded-full", realtimeStatus === "live" ? "bg-emerald-500" : "bg-amber-400")}
              aria-label={realtimeStatus === "live" ? "Live updates connected" : "Live updates reconnecting"}
            />
          </p>
          <p className="text-[10px] leading-tight text-muted-foreground tabular-nums">
            {format(props.startDate, "MMM d")} – {format(addDays(props.startDate, props.days - 1), "MMM d")}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <NavButtonGroup onNavigate={props.onNavigate} onToday={props.onToday} />
          <FiltersButton activeFilterCount={props.activeFilterCount} onOpenFilters={props.onOpenFilters} />
          {canBlock && <BlockRoomButton onBlockRoom={props.onBlockRoom} />}
        </div>
      </div>
    </>
  );
}
