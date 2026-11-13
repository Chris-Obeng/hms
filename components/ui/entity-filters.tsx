"use client";

import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button, Drawer, ListBox, Select } from "@heroui/react";

import { cn } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { useIsMobile } from "@/hooks/use-mobile";

// Config-driven filters shared by list toolbars (reservations, guests).
// From `md`: one HeroUI Select per field, inline in the toolbar, so the current
// value is always visible. Phones: a single "Filters" button opens a bottom
// drawer, and active filters surface as removable chips under the toolbar.

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterFieldConfig {
  /** Stable key; also the value key in the `values` record. */
  key: string;
  /** Field label shown in the drawer (e.g. "Status"). */
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
const allLabelOf = (f: FilterFieldConfig) => f.allLabel ?? `All ${f.label.toLowerCase()}`;

export function countActiveFilters(fields: FilterFieldConfig[], values: FilterValues) {
  return fields.filter((f) => valueOf(values, f.key) !== "all").length;
}

interface EntityFiltersProps {
  fields: FilterFieldConfig[];
  values: FilterValues;
  onChange: FilterChange;
  onClearAll: () => void;
  filteredCount: number;
  /** Noun for the phone drawer's "Show N results" action. */
  resultNoun?: string;
  title?: string;
}

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

  if (!isMobile) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {fields.map((f) => (
          <InlineFilter key={f.key} field={f} value={valueOf(values, f.key)} onChange={(v) => onChange(f.key, v)} />
        ))}
        {activeCount > 0 && (
          <Button variant="ghost" onPress={onClearAll} className="rounded-xl font-medium text-muted-foreground">
            Clear
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        onPress={() => setOpen(true)}
        aria-label={activeCount > 0 ? `${title}, ${activeCount} active` : title}
        className="h-11 shrink-0 gap-2 rounded-xl font-medium"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        {title}
        {activeCount > 0 && (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-2xs font-semibold tabular-nums text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>
      <Drawer.Backdrop isOpen={open} onOpenChange={setOpen} variant="opaque" className="bg-black/30">
        <Drawer.Content placement="bottom">
          <Drawer.Dialog className="rounded-t-3xl bg-card p-0">
            <Drawer.Handle className="mt-3" />
            <Drawer.Header className="px-6 pb-2 pt-4">
              <Drawer.Heading className="text-lg font-semibold text-foreground">{title}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-4 px-6 py-4">
              {fields.map((f) => (
                <HeroSelectField
                  key={f.key}
                  label={f.label}
                  ariaLabel={f.ariaLabel}
                  value={valueOf(values, f.key)}
                  onValueChange={(v) => onChange(f.key, v || "all")}
                  isDisabled={f.disabled}
                  triggerClassName="min-h-11"
                  options={[{ value: "all", label: allLabelOf(f) }, ...f.options]}
                />
              ))}
            </Drawer.Body>
            <Drawer.Footer className="m-0 flex gap-2 border-t border-border/60 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <Button variant="tertiary" onPress={onClearAll} isDisabled={activeCount === 0} className="h-11 rounded-xl">
                Clear all
              </Button>
              <Button variant="primary" slot="close" className="h-11 flex-1 rounded-xl font-semibold">
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

/** Compact toolbar select; its trigger shows the active value, so no chip is needed. */
function InlineFilter({
  field,
  value,
  onChange,
}: {
  field: FilterFieldConfig;
  value: string;
  onChange: (value: string) => void;
}) {
  const active = value !== "all";
  return (
    <Select
      aria-label={field.ariaLabel}
      value={value}
      isDisabled={field.disabled}
      onChange={(v) => onChange(v == null ? "all" : String(v))}
      className="w-40 min-w-0"
    >
      <Select.Trigger
        className={cn(
          "min-h-10 rounded-xl text-sm",
          active && "bg-primary/[0.08] font-medium text-foreground"
        )}
      >
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="min-w-48">
        <ListBox>
          {[{ value: "all", label: allLabelOf(field) }, ...field.options].map((o) => (
            <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

interface EntityFilterChipsProps {
  fields: FilterFieldConfig[];
  values: FilterValues;
  onChange: FilterChange;
  onClearAll: () => void;
  className?: string;
}

/** Phones only: removable chips for active filters (desktop selects already show them). */
export function EntityFilterChips({ fields, values, onChange, onClearAll, className }: EntityFilterChipsProps) {
  const isMobile = useIsMobile();
  const active = fields.filter((f) => valueOf(values, f.key) !== "all");
  if (!isMobile || active.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} role="group" aria-label="Active filters">
      {active.map((f) => {
        const text = `${f.chipPrefix ?? f.label}: ${labelOf(f.options, valueOf(values, f.key))}`;
        return (
          <Button
            key={f.key}
            size="sm"
            variant="secondary"
            aria-label={`Remove filter ${text}`}
            onPress={() => onChange(f.key, "all")}
            className="h-11 gap-2 rounded-xl px-3 text-xs font-medium"
          >
            {text}
            <X className="size-3 text-muted-foreground" aria-hidden="true" />
          </Button>
        );
      })}
      <Button size="sm" variant="ghost" onPress={onClearAll} className="h-11 rounded-xl px-3 text-xs font-medium text-muted-foreground">
        Clear all
      </Button>
    </div>
  );
}
