"use client";

import * as React from "react";
import { addDays, format } from "date-fns";
import {
  CalendarDays,
  CalendarOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button, Calendar, Popover, Tooltip } from "@heroui/react";
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
  canEdit?: boolean;
  canBlock: boolean;
  onNavigate(direction: -1 | 1): void;
  onToday(): void;
  onSelectDate(date: Date): void;
  onViewPresetChange(preset: ViewPreset): void;
  onSearchQueryChange(query: string): void;
  onOpenFilters(): void;
  onBlockRoom(): void;
  onNewBooking?(): void;
}

const NAV_TOOLTIP_DELAY = 350;

function NavStepper({
  onNavigate,
  onToday,
  compact = false,
}: Pick<CalendarToolbarProps, "onNavigate" | "onToday"> & { compact?: boolean }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-border/70 bg-background p-1">
      <Tooltip delay={NAV_TOOLTIP_DELAY}>
        <Button
          variant="ghost"
          isIconOnly
          size="sm"
          aria-label="Previous period"
          onPress={() => onNavigate(-1)}
          className={cn(
            "ui-press rounded-[8px] text-muted-foreground shadow-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground",
            compact ? "size-10 min-w-10" : "size-8 min-w-8"
          )}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Tooltip.Content>Previous period (Shift+←)</Tooltip.Content>
      </Tooltip>

      <div
        className={cn("h-4 w-px bg-border/60", compact && "hidden min-[390px]:block")}
        aria-hidden="true"
      />

      <Tooltip delay={NAV_TOOLTIP_DELAY}>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Jump to today"
          onPress={onToday}
          className={cn(
            "ui-press rounded-[8px] px-3 text-xs font-semibold text-foreground shadow-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted",
            compact ? "hidden h-10 min-[390px]:inline-flex" : "h-8"
          )}
        >
          Today
        </Button>
        <Tooltip.Content>Jump to today (T)</Tooltip.Content>
      </Tooltip>

      <div className="h-4 w-px bg-border/60" aria-hidden="true" />

      <Tooltip delay={NAV_TOOLTIP_DELAY}>
        <Button
          variant="ghost"
          isIconOnly
          size="sm"
          aria-label="Next period"
          onPress={() => onNavigate(1)}
          className={cn(
            "ui-press rounded-[8px] text-muted-foreground shadow-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground",
            compact ? "size-10 min-w-10" : "size-8 min-w-8"
          )}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Tooltip.Content>Next period (Shift+→)</Tooltip.Content>
      </Tooltip>
    </div>
  );
}

