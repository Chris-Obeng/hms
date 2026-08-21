"use client";

import * as React from "react";
import { toast } from "@heroui/react";
import {
  CalendarDays,
  User,
  Building2,
} from "lucide-react";
import {
  Modal,
  Button,
  Select,
  ListBox,
  TextField,
  Label,
  Input,
  TextArea,
  Description,
  FieldError,
} from "@heroui/react";
import {
  CalendarDate,
  today,
  getLocalTimeZone,
} from "@internationalized/date";

import { BookingDateRangePicker } from "@/components/booking/booking-date-range-picker";
import { GuestPickerPopover } from "@/components/booking/guest-picker-popover";
import { CountrySelect, getCountryDialCode } from "@/components/ui/country-select";
import { createBooking, type NewBookingInput } from "@/app/actions/bookings";
import { getResolvedRatesForBooking, type StaffResolvedPricing } from "@/app/actions/pricing";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────

interface RoomTypeOption {
  id: string;
  name: string;
  base_price: number;
}

interface NewBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomTypes: { id: string; name: string; base_price?: number }[];
  rooms?: { id: string; roomNumber: string; roomTypeId: string; status: string }[];
  currency: string;
  prefillRoomTypeId?: string;
  prefillRoomId?: string;
  prefillCheckIn?: Date;
  prefillCheckOut?: Date;
  onReservationCreated?: (result: { bookingId: string; reference: string; payNow: boolean }) => void;
}

const SOURCE_OPTIONS = [
  { id: "direct", label: "Direct" },
  { id: "manual", label: "Manual" },
  { id: "phone", label: "Phone" },
  { id: "walk_in", label: "Walk-in" },
] as const;

function dateToCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function calendarDateToLocalDate(cd: CalendarDate): Date {
  return new Date(cd.year, cd.month - 1, cd.day);
}

// ── Section heading ────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
        <Icon className="size-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

// ── Stepper ────────────────────────────────────────────────────────

// ── Component ──────────────────────────────────────────────────────

