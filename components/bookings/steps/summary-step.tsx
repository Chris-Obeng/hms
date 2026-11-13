"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Autocomplete,
  Avatar,
  Button,
  Description,
  Disclosure,
  EmptyState,
  FieldError,
  Input,
  Label,
  ListBox,
  SearchField,
  Select,
  Skeleton,
  Spinner,
  TextArea,
  TextField,
  TimeField,
} from "@heroui/react";
import { Clock } from "lucide-react";
import { parseTime } from "@internationalized/date";
import { searchGuests, type GuestSearchResult } from "@/app/actions/customers";
import { type StaffCartLine } from "./availability-step";
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
  cartLines: StaffCartLine[];
  linePricings: { line: StaffCartLine; pricing: SummaryPricing }[];
  grand: { subtotal: number; taxAmount: number; totalAmount: number; loading: boolean };
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
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
      placeholder="Find an existing guest"
      onChange={(key) => {
        const g = results.find((r) => r.id === key);
        if (g) onSelect(g);
      }}
    >
      <Autocomplete.Trigger className="min-h-11 sm:min-h-10">
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
                {term.length < 2 ? "Type a name, email or phone" : isFetching ? "Searching…" : "No match. Add them below."}
              </EmptyState>
            )}
          >
            {(g: GuestSearchResult) => (
              <ListBox.Item id={g.id} textValue={g.fullName}>
                <Avatar size="sm" className="shrink-0" aria-hidden>
                  <Avatar.Fallback className="font-semibold">{initials(g.fullName)}</Avatar.Fallback>
                </Avatar>
                <div className="flex min-w-0 flex-col">
                  <Label>{g.fullName}</Label>
                  <Description>{g.email || g.phone || g.nationality || "No contact details"}</Description>
                </div>
              </ListBox.Item>
            )}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}

/** Field heights: 44px touch targets on phones, 40px from `sm` (matches HeroUI inputs here). */
const FIELD_H = "min-h-11 sm:min-h-10";

