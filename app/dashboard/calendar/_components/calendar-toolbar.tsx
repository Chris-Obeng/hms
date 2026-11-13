"use client";

import * as React from "react";
import { addDays, format } from "date-fns";
import {
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  Button,
  ButtonGroup,
  Calendar,
  Popover,
  SearchField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import { cn } from "@/lib/utils";
import { toCalendarDate, fromCalendarDate } from "@/lib/date-convert";
import { CALENDAR_LEGEND, VIEW_PRESETS, type ViewPreset } from "./calendar-helpers";

export interface CalendarToolbarProps {
  startDate: Date;
  days: number;
  viewPreset: ViewPreset;
  /** The window is the default one anchored on today. Hides the Today button. */
  isAtToday: boolean;
  realtimeStatus: "live" | "reconnecting";
  activeFilterCount: number;
  searchQuery: string;
  canEdit: boolean;
  canBlock: boolean;
  onNavigate(direction: -1 | 1): void;
  onToday(): void;
  onSelectDate(date: Date): void;
  onViewPresetChange(preset: ViewPreset): void;
  onSearchQueryChange(query: string): void;
  onOpenFilters(): void;
  onBlockRoom(): void;
  onNewBooking(): void;
}

const TOOLTIP_DELAY = 400;

function formatRange(startDate: Date, days: number): string {
  const end = addDays(startDate, days - 1);
  if (startDate.getFullYear() !== end.getFullYear()) {
    return `${format(startDate, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
  }
  return `${format(startDate, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

/** "Nov 6 – 19", or "Oct 30 – Nov 12" across months. */
function formatShortRange(startDate: Date, days: number): string {
  const end = addDays(startDate, days - 1);
  const sameMonth =
    startDate.getMonth() === end.getMonth() && startDate.getFullYear() === end.getFullYear();
  return `${format(startDate, "MMM d")} – ${format(end, sameMonth ? "d" : "MMM d")}`;
}

/** Status swatches, shared by the toolbar legend and the filter drawer. */
export function CalendarLegendList({ className }: { className?: string }) {
  return (
    <ul className={cn("grid gap-2", className)}>
      {CALENDAR_LEGEND.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-xs text-foreground">
          <span className="rl-legend-swatch" data-swatch={item.swatch} aria-hidden="true" />
          <span className="truncate">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function LiveStatus({ status }: { status: CalendarToolbarProps["realtimeStatus"] }) {
  const live = status === "live";
  return (
    <span
      role="status"
      className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full transition-colors duration-300",
          live ? "bg-emerald-500" : "bg-amber-400"
        )}
      />
      <span className="sr-only xl:not-sr-only">{live ? "Live updates" : "Connecting…"}</span>
    </span>
  );
}

function PeriodPicker({
  startDate,
  days,
  isAtToday,
  compact = false,
  onNavigate,
  onSelectDate,
  onToday,
}: Pick<
  CalendarToolbarProps,
  "startDate" | "days" | "isAtToday" | "onNavigate" | "onSelectDate" | "onToday"
> & { compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const range = formatRange(startDate, days);
  const shortRange = formatShortRange(startDate, days);
  const mediumRange = `${format(startDate, "MMM d")} – ${format(addDays(startDate, days - 1), "MMM d")}`;

  return (
    <ButtonGroup variant="secondary" className={cn(compact ? "min-w-0 flex-1" : "shrink-0")}>
      <Button
        isIconOnly
        aria-label="Previous period"
        onPress={() => onNavigate(-1)}
        className="text-muted-foreground max-md:size-11"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Popover isOpen={open} onOpenChange={setOpen}>
        <Button
          variant="secondary"
          aria-label={`Change start date, showing ${range}`}
          className={cn(
            "min-w-0 gap-2 font-semibold tabular-nums",
            compact ? "h-11 flex-1 px-2" : "px-3"
          )}
        >
          <ButtonGroup.Separator />
          {!compact && (
            <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
          )}
          {compact ? (
            <span className="truncate">{shortRange}</span>
          ) : (
            <>
              <span className="xl:hidden">{mediumRange}</span>
              <span className="max-xl:hidden">{range}</span>
            </>
          )}
        </Button>
        <Popover.Content placement="bottom start" className="w-auto rounded-2xl p-0">
          <Popover.Dialog aria-label="Start date" className="p-3 outline-none">
            <Calendar
              aria-label="Start date"
              value={toCalendarDate(startDate)}
              onChange={(date) => {
                if (!date) return;
                onSelectDate(fromCalendarDate(date as CalendarDate));
                setOpen(false);
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
            {!isAtToday && (
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                onPress={() => {
                  onToday();
                  setOpen(false);
                }}
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
        aria-label="Next period"
        onPress={() => onNavigate(1)}
        className="text-muted-foreground max-md:size-11"
      >
        <ButtonGroup.Separator />
        <ChevronRight className="size-4" />
      </Button>
    </ButtonGroup>
  );
}

function HorizonToggle({
  viewPreset,
  onViewPresetChange,
  className,
  fullWidth,
}: Pick<CalendarToolbarProps, "viewPreset" | "onViewPresetChange"> & {
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <ToggleButtonGroup
      aria-label="Days shown"
      selectionMode="single"
      disallowEmptySelection
      fullWidth={fullWidth}
      selectedKeys={[viewPreset]}
      onSelectionChange={(keys) => {
        const next = [...keys][0];
        const preset = VIEW_PRESETS.find((p) => p.label === next);
        if (preset) onViewPresetChange(preset.label);
      }}
      className={className}
    >
      {VIEW_PRESETS.map((preset, i) => (
        <ToggleButton key={preset.label} id={preset.label} className="max-md:h-11">
          {i > 0 && <ToggleButtonGroup.Separator />}
          {preset.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export { HorizonToggle as CalendarHorizonToggle };

function LegendPopover() {
  return (
    <Popover>
      <Button variant="ghost" aria-label="Status colors" className="gap-2 px-3 text-muted-foreground">
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="rl-legend-swatch" data-swatch="confirmed" />
          <span className="rl-legend-swatch" data-swatch="inhouse" />
        </span>
        <span className="hidden text-xs font-medium xl:inline">Legend</span>
      </Button>
      <Popover.Content placement="bottom end" className="w-auto rounded-2xl p-0">
        <Popover.Dialog aria-label="Status colors" className="w-48 p-4 outline-none">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Status colors</p>
          <CalendarLegendList />
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function FiltersButton({
  count,
  onPress,
  showLabel,
}: {
  count: number;
  onPress(): void;
  showLabel: boolean;
}) {
  return (
    <Button
      variant="secondary"
      isIconOnly={!showLabel}
      aria-label={count > 0 ? `Filters, ${count} active` : "Filters"}
      onPress={onPress}
      className={cn(
        "relative shrink-0 max-md:size-11",
        showLabel && "gap-2 px-3",
        count > 0 && "text-primary"
      )}
    >
      <SlidersHorizontal className="size-4" aria-hidden="true" />
      {showLabel && <span className="text-sm font-medium max-xl:hidden">Filters</span>}
      {count > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-4 tabular-nums text-primary-foreground",
            !showLabel && "absolute -right-1 -top-1"
          )}
        >
          {count}
        </span>
      )}
    </Button>
  );
}

export function CalendarToolbar(props: CalendarToolbarProps) {
  const { canBlock, canEdit } = props;
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const searchVisible = mobileSearchOpen || Boolean(props.searchQuery);

  return (
    <div className="shrink-0 border-b border-border bg-card">
      {/* ── Tablet and desktop (md+) ── */}
      <div className="hidden h-14 items-center gap-2 px-4 md:flex lg:px-6">
        <PeriodPicker
          startDate={props.startDate}
          days={props.days}
          isAtToday={props.isAtToday}
          onNavigate={props.onNavigate}
          onSelectDate={props.onSelectDate}
          onToday={props.onToday}
        />
        <HorizonToggle
          viewPreset={props.viewPreset}
          onViewPresetChange={props.onViewPresetChange}
          className="max-lg:hidden"
        />
        {!props.isAtToday && (
          <Button variant="ghost" onPress={props.onToday} className="shrink-0 font-semibold text-primary">
            Today
          </Button>
        )}
        <LiveStatus status={props.realtimeStatus} />

        <div className="min-w-2 flex-1" />

        <SearchField
          aria-label="Search bookings"
          value={props.searchQuery}
          onChange={props.onSearchQueryChange}
          className="w-40 min-w-0 shrink xl:w-56"
        >
          <SearchField.Group className="rounded-xl">
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Guest, room or ref" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>

        <FiltersButton count={props.activeFilterCount} onPress={props.onOpenFilters} showLabel />

        <div className="max-xl:hidden">
          <LegendPopover />
        </div>

        {canBlock && (
          <Tooltip delay={TOOLTIP_DELAY}>
            <Button
              variant="secondary"
              isIconOnly
              aria-label="Block dates"
              onPress={props.onBlockRoom}
              className="shrink-0"
            >
              <CalendarOff className="size-4" aria-hidden="true" />
            </Button>
            <Tooltip.Content>Block dates</Tooltip.Content>
          </Tooltip>
        )}

        {canEdit && (
          <Button
            variant="primary"
            aria-label="New booking"
            onPress={props.onNewBooking}
            className="shrink-0 gap-2 px-3 font-semibold max-lg:size-10 max-lg:min-w-10 max-lg:px-0 lg:px-4"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="max-lg:hidden">New booking</span>
          </Button>
        )}
      </div>

      {/* ── Mobile (<768px) ── */}
      <div className="md:hidden">
        <div className="flex h-16 items-center gap-1 px-3">
          <PeriodPicker
            compact
            startDate={props.startDate}
            days={props.days}
            isAtToday={props.isAtToday}
            onNavigate={props.onNavigate}
            onSelectDate={props.onSelectDate}
            onToday={props.onToday}
          />
          <Button
            variant={searchVisible ? "secondary" : "ghost"}
            isIconOnly
            aria-label={searchVisible ? "Close search" : "Search bookings"}
            aria-expanded={searchVisible}
            onPress={() => {
              if (searchVisible) {
                setMobileSearchOpen(false);
                props.onSearchQueryChange("");
              } else {
                setMobileSearchOpen(true);
              }
            }}
            className={cn("size-11 shrink-0", searchVisible ? "text-primary" : "text-muted-foreground")}
          >
            <Search className="size-4" />
          </Button>
          <FiltersButton count={props.activeFilterCount} onPress={props.onOpenFilters} showLabel={false} />
          {canEdit && (
            <Button
              variant="primary"
              isIconOnly
              aria-label="New booking"
              onPress={props.onNewBooking}
              className="size-11 shrink-0"
            >
              <Plus className="size-4" />
            </Button>
          )}
        </div>

        {searchVisible && (
          <div className="border-t border-border/50 px-3 py-2">
            <SearchField
              aria-label="Search bookings"
              autoFocus={mobileSearchOpen && !props.searchQuery}
              value={props.searchQuery}
              onChange={props.onSearchQueryChange}
              fullWidth
            >
              <SearchField.Group className="h-11 rounded-xl">
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Guest, room or reference" className="text-base" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>
        )}
      </div>
    </div>
  );
}