export function NewBookingModal({
  open,
  onOpenChange,
  roomTypes: roomTypeOptions,
  rooms = [],
  currency,
  prefillRoomTypeId,
  prefillCheckIn,
  prefillCheckOut,
  onReservationCreated,
}: NewBookingModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [step, setStep] = React.useState(1);
  const [loading, setLoading] = React.useState(false);

  // Guest
  const [guestName, setGuestName] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [nationality, setNationality] = React.useState("Ghana");

  // Stay
  const [selectedRoomTypeId, setSelectedRoomTypeId] = React.useState<string>("");
  const [range, setRange] = React.useState<{ start: CalendarDate; end: CalendarDate } | null>(null);
  const [adults, setAdults] = React.useState(1);
  const [children, setChildren] = React.useState(0);
  const [source, setSource] = React.useState<string | null>("walk_in");

  // Details
  const [estimatedArrival, setEstimatedArrival] = React.useState("");
  const [specialRequests, setSpecialRequests] = React.useState("");
  const [internalNotes, setInternalNotes] = React.useState("");
  const [paymentPreference, setPaymentPreference] = React.useState<"pay_now" | "pay_at_checkin">("pay_at_checkin");

  // Validation
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const sync = () => dialogRef.current?.style.setProperty("--reservation-vvh", `${viewport.height}px`);
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => { viewport.removeEventListener("resize", sync); viewport.removeEventListener("scroll", sync); };
  }, [open]);

  // ── Derived ────────────────────────────────────────────────────
  const nights = React.useMemo(() => {
    if (!range) return 0;
    const start = calendarDateToLocalDate(range.start);
    const end = calendarDateToLocalDate(range.end);
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  }, [range]);

  const selectedRoomType = roomTypeOptions.find(
    (rt): rt is RoomTypeOption => rt.id === selectedRoomTypeId && rt.base_price != null,
  );

  const rangeKey = range ? `${range.start.toString()}_${range.end.toString()}` : null;

  // ── Pricing (server-authoritative preview) ──────────────────────
  const [resolvedPricing, setResolvedPricing] = React.useState<StaffResolvedPricing | null>(null);
  const [pricingLoading, setPricingLoading] = React.useState(false);
  const [pricingKey, setPricingKey] = React.useState<string | null>(null);

  // Fetch pricing whenever the selection changes. Stale responses are
  // discarded via the cancellation flag; only setState in async callbacks or
  // scheduled tasks (never synchronously within the effect body).
  React.useEffect(() => {
    if (!open || !selectedRoomTypeId || !rangeKey || !range || nights <= 0) {
      if (pricingKey !== null) {
        // Clear selection asynchronously so we don't setState during render.
        const t = setTimeout(() => setPricingKey(null), 0);
        return () => clearTimeout(t);
      }
      return;
    }

    const key = `${selectedRoomTypeId}_${rangeKey}`;
    if (pricingKey === key) return;

    const checkInStr = `${range.start.year}-${String(range.start.month).padStart(2, "0")}-${String(range.start.day).padStart(2, "0")}`;
    const checkOutStr = `${range.end.year}-${String(range.end.month).padStart(2, "0")}-${String(range.end.day).padStart(2, "0")}`;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setPricingKey(key);
        setPricingLoading(true);
      }
    });

    getResolvedRatesForBooking(selectedRoomTypeId, checkInStr, checkOutStr)
      .then((r) => {
        if (cancelled) return;
        setResolvedPricing(r.success ? r.data : null);
      })
      .catch(() => {
        if (!cancelled) setResolvedPricing(null);
      })
      .finally(() => {
        if (!cancelled) setPricingLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // pricingKey intentional — only re-fetch when the selection itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedRoomTypeId, rangeKey, nights]);

  // Clear stale pricing as soon as inputs change (derived reset)
  const effectivePricing =
    resolvedPricing && pricingKey === `${selectedRoomTypeId}_${rangeKey}`
      ? resolvedPricing
      : null;

  const roomRate = effectivePricing?.avgNightlyRate ?? selectedRoomType?.base_price ?? 0;
  const subtotal = effectivePricing?.subtotal ?? roomRate * nights;
  const taxAmount = effectivePricing?.taxAmount ?? 0;
  const taxRate = effectivePricing?.taxRate ?? 0;
  const totalAmount = effectivePricing?.totalAmount ?? subtotal;

  // ── Prefill / Reset ──────────────────────────────────────────────
  const initialised = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      initialised.current = false;
      return;
    }
    if (initialised.current) return;
    initialised.current = true;
    // Defer state application until after the current render to comply
    // with react-hooks/set-state-in-effect.
    const id = requestAnimationFrame(() => {
      if (prefillRoomTypeId) setSelectedRoomTypeId(prefillRoomTypeId);
      if (prefillCheckIn && prefillCheckOut) {
        setRange({
          start: dateToCalendarDate(prefillCheckIn),
          end: dateToCalendarDate(prefillCheckOut),
        });
        if (prefillRoomTypeId) setStep(2);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [open, prefillRoomTypeId, prefillCheckIn, prefillCheckOut]);

  function resetForm() {
    setStep(1);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setNationality("Ghana");
    setSelectedRoomTypeId("");
    setRange(null);
    setAdults(1);
    setChildren(0);
    setSource("walk_in");
    setEstimatedArrival("");
    setSpecialRequests("");
    setInternalNotes("");
    setPaymentPreference("pay_at_checkin");
    setErrors({});
    setResolvedPricing(null);
  }

  function handleClose(openState: boolean) {
    if (!openState) resetForm();
    onOpenChange(openState);
  }

  const countryDialCode = getCountryDialCode(nationality) || "+233";

  /** Nationality suggests a dial code, but never rewrites a real guest number. */
  function handleNationalityChange(countryName: string) {
    const nextDialCode = getCountryDialCode(countryName) || "+233";
    setNationality(countryName);
    setGuestPhone((previous) => {
      const trimmed = previous.trim();
      return !trimmed || /^\+\d{1,4}$/.test(trimmed) ? `${nextDialCode} ` : previous;
    });
  }

  // ── Submit ─────────────────────────────────────────────────────
  async function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!guestName.trim()) newErrors.guestName = "Required";
    if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      newErrors.guestEmail = "Invalid email";
    }
    if (!selectedRoomTypeId) newErrors.roomTypeId = "Select a room type";
    if (!range) newErrors.dates = "Select check-in and check-out";
    else if (nights <= 0) newErrors.dates = "Check-out must be after check-in";
    if (!source) newErrors.source = "Required";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast.danger("Please complete the highlighted fields");
      return;
    }
    if (!range) return;

    setLoading(true);

    const toStr = (cd: CalendarDate) =>
      `${cd.year}-${String(cd.month).padStart(2, "0")}-${String(cd.day).padStart(2, "0")}`;

    const formData: NewBookingInput = {
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim() || undefined,
      guestPhone: guestPhone.trim() || undefined,
      nationality: nationality || undefined,
      roomTypeId: selectedRoomTypeId,
      checkIn: toStr(range.start),
      checkOut: toStr(range.end),
      adults,
      children,
      roomRate,
      subtotal,
      taxAmount,
      totalAmount,
      estimatedArrival: estimatedArrival || undefined,
      specialRequests: specialRequests.trim() || undefined,
      source: source as NewBookingInput["source"],
      paymentPreference,
      internalNotes: internalNotes.trim() || undefined,
    };

    const result = await createBooking(formData);
    setLoading(false);

    if (result.success) {
      toast.success(`Reservation ${result.reference} created`);
      onReservationCreated?.({ bookingId: result.bookingId, reference: result.reference, payNow: paymentPreference === "pay_now" });
      handleClose(false);
    } else {
      if (result.fieldErrors) {
        const fieldErrors: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(result.fieldErrors)) {
          fieldErrors[key] = msgs[0];
        }
        setErrors(fieldErrors);
      }
      toast.danger(result.error || "Failed to create reservation");
    }
  }

  const step1Valid = guestName.trim().length > 0;
  const step2Valid =
    selectedRoomTypeId.length > 0 &&
    range != null &&
    nights > 0 &&
    (source?.length ?? 0) > 0;

  const todayCd = today(getLocalTimeZone());
  const pickerCheckIn = range
    ? `${range.start.year}-${String(range.start.month).padStart(2, "0")}-${String(range.start.day).padStart(2, "0")}`
    : `${todayCd.year}-${String(todayCd.month).padStart(2, "0")}-${String(todayCd.day).padStart(2, "0")}`;
  const pickerCheckOut = range
    ? `${range.end.year}-${String(range.end.month).padStart(2, "0")}-${String(range.end.day).padStart(2, "0")}`
    : `${todayCd.add({ days: 1 }).year}-${String(todayCd.add({ days: 1 }).month).padStart(2, "0")}-${String(todayCd.add({ days: 1 }).day).padStart(2, "0")}`;

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={handleClose}
      variant="opaque"
      isDismissable={!loading}
    >
      <Modal.Container
        placement="top"
        size="lg"
        scroll="inside"
        className="items-start p-0 sm:items-center sm:p-4"
      >
        <div ref={dialogRef} className="contents">
        <Modal.Dialog className="flex h-[var(--reservation-vvh,100dvh)] max-h-[var(--reservation-vvh,100dvh)] w-full flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[94dvh] sm:w-full sm:max-w-3xl sm:rounded-2xl">
          <Modal.CloseTrigger className="right-3 top-3 rounded-full border border-border/70 bg-background text-foreground shadow-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary sm:right-4 sm:top-4" />

          <Modal.Header className="shrink-0 border-b border-border/40 px-4 pb-1 pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:px-6 sm:pt-3">
            <Modal.Heading className="text-base sm:text-lg font-semibold">
              New reservation
            </Modal.Heading>
          </Modal.Header>

          {/* Segmented step tabs */}
          <div className="shrink-0 px-4 pt-1 sm:px-6 sm:pt-2">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {["Guest", "Stay details"].map((label, i) => {
                const stepNum = i + 1;
                const isActive = step === stepNum;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (stepNum === 1) setStep(1);
                      else if (step1Valid) setStep(2);
                    }}
                    disabled={stepNum === 2 && !step1Valid}
                    className={cn(
                      "h-8 rounded-md text-xs font-medium transition-all",
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <Modal.Body className="native-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-5">
            {step === 1 && (
              <div className="space-y-4">
                <SectionHeading icon={User} title="Guest" sub="Primary contact for this reservation" />

                <TextField isInvalid={!!errors.guestName} fullWidth isRequired>
                  <Label>Full name</Label>
                  <Input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Ama Serwaa"
                    autoComplete="name"
                  />
                  {errors.guestName && <FieldError>{errors.guestName}</FieldError>}
                </TextField>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField isInvalid={!!errors.guestEmail} fullWidth>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="ama@example.com"
                    />
                    {errors.guestEmail ? (
                      <FieldError>{errors.guestEmail}</FieldError>
                    ) : (
                      <Description>Optional · confirmations sent here</Description>
                    )}
                  </TextField>

                  <TextField fullWidth>
                    <Label>Phone number</Label>
                    <Input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      onFocus={() => { if (!guestPhone.trim()) setGuestPhone(`${countryDialCode} `); }}
                      placeholder={`${countryDialCode} 24 123 4567`}
                      inputMode="tel"
                      autoComplete="tel"
                    />
                    <Description>International format · prefix follows nationality until number entered</Description>
                  </TextField>
                </div>

                <div>
                  <Label className="mb-1.5 block text-sm font-medium text-foreground">Nationality</Label>
                  <CountrySelect value={nationality} onChange={handleNationalityChange} placeholder="Search country" />
                  <p className="mt-1.5 text-xs text-muted-foreground">Defaults to Ghana · updates empty phone prefix</p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                {/* Stay dates */}
                <div className="space-y-3">
                  <SectionHeading icon={CalendarDays} title="Dates" sub="Check-in and check-out" />

                  <BookingDateRangePicker
                    checkIn={pickerCheckIn}
                    checkOut={pickerCheckOut}
                    onDatesChange={(checkIn, checkOut) => {
                      const parse = (value: string) => { const [y, m, d] = value.split("-").map(Number); return new CalendarDate(y, m, d); };
                      setRange({ start: parse(checkIn), end: parse(checkOut) });
                    }}
                    variant="card"
                    className="w-full"
                  />

                  {range && nights > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <span className="text-xs text-muted-foreground">Stay:</span>
                      <span className="text-xs font-semibold text-foreground tabular-nums">
                        {formatStay(range.start)} → {formatStay(range.end)}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-semibold">
                        {nights} night{nights !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                  {errors.dates && (
                    <p className="text-xs text-destructive">{errors.dates}</p>
                  )}
                </div>

                {/* Room type + occupancy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label>Room type <span className="text-destructive">*</span></Label><span className="text-[11px] text-muted-foreground">Select available category</span></div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Room types">
                    {roomTypeOptions.map((rt) => {
                      const selected = selectedRoomTypeId === rt.id;
                      const typeRooms = rooms.filter((room) => room.roomTypeId === rt.id && room.status === "available");
                      return <button key={rt.id} type="button" role="radio" aria-checked={selected} onClick={() => setSelectedRoomTypeId(rt.id)} className={cn("group flex min-h-20 items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", selected ? "border-primary bg-primary/8 ring-1 ring-primary/25" : "border-border bg-background hover:border-foreground/25 hover:bg-muted/35")}>
                        <span className="flex items-center gap-2 text-foreground"><Building2 className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} /><span><span className="block text-sm font-bold text-foreground">{rt.name}</span><span className="block text-[11px] font-medium text-muted-foreground">{typeRooms.length ? `${typeRooms.length} room${typeRooms.length === 1 ? "" : "s"} in inventory · assignment checked at save` : "Assignment checked at save"}</span></span></span>
                        <span className="text-xs font-bold tabular-nums text-foreground">{rt.base_price != null ? `${formatCurrency(rt.base_price, currency)}/night` : "Available"}</span>
                      </button>;
                    })}
                  </div>
                  {errors.roomTypeId && <FieldError>{errors.roomTypeId}</FieldError>}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
                  <GuestPickerPopover adults={adults} childrenCount={children} rooms={1} onAdultsChange={setAdults} onChildrenChange={setChildren} onRoomsChange={() => undefined} className="w-full" />

                  {/* Source */}
                  <Select
                  fullWidth
                  variant="secondary"
                  placeholder="Select source"
                  value={source}
                  onChange={(v) => setSource(String(v))}
                  isInvalid={!!errors.source}
                >
                  <Label>
                    Booking source <span className="text-destructive">*</span>
                  </Label>
                  <Select.Trigger className="min-h-12 border-border bg-background shadow-sm hover:border-primary/40">
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
                </div>

                {/* Arrival time + special requests */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField fullWidth>
                    <Label>Estimated arrival</Label>
                    <Input
                      type="time"
                      value={estimatedArrival}
                      onChange={(e) => setEstimatedArrival(e.target.value)}
                    />
                    <Description>Optional · defaults to standard check-in time</Description>
                  </TextField>

                  <Select fullWidth variant="secondary" value={paymentPreference} onChange={(value) => setPaymentPreference(value as "pay_now" | "pay_at_checkin")}>
                    <Label>Payment preference</Label>
                    <Select.Trigger className="min-h-11 border-border bg-background shadow-sm hover:border-foreground/25"><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover><ListBox><ListBox.Item id="pay_at_checkin" textValue="Pay at check-in">Pay at check-in</ListBox.Item><ListBox.Item id="pay_now" textValue="Pay now">Pay now</ListBox.Item></ListBox></Select.Popover>
                    <Description>Recorded with reservation</Description>
                  </Select>

                  <TextField fullWidth className="sm:col-span-2">
                    <Label>Special requests</Label>
                    <TextArea
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      placeholder="Late check-in, extra pillows, ground floor…"
                      rows={2}
                    />
                  </TextField>

                  <TextField fullWidth>
                    <Label>Internal notes</Label>
                    <TextArea
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      placeholder="Staff-only notes · never shown to guest"
                      rows={2}
                    />
                  </TextField>
                </div>

              </div>
            )}
          </Modal.Body>

          <Modal.Footer className="shrink-0 flex-col gap-2 border-t border-border/40 bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 sm:px-6 sm:pb-3">
            {/* Pricing summary */}
            {step === 2 && selectedRoomTypeId && range && nights > 0 && (
              <div className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3">
                {pricingLoading ? (
                  <div className="flex items-center justify-center gap-2 py-1">
                    <div className="size-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    <span className="text-xs text-muted-foreground">Calculating rates…</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {formatCurrency(roomRate, currency)} × {nights} {nights === 1 ? "night" : "nights"}
                      </span>
                      <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Tax {taxRate.toFixed(2).replace(/\.00$/, "")}%</span>
                        <span className="tabular-nums">{formatCurrency(taxAmount, currency)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between border-t border-border/50 pt-2">
                      <span className="text-sm font-semibold text-foreground">Total</span>
                      <span className="text-base font-bold text-primary tabular-nums">
                        {formatCurrency(totalAmount, currency)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex w-full items-center justify-between gap-3">
              {step > 1 ? (
                <Button variant="ghost" size="sm" onPress={() => setStep(1)} isDisabled={loading}>
                  Back
                </Button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onPress={() => handleClose(false)} isDisabled={loading}>
                  Cancel
                </Button>
                {step < 2 ? (
                  <Button
                    size="sm"
                    onPress={() => setStep(2)}
                    isDisabled={!step1Valid}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[110px]"
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onPress={handleSubmit}
                    isDisabled={loading || !step1Valid || !step2Valid}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[130px]"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                        Creating…
                      </span>
                    ) : (
                      "Create reservation"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </Modal.Footer>
        </Modal.Dialog>
        </div>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function formatStay(cd: CalendarDate): string {
  const d = new Date(cd.year, cd.month - 1, cd.day);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