export function SummaryStep({
  linePricings,
  grand,
  checkIn,
  checkOut,
  nights,
  currency,
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
  // String prop ↔ TimeValue bridge for the arrival field; empty/invalid → null.
  const arrivalValue = React.useMemo(() => {
    if (!estimatedArrival) return null;
    try {
      return parseTime(estimatedArrival);
    } catch {
      return null;
    }
  }, [estimatedArrival]);

  const hasExtras = Boolean(estimatedArrival || specialRequests || internalNotes);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-6">
        {/* Guest */}
        <section aria-label="Guest" className="flex flex-col gap-4">
          {guestId ? (
            <div className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3">
              <Avatar size="md" className="shrink-0" aria-hidden>
                <Avatar.Fallback className="font-semibold">{initials(guestName)}</Avatar.Fallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{guestName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {guestEmail || guestPhone || nationality || "Existing guest"}
                </p>
              </div>
              <Button size="sm" variant="ghost" onPress={onClearGuest} className="shrink-0 rounded-lg">
                Change
              </Button>
            </div>
          ) : (
            <>
              <GuestSearchField onSelect={onSelectGuest} />

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
                    autoComplete="email"
                  />
                  {errors.guestEmail && <FieldError>{errors.guestEmail}</FieldError>}
                </TextField>

                <TextField fullWidth>
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => onGuestPhoneChange(e.target.value)}
                    onFocus={() => {
                      if (!guestPhone.trim()) onGuestPhoneChange(`${countryDialCode} `);
                    }}
                    placeholder={`${countryDialCode} 24 123 4567`}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </TextField>
              </div>

              <div className="flex flex-col gap-1">
                <Label>Nationality</Label>
                <CountrySelect value={nationality} onChange={onNationalityChange} placeholder="Select country" />
              </div>
            </>
          )}
        </section>

        {/* Booking */}
        <section aria-label="Booking" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            fullWidth
            placeholder="Select source"
            value={source}
            onChange={(v) => onSourceChange(String(v))}
            isInvalid={!!errors.source}
          >
            <Label>Source</Label>
            <Select.Trigger className={FIELD_H}>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            {errors.source && <FieldError>{errors.source}</FieldError>}
            <Select.Popover>
              <ListBox>
                {SOURCE_OPTIONS.map((opt) => (
                  <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                    {opt.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            fullWidth
            value={paymentPreference}
            onChange={(v) => onPaymentPreferenceChange(v as "pay_now" | "pay_at_checkin")}
          >
            <Label>Payment</Label>
            <Select.Trigger className={FIELD_H}>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="pay_at_checkin" textValue="Pay at check-in">
                  Pay at check-in
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id="pay_now" textValue="Pay now">
                  Pay now
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </section>

        {/* Optional extras stay folded until needed */}
        <Disclosure defaultExpanded={hasExtras} className="border-t border-border/60 pt-2">
          <Disclosure.Heading>
            <Button
              slot="trigger"
              variant="ghost"
              fullWidth
              className="justify-between rounded-lg px-0 text-sm font-medium text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-transparent [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            >
              Arrival time and notes
              <Disclosure.Indicator />
            </Button>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="flex flex-col gap-4 px-0 pb-0 pt-2">
              <TimeField
                granularity="minute"
                value={arrivalValue}
                onChange={(v) => onEstimatedArrivalChange(v ? v.toString().slice(0, 5) : "")}
                className="sm:max-w-[calc(50%-0.5rem)]"
              >
                <Label>Arrival time</Label>
                <TimeField.Group className="h-11 sm:h-10">
                  <TimeField.Prefix>
                    <Clock className="size-4 text-muted-foreground" />
                  </TimeField.Prefix>
                  <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                </TimeField.Group>
              </TimeField>

              <TextField fullWidth>
                <Label>Guest requests</Label>
                <TextArea
                  value={specialRequests}
                  onChange={(e) => onSpecialRequestsChange(e.target.value)}
                  placeholder="Late check-in, extra pillows…"
                  rows={2}
                  className="resize-none"
                />
              </TextField>

              <TextField fullWidth>
                <Label>Staff notes</Label>
                <TextArea
                  value={internalNotes}
                  onChange={(e) => onInternalNotesChange(e.target.value)}
                  placeholder="Only visible to staff"
                  rows={2}
                  className="resize-none"
                />
              </TextField>
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
        {errors.cart && <p className="text-xs font-medium text-destructive">{errors.cart}</p>}
      </div>

      {/* Reservation summary */}
      <aside aria-label="Reservation summary" className="lg:sticky lg:top-0 lg:self-start">
        <div className="flex flex-col gap-4 rounded-2xl bg-secondary/60 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Check-in</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {formatDate(checkIn, "EEE, d MMM")}
              </p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-xs text-muted-foreground">Check-out</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {formatDate(checkOut, "EEE, d MMM")}
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-3 border-t border-border/60 pt-4">
            {linePricings.map(({ line, pricing }) => (
              <li key={line.roomTypeId} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {line.room.name}
                    {line.quantity > 1 && <span className="text-muted-foreground"> × {line.quantity}</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {occupancy(line.adults, line.children)} · {nightsLabel(nights)}
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-foreground">
                  {pricing.loading ? (
                    <Skeleton className="h-4 w-16 rounded-md" />
                  ) : (
                    formatCurrency(pricing.subtotal, currency)
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
            {grand.taxAmount > 0 && (
              <>
                <Row label="Subtotal" value={formatCurrency(grand.subtotal, currency)} />
                <Row label="Tax" value={formatCurrency(grand.taxAmount, currency)} />
              </>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">Total</span>
              {grand.loading ? (
                <Skeleton className="h-6 w-24 rounded-md" />
              ) : (
                <span className="text-lg font-semibold tracking-tight tabular-nums text-foreground">
                  {formatCurrency(grand.totalAmount, currency)}
                </span>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function occupancy(adults: number, children: number): string {
  const a = `${adults} adult${adults !== 1 ? "s" : ""}`;
  return children ? `${a}, ${children} child${children !== 1 ? "ren" : ""}` : a;
}
