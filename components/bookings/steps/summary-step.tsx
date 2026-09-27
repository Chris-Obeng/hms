"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Autocomplete,
  Description,
  EmptyState,
  Input,
  Label,
  ListBox,
  Select,
  SearchField,
  Spinner,
  TextArea,
  TextField,
  TimeField,
  FieldError,
} from "@heroui/react";
import { CalendarDays, Clock, User, UserCheck, X } from "lucide-react";
import { parseTime } from "@internationalized/date";
import { searchGuests, type GuestSearchResult } from "@/app/actions/customers";
import { type StaffAvailabilityRoom } from "@/app/actions/availability";
import { CountrySelect } from "@/components/ui/country-select";
import { formatCurrency, formatDate, nightsLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const SOURCE_OPTIONS = [
  { id: "direct", label: "Direct" },
  { id: "manual", label: "Manual" },
  { id: "phone", label: "Phone" },
  { id: "walk_in", label: "Walk-in" },
] as const;

export interface SummaryPricing {
  roomRate: number;
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  loading: boolean;
}

interface SummaryStepProps {
  room: StaffAvailabilityRoom;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  childrenCount: number;
  currency: string;
  pricing: SummaryPricing;
  guestId: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  nationality: string;
  onGuestNameChange: (v: string) => void;
  onGuestEmailChange: (v: string) => void;
  onGuestPhoneChange: (v: string) => void;
  onNationalityChange: (v: string) => void;
  onSelectGuest: (g: GuestSearchResult) => void;
  onClearGuest: () => void;
  source: string | null;
  onSourceChange: (v: string) => void;
  paymentPreference: "pay_now" | "pay_at_checkin";
  onPaymentPreferenceChange: (v: "pay_now" | "pay_at_checkin") => void;
  estimatedArrival: string;
  onEstimatedArrivalChange: (v: string) => void;
  specialRequests: string;
  onSpecialRequestsChange: (v: string) => void;
  internalNotes: string;
  onInternalNotesChange: (v: string) => void;
  countryDialCode: string;
  errors: Record<string, string>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Async search over existing guests; picking one promotes to a linked card. */
function GuestSearchField({ onSelect }: { onSelect: (g: GuestSearchResult) => void }) {
  const [inputValue, setInputValue] = React.useState("");
  const [term, setTerm] = React.useState("");

  // Debounce so a fast typist fires one search, not one per keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setTerm(inputValue.trim()), 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  const { data, isFetching } = useQuery({
    queryKey: ["guest-search", term],
    queryFn: () => searchGuests(term),
    enabled: term.length >= 2,
  });

  const results = data && data.success ? data.data : [];

  return (
    <Autocomplete
      aria-label="Search existing guest"
      allowsEmptyCollection
      selectionMode="single"
      value={null}
      placeholder="Search existing guest by name, email or phone"
      onChange={(key) => {
        const g = results.find((r) => r.id === key);
        if (g) onSelect(g);
      }}
    >
      <Autocomplete.Trigger>
        <Autocomplete.Value />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter inputValue={inputValue} onInputChange={setInputValue}>
          <SearchField autoFocus className="sticky top-0 z-10" name="guest-search" variant="secondary">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search guests…" />
              <Spinner
                size="sm"
                className={cn("absolute top-1/2 right-2 -translate-y-1/2", {
                  "pointer-events-none opacity-0": !isFetching,
                })}
              />
              <SearchField.ClearButton className={cn({ "pointer-events-none opacity-0": isFetching })} />
            </SearchField.Group>
          </SearchField>
          <ListBox
            items={results}
            className="max-h-64 overflow-y-auto"
            renderEmptyState={() => (
              <EmptyState>
                {term.length < 2
                  ? "Type at least 2 characters"
                  : isFetching
                    ? "Searching…"
                    : "No matching guest — the details below create a new profile"}
              </EmptyState>
            )}
          >
            {(g: GuestSearchResult) => (
              <ListBox.Item id={g.id} textValue={g.fullName}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {initials(g.fullName)}
                </span>
                <div className="flex min-w-0 flex-col">
                  <Label>{g.fullName}</Label>
                  <Description>{g.email || g.phone || g.nationality || "No contact on file"}</Description>
                </div>
              </ListBox.Item>
            )}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}

export function SummaryStep({
  room,
  checkIn,
  checkOut,
  nights,
  adults,
  childrenCount,
  currency,
  pricing,
  guestId,
  guestName,
  guestEmail,
  guestPhone,
  nationality,
  onGuestNameChange,
  onGuestEmailChange,
  onGuestPhoneChange,
  onNationalityChange,
  onSelectGuest,
  onClearGuest,
  source,
  onSourceChange,
  paymentPreference,
  onPaymentPreferenceChange,
  estimatedArrival,
  onEstimatedArrivalChange,
  specialRequests,
  onSpecialRequestsChange,
  internalNotes,
  onInternalNotesChange,
  countryDialCode,
  errors,
}: SummaryStepProps) {
  const occupancy =
    `${adults} adult${adults !== 1 ? "s" : ""}` +
    (childrenCount > 0 ? ` · ${childrenCount} child${childrenCount !== 1 ? "ren" : ""}` : "");

  // String prop ↔ TimeValue bridge for the arrival field; empty/invalid → null.
  const arrivalValue = React.useMemo(() => {
    if (!estimatedArrival) return null;
    try {
      return parseTime(estimatedArrival);
    } catch {
      return null;
    }
  }, [estimatedArrival]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Left — guest capture + options */}
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <User className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Guest</h3>
          </div>
          {guestId ? (
            <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {initials(guestName)}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <UserCheck className="size-3.5 text-primary" /> {guestName}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {guestEmail || guestPhone || nationality || "Existing guest profile"}
                </span>
              </div>
              <button
                type="button"
                onClick={onClearGuest}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" /> Change
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <GuestSearchField onSelect={onSelectGuest} />
              <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or enter a new guest
                <span className="h-px flex-1 bg-border" />
              </div>
              <TextField isInvalid={!!errors.guestName} fullWidth isRequired>
                <Label>Full name</Label>
                <Input
                  value={guestName}
                  onChange={(e) => onGuestNameChange(e.target.value)}
                  placeholder="Ama Serwaa"
                  autoComplete="name"
                />
                {errors.guestName && <FieldError>{errors.guestName}</FieldError>}
              </TextField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField isInvalid={!!errors.guestEmail} fullWidth>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => onGuestEmailChange(e.target.value)}
                    placeholder="ama@example.com"
                  />
                  {errors.guestEmail ? (
                    <FieldError>{errors.guestEmail}</FieldError>
                  ) : (
                    <Description>Optional · confirmation sent here</Description>
                  )}
                </TextField>

                <TextField fullWidth>
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => onGuestPhoneChange(e.target.value)}
                    onFocus={() => { if (!guestPhone.trim()) onGuestPhoneChange(`${countryDialCode} `); }}
                    placeholder={`${countryDialCode} 24 123 4567`}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </TextField>
              </div>

              <div className="flex flex-col gap-1.5">
                {/* CountrySelect self-labels via its internal aria-label; a bare Label here binds to nothing. */}
                <span className="text-sm font-medium text-foreground">Nationality</span>
                <CountrySelect value={nationality} onChange={onNationalityChange} placeholder="Search country" />
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4 border-t border-border/60 pt-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              fullWidth
              variant="secondary"
              placeholder="Select source"
              value={source}
              onChange={(v) => onSourceChange(String(v))}
              isInvalid={!!errors.source}
            >
              <Label>Booking source</Label>
              <Select.Trigger className="min-h-11 rounded-xl border border-border/60 bg-background px-3 text-sm shadow-none transition-colors hover:border-border data-[focus-visible=true]:border-ring">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              {errors.source && <FieldError>{errors.source}</FieldError>}
              <Select.Popover>
                <ListBox>
                  {SOURCE_OPTIONS.map((opt) => (
                    <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                      {opt.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            <Select
              fullWidth
              variant="secondary"
              value={paymentPreference}
              onChange={(v) => onPaymentPreferenceChange(v as "pay_now" | "pay_at_checkin")}
            >
              <Label>Payment</Label>
              <Select.Trigger className="min-h-11 rounded-xl border border-border/60 bg-background px-3 text-sm shadow-none transition-colors hover:border-border data-[focus-visible=true]:border-ring">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="pay_at_checkin" textValue="Pay at check-in">Pay at check-in</ListBox.Item>
                  <ListBox.Item id="pay_now" textValue="Pay now">Pay now</ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>

            <TimeField
              className="sm:col-span-2"
              granularity="minute"
              value={arrivalValue}
              onChange={(v) => onEstimatedArrivalChange(v ? v.toString().slice(0, 5) : "")}
            >
              <Label>Estimated arrival</Label>
              <TimeField.Group variant="secondary">
                <TimeField.Prefix>
                  <Clock className="size-4 text-muted-foreground" />
                </TimeField.Prefix>
                <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
              </TimeField.Group>
              <Description>Optional · defaults to standard check-in time</Description>
            </TimeField>
          </div>

          <TextField fullWidth>
            <Label>Special requests</Label>
            <TextArea
              value={specialRequests}
              onChange={(e) => onSpecialRequestsChange(e.target.value)}
              placeholder="Late check-in, extra pillows, ground floor…"
              rows={2}
            />
          </TextField>

          <TextField fullWidth>
            <Label>Internal notes</Label>
            <TextArea
              value={internalNotes}
              onChange={(e) => onInternalNotesChange(e.target.value)}
              placeholder="Staff-only · never shown to guest"
              rows={2}
            />
          </TextField>
        </section>
      </div>

      {/* Right — sticky reservation summary */}
      <aside className="lg:sticky lg:top-0 lg:self-start">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reservation</p>
            <p className="text-sm font-bold text-foreground">{room.name}</p>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-2">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium tabular-nums text-foreground">
              {formatDate(checkIn)} → {formatDate(checkOut)}
            </span>
            <span className="ml-auto inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
              {nightsLabel(nights)}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">{occupancy}</p>

          <div className="border-t border-border/60 pt-3">
            {pricing.loading ? (
              <div className="flex flex-col gap-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {formatCurrency(pricing.roomRate, currency)} × {nightsLabel(nights)}
                  </span>
                  <span className="tabular-nums">{formatCurrency(pricing.subtotal, currency)}</span>
                </div>
                {pricing.taxAmount > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Tax {pricing.taxRate.toFixed(2).replace(/\.00$/, "")}%</span>
                    <span className="tabular-nums">{formatCurrency(pricing.taxAmount, currency)}</span>
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between border-t border-border/50 pt-2">
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className="text-base font-bold tabular-nums text-primary">
                    {formatCurrency(pricing.totalAmount, currency)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

