"use client";

import * as React from "react";

import {
  EntityFilters,
  EntityFilterChips,
  type FilterFieldConfig,
} from "@/components/ui/entity-filters";

// ── Filter options ─────────────────────────────────────────────────
export const STATUS_OPTIONS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked in" },
  { value: "checked_out", label: "Checked out" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
  { value: "pending", label: "Pending" },
];

export const PAYMENT_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "unpaid", label: "Unpaid" },
  { value: "refunded", label: "Refunded" },
];

export const SOURCE_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "manual", label: "Manual" },
  { value: "phone", label: "Phone" },
  { value: "walk_in", label: "Walk-in" },
];

export interface ReservationFilterState {
  // Index signature so the state is a valid FilterValues (Record<string,string>)
  // for the shared filter shell.
  [key: string]: string;
  status: string;
  payment: string;
  source: string;
  roomType: string;
}

type FilterKey = keyof ReservationFilterState;

// Field config for the shared shell. roomType options are dynamic; its chip
// label falls back to the value (value === room-type name), so chips render
// correctly even without the roomTypes list.
function reservationFields(roomTypes: { id: string; name: string }[] = []): FilterFieldConfig[] {
  return [
    { key: "status", label: "Status", ariaLabel: "Filter by booking status", allLabel: "All statuses", options: STATUS_OPTIONS },
    { key: "payment", label: "Payment", ariaLabel: "Filter by payment status", allLabel: "All payments", options: PAYMENT_OPTIONS },
    { key: "source", label: "Source", ariaLabel: "Filter by booking source", allLabel: "All sources", options: SOURCE_OPTIONS },
    {
      key: "roomType",
      label: "Room type",
      chipPrefix: "Room",
      ariaLabel: "Filter by room type",
      allLabel: "All room types",
      disabled: roomTypes.length === 0,
      options: roomTypes.map((rt) => ({ value: rt.name, label: rt.name })),
    },
  ];
}


interface ReservationFiltersProps {
  filters: ReservationFilterState;
  onChange: (key: FilterKey, value: string) => void;
  onClearAll: () => void;
  roomTypes: { id: string; name: string }[];
  filteredCount: number;
}

export function ReservationFilters({
  filters,
  onChange,
  onClearAll,
  roomTypes,
  filteredCount,
}: ReservationFiltersProps) {
  const fields = React.useMemo(() => reservationFields(roomTypes), [roomTypes]);
  return (
    <EntityFilters
      fields={fields}
      values={filters}
      onChange={(k, v) => onChange(k as FilterKey, v)}
      onClearAll={onClearAll}
      filteredCount={filteredCount}
      resultNoun="result"
    />
  );
}

interface ChipsProps {
  filters: ReservationFilterState;
  onChange: (key: FilterKey, value: string) => void;
  onClearAll: () => void;
}

export function ReservationFilterChips({ filters, onChange, onClearAll }: ChipsProps) {
  const fields = React.useMemo(() => reservationFields(), []);
  return (
    <EntityFilterChips
      fields={fields}
      values={filters}
      onChange={(k, v) => onChange(k as FilterKey, v)}
      onClearAll={onClearAll}
    />
  );
}
