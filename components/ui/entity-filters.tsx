"use client";

import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button, Chip, Drawer, Popover } from "@heroui/react";

import { cn } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { useIsMobile } from "@/hooks/use-mobile";

// Generic, config-driven filter shell shared across tables (reservations,
// customers, …). One "Filters" trigger + count badge opens a Popover on
// desktop / bottom Drawer on mobile; active filters surface as removable chips.

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterFieldConfig {
  /** Stable key; also the value key in the `values` record. */
  key: string;
  /** Field label shown in the panel (e.g. "Status"). */
  label: string;
  ariaLabel: string;
  /** Label for the reset "all" option (e.g. "All statuses"). */
  allLabel?: string;
  /** Chip prefix; defaults to `label`. */
  chipPrefix?: string;
  /** Options excluding the "all" sentinel. */
  options: FilterOption[];
  disabled?: boolean;
}

export type FilterValues = Record<string, string>;
export type FilterChange = (key: string, value: string) => void;

const valueOf = (values: FilterValues, key: string) => values[key] ?? "all";
const labelOf = (opts: FilterOption[], v: string) =>
  opts.find((o) => o.value === v)?.label ?? v;

export function countActiveFilters(fields: FilterFieldConfig[], values: FilterValues) {
  return fields.filter((f) => valueOf(values, f.key) !== "all").length;
}

interface FilterFieldsProps {
  fields: FilterFieldConfig[];
  values: FilterValues;
  onChange: FilterChange;
}

// Shared select grid — desktop popover + mobile drawer both render this.
function FilterFields({ fields, values, onChange }: FilterFieldsProps) {
  const trigger = "min-h-11 sm:min-h-9";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <HeroSelectField
          key={f.key}
          className="w-full"
          triggerClassName={trigger}
          label={f.label}
          value={valueOf(values, f.key)}
          onValueChange={(v) => onChange(f.key, v)}
          isDisabled={f.disabled}
          options={[
            { value: "all", label: f.allLabel ?? `All ${f.label.toLowerCase()}` },
            ...f.options,
          ]}
          ariaLabel={f.ariaLabel}
        />
      ))}
    </div>
  );
}

interface EntityFiltersProps {
  fields: FilterFieldConfig[];
  values: FilterValues;
  onChange: FilterChange;
  onClearAll: () => void;
  filteredCount: number;
  /** Noun for the mobile "Show N results" action. */
  resultNoun?: string;
  title?: string;
}

// Filters trigger + responsive panel (Popover on desktop, bottom Drawer on mobile).
export function EntityFilters({
  fields,
  values,
  onChange,
  onClearAll,
  filteredCount,
  resultNoun = "result",
  title = "Filters",
}: EntityFiltersProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const activeCount = countActiveFilters(fields, values);

  const triggerClass = cn("ui-press h-11 shrink-0 rounded-xl text-sm sm:h-9", activeCount > 0 && "bg-muted");

  const label = (
    <>
      <SlidersHorizontal className="size-4" />
      {title}
      {activeCount > 0 && (
        <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-2 text-[11px] font-semibold tabular-nums text-primary-foreground">
          {activeCount}
        </span>
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={activeCount > 0 ? `${title}, ${activeCount} active` : title}
          className={triggerClass}
        >
          {label}
        </Button>
        <Drawer.Backdrop isOpen={open} onOpenChange={setOpen} variant="blur">
          <Drawer.Content placement="bottom">
            <Drawer.Dialog className="rounded-t-2xl">
              <Drawer.Handle />
              <Drawer.CloseTrigger />
              <Drawer.Header>
                <Drawer.Heading>{title}</Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body className="pb-2">
                <FilterFields fields={fields} values={values} onChange={onChange} />
              </Drawer.Body>
              <Drawer.Footer className="flex items-center justify-between gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button
                  variant="ghost"
                  onPress={onClearAll}
                  isDisabled={activeCount === 0}
                  className="ui-press min-h-11 rounded-xl"
                >
                  Clear all
                </Button>
                <Button variant="primary" slot="close" className="ui-press min-h-11 rounded-xl">
                  Show {filteredCount} {resultNoun}
                  {filteredCount !== 1 ? "s" : ""}
                </Button>
              </Drawer.Footer>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </>
    );
  }

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button
          variant="ghost"
          size="sm"
          aria-label={activeCount > 0 ? `${title}, ${activeCount} active` : title}
          className={triggerClass}
        >
          {label}
        </Button>
      </Popover.Trigger>
      <Popover.Content
        placement="bottom"
        className="w-[min(26rem,calc(100vw-1.5rem))] border-border/60 p-0 shadow-xl"
      >
        <Popover.Dialog className="p-4 outline-none" aria-label={`${title} panel`}>
          <p className="mb-3 text-section text-foreground">{title}</p>
          <FilterFields fields={fields} values={values} onChange={onChange} />
          <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onPress={onClearAll}
              isDisabled={activeCount === 0}
              className="rounded-lg text-muted-foreground"
            >
              Clear all
            </Button>
            <Button variant="primary" size="sm" onPress={() => setOpen(false)} className="rounded-lg">
              Done
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

interface EntityFilterChipsProps {
  fields: FilterFieldConfig[];
  values: FilterValues;
  onChange: FilterChange;
  onClearAll: () => void;
}

// Removable active-filter chips + single Clear all. Rendered only when a filter is set.
export function EntityFilterChips({
  fields,
  values,
  onChange,
  onClearAll,
}: EntityFilterChipsProps) {
  const active = fields.filter((f) => valueOf(values, f.key) !== "all");
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Active filters">
      {active.map((f) => (
        <Chip key={f.key} variant="secondary" size="sm" className="rounded-lg border-border/60 pr-1">
          <Chip.Label className="text-xs font-medium">
            {(f.chipPrefix ?? f.label)}: {labelOf(f.options, valueOf(values, f.key))}
          </Chip.Label>
          <button
            type="button"
            aria-label={`Remove ${(f.chipPrefix ?? f.label).toLowerCase()} filter`}
            onClick={() => onChange(f.key, "all")}
            className="ui-press -mr-1 ml-1 inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-6 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </Chip>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ui-press min-h-9 cursor-pointer rounded px-2 text-xs font-medium text-muted-foreground underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:px-1 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