function RangePicker({
  startDate,
  days,
  realtimeStatus,
  onSelectDate,
  onToday,
  mobile = false,
}: Pick<
  CalendarToolbarProps,
  "startDate" | "days" | "realtimeStatus" | "onSelectDate" | "onToday"
> & { mobile?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const rangeLabel = `${format(startDate, "MMM d")} – ${format(addDays(startDate, days - 1), "MMM d")}`;

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      {mobile ? (
        <Button
          variant="ghost"
          aria-label="Pick start date"
          className="ui-press inline-flex h-11 min-w-0 shrink cursor-pointer items-center gap-2 rounded-xl bg-transparent px-2 text-left shadow-none active:bg-muted/60"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-sm font-semibold leading-tight text-foreground">
              <span className="truncate tabular-nums">{rangeLabel}</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </span>
            <span className="mt-1 flex items-center gap-2 text-[11px] leading-tight text-muted-foreground">
              <span
                className={cn(
                  "size-2 rounded-full",
                  realtimeStatus === "live" ? "bg-emerald-500" : "bg-amber-400"
                )}
                aria-hidden="true"
              />
              {days} days
            </span>
          </span>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Pick start date"
          className="ui-press inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-background px-3 text-xs font-semibold tabular-nums text-foreground shadow-none lg:px-3 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/50"
        >
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
          <span>{rangeLabel}</span>
          <span
            className={cn(
              "size-2 rounded-full",
              realtimeStatus === "live" ? "bg-emerald-500" : "bg-amber-400"
            )}
            title={realtimeStatus === "live" ? "Live updates connected" : "Reconnecting…"}
          />
        </Button>
      )}
      <Popover.Content
        placement="bottom start"
        className="w-auto rounded-2xl border border-border/60 bg-popover p-0 shadow-xl"
      >
        <Popover.Dialog aria-label="Pick start date" className="p-3 text-foreground outline-none">
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
              <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
          </Calendar>
          <div className="mt-2 flex justify-end border-t border-border/50 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                onToday();
                setOpen(false);
              }}
              className="h-9 rounded-lg px-3 text-xs font-semibold text-primary"
            >
              Jump to today
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function ViewPresetPills({
  viewPreset,
  onViewPresetChange,
}: Pick<CalendarToolbarProps, "viewPreset" | "onViewPresetChange">) {
  return (
    <div
      role="group"
      aria-label="Visible horizon"
      className="inline-flex shrink-0 items-center rounded-xl border border-border/60 bg-muted/35 p-1"
    >
      {VIEW_PRESETS.map((preset) => {
        const active = viewPreset === preset.label;
        return (
          <button
            key={preset.label}
            type="button"
            aria-pressed={active}
            onClick={() => onViewPresetChange(preset.label)}
            className={cn(
              "ui-press h-8 cursor-pointer rounded-[8px] px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-3",
              active
                ? "bg-card font-semibold text-foreground shadow-2xs ring-1 ring-border/60"
                : "text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            )}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

function LegendPopover() {
  return (
    <Popover>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Status color legend"
        className="ui-press inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none lg:px-3 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="size-2 rounded-full" style={{ background: "var(--cal-confirmed)" }} />
          <span className="size-2 rounded-full" style={{ background: "var(--cal-inhouse)" }} />
          <span className="size-2 rounded-full" style={{ background: "var(--cal-pending)" }} />
        </span>
        <span className="hidden xl:inline">Legend</span>
      </Button>
      <Popover.Content
        placement="bottom end"
        className="w-auto rounded-2xl border border-border/60 bg-popover p-0 shadow-xl"
      >
        <Popover.Dialog aria-label="Status color legend" className="w-48 p-3 text-foreground outline-none">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Status colors</p>
          <ul className="space-y-2">
            {CALENDAR_LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-3 text-xs text-foreground">
                <span
                  className="size-3 shrink-0 rounded-sm"
                  style={
                    item.type === "block"
                      ? {
                          background:
                            "repeating-linear-gradient(135deg, color-mix(in oklch, var(--cal-closure) 25%, transparent) 0 3px, color-mix(in oklch, var(--cal-closure) 50%, transparent) 3px 6px)",
                        }
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

export function CalendarToolbar(props: CalendarToolbarProps) {
  const { canBlock, canEdit = true } = props;
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const mobileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="shrink-0 border-b border-border bg-card">
      {/* ── Desktop & Tablet (md+) ── */}
      <div className="hidden h-13 items-center gap-2 px-3 md:flex lg:gap-2 lg:px-5">
        <NavStepper onNavigate={props.onNavigate} onToday={props.onToday} />
        <RangePicker
          startDate={props.startDate}
          days={props.days}
          realtimeStatus={props.realtimeStatus}
          onSelectDate={props.onSelectDate}
          onToday={props.onToday}
        />
        <ViewPresetPills
          viewPreset={props.viewPreset}
          onViewPresetChange={props.onViewPresetChange}
        />

        <div className="min-w-1 flex-1" />

        <LegendPopover />

        <div className="relative min-w-0 shrink">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={props.searchQuery}
            onChange={(e) => props.onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && props.searchQuery) {
                e.preventDefault();
                props.onSearchQueryChange("");
              }
            }}
            placeholder="Guest, room, ref…"
            aria-label="Search bookings"
            className="h-9 w-28 rounded-xl border border-border/70 bg-background pl-8 pr-7 text-xs text-foreground outline-none transition-[border-color] duration-150 placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 lg:w-52"
          />
          {props.searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => props.onSearchQueryChange("")}
              className="ui-press absolute right-1 top-1/2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <Tooltip delay={NAV_TOOLTIP_DELAY}>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Filters${props.activeFilterCount > 0 ? ` (${props.activeFilterCount} active)` : ""}`}
            onPress={props.onOpenFilters}
            className={cn(
              "ui-press relative inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-medium shadow-none lg:px-3",
              props.activeFilterCount > 0
                ? "border-primary/40 bg-primary/[0.08] font-semibold text-primary"
                : "border-border/70 bg-background text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/50"
            )}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            <span className="hidden xl:inline">Filters</span>
            {props.activeFilterCount > 0 && (
              <span className="inline-flex min-w-4 justify-center rounded-md bg-primary px-1 py-1 font-mono text-[11px] font-semibold leading-none text-primary-foreground">
                {props.activeFilterCount}
              </span>
            )}
          </Button>
          <Tooltip.Content>Filters</Tooltip.Content>
        </Tooltip>

        {canBlock && (
          <Tooltip delay={NAV_TOOLTIP_DELAY}>
            <Button
              variant="ghost"
              isIconOnly
              size="sm"
              aria-label="Block room dates"
              onPress={props.onBlockRoom}
              className="ui-press size-9 min-w-9 shrink-0 rounded-xl border border-border/70 bg-background text-foreground shadow-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/50"
            >
              <CalendarOff className="size-4" aria-hidden="true" />
            </Button>
            <Tooltip.Content>Block room dates</Tooltip.Content>
          </Tooltip>
        )}

        {canEdit && props.onNewBooking && (
          <Button
            variant="primary"
            size="sm"
            aria-label="New booking"
            onPress={props.onNewBooking}
            className="ui-press h-9 shrink-0 gap-2 rounded-xl px-3 text-xs font-semibold shadow-2xs lg:px-4"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden lg:inline">New booking</span>
          </Button>
        )}
      </div>

      {/* ── Mobile (<768px) ── */}
      <div className="md:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-2">
          <RangePicker
            mobile
            startDate={props.startDate}
            days={props.days}
            realtimeStatus={props.realtimeStatus}
            onSelectDate={props.onSelectDate}
            onToday={props.onToday}
          />

          <div className="flex shrink-0 items-center gap-1">
            <NavStepper compact onNavigate={props.onNavigate} onToday={props.onToday} />

            <button
              type="button"
              aria-label={mobileSearchOpen ? "Close search" : "Search bookings"}
              aria-expanded={mobileSearchOpen}
              onClick={() => {
                const next = !mobileSearchOpen;
                setMobileSearchOpen(next);
                if (next) requestAnimationFrame(() => mobileInputRef.current?.focus());
                else props.onSearchQueryChange("");
              }}
              className={cn(
                "ui-press grid size-11 cursor-pointer place-items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mobileSearchOpen || props.searchQuery
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground active:bg-muted/60"
              )}
            >
              <Search className="size-4" />
            </button>

            <button
              type="button"
              aria-label={`Filters and view options${props.activeFilterCount > 0 ? ` (${props.activeFilterCount} active)` : ""}`}
              onClick={props.onOpenFilters}
              className={cn(
                "ui-press relative grid size-11 cursor-pointer place-items-center rounded-xl border outline-none focus-visible:ring-2 focus-visible:ring-ring",
                props.activeFilterCount > 0
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 bg-background text-foreground"
              )}
            >
              <SlidersHorizontal className="size-4" />
              {props.activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-semibold leading-none text-primary-foreground">
                  {props.activeFilterCount}
                </span>
              )}
            </button>

            {canEdit && props.onNewBooking && (
              <Button
                variant="primary"
                size="sm"
                isIconOnly
                aria-label="New booking"
                onPress={props.onNewBooking}
                className="ui-press size-11 min-w-11 rounded-xl shadow-2xs"
              >
                <Plus className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {(mobileSearchOpen || props.searchQuery) && (
          <div className="border-t border-border/50 px-3 py-2">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                ref={mobileInputRef}
                type="search"
                enterKeyHint="search"
                value={props.searchQuery}
                onChange={(e) => props.onSearchQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    if (props.searchQuery) props.onSearchQueryChange("");
                    else setMobileSearchOpen(false);
                  }
                }}
                placeholder="Search guest, room, or reference…"
                aria-label="Search bookings"
                className="h-11 w-full rounded-xl border border-border/70 bg-background pl-10 pr-10 text-base text-foreground outline-none focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              {props.searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    props.onSearchQueryChange("");
                    mobileInputRef.current?.focus();
                  }}
                  className="ui-press absolute right-2 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
