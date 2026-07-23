"use client";

import * as React from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "@heroui/react";
import {
  CalendarIcon,
  ChevronDown,
  Search,
  User,
  Plus,
  Building2,
  Clock,
  MessageSquareText,
  Wallet,
  Banknote,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { createBooking, type NewBookingInput } from "@/app/actions/bookings";
import { getResolvedRatesForBooking, type StaffResolvedPricing } from "@/app/actions/pricing";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface RoomTypeOption {
  id: string;
  name: string;
  base_price: number;
}

interface NewBookingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomTypes: { id: string; name: string }[];
  currency: string;
  /** Pre-fill room type ID (from calendar click-to-create) */
  prefillRoomTypeId?: string;
  /** Pre-fill check-in date (from calendar click-to-create) */
  prefillCheckIn?: Date;
  /** Pre-fill check-out date (from calendar click-to-create) */
  prefillCheckOut?: Date;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

const SOURCE_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "manual", label: "Manual" },
  { value: "phone", label: "Phone" },
  { value: "walk_in", label: "Walk-in" },
] as const;

// ── Component ──────────────────────────────────────────────────────

export function NewBookingSheet({
  open,
  onOpenChange,
  roomTypes: roomTypeOptions,
  currency,
  prefillRoomTypeId,
  prefillCheckIn,
  prefillCheckOut,
}: NewBookingSheetProps) {
  // ── Form State ─────────────────────────────────────────────────
  const [step, setStep] = React.useState(1);
  const [loading, setLoading] = React.useState(false);

  // Apply prefill values when they change or sheet opens
  const initialised = React.useRef(false);
  React.useEffect(() => {
    if (open && !initialised.current) {
      initialised.current = true;
      if (prefillRoomTypeId) setSelectedRoomTypeId(prefillRoomTypeId);
      if (prefillCheckIn || prefillCheckOut) {
        setDateRange({
          from: prefillCheckIn || undefined,
          to: prefillCheckOut || undefined,
        });
        // Jump to step 3 if both room and dates are pre-filled
        if (prefillRoomTypeId && prefillCheckIn && prefillCheckOut) {
          setStep(2);
        }
      }
    }
    if (!open) {
      initialised.current = false;
    }
  }, [open, prefillRoomTypeId, prefillCheckIn, prefillCheckOut]);

  // Guest
  const [guestName, setGuestName] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");

  // Room & Dates
  const [selectedRoomTypeId, setSelectedRoomTypeId] = React.useState("");
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [adults, setAdults] = React.useState(2);
  const [children, setChildren] = React.useState(0);

  // Details
  const [estimatedArrival, setEstimatedArrival] = React.useState("");
  const [specialRequests, setSpecialRequests] = React.useState("");
  const [source, setSource] = React.useState<string>("walk_in");
  const [internalNotes, setInternalNotes] = React.useState("");

  // Payment
  const [paymentPreference, setPaymentPreference] = React.useState<"pay_now" | "pay_at_checkin">("pay_at_checkin");

  // Validation errors
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // ── Derived ────────────────────────────────────────────────────
  const nights = dateRange?.from && dateRange?.to
    ? differenceInDays(dateRange.to, dateRange.from)
    : 0;

  const selectedRoomType = roomTypeOptions.find(
    (rt): rt is RoomTypeOption => rt.id === selectedRoomTypeId && "base_price" in rt
  ) as RoomTypeOption | undefined;

  // ── Override-aware pricing ─────────────────────────────────────
  // Fetches live pricing from the server action whenever room + dates change.
  // Falls back to base_price * nights only while loading or before selection.
  const [resolvedPricing, setResolvedPricing] = React.useState<StaffResolvedPricing | null>(null);
  const [pricingLoading, setPricingLoading] = React.useState(false);

  React.useEffect(() => {
    const checkIn = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
    const checkOut = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;

    if (!selectedRoomTypeId || !checkIn || !checkOut || nights <= 0) {
      setResolvedPricing(null);
      return;
    }

    let cancelled = false;
    setPricingLoading(true);

    getResolvedRatesForBooking(selectedRoomTypeId, checkIn, checkOut)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setResolvedPricing(result.data);
        } else {
          // Server action failed — clear so fallback is used
          setResolvedPricing(null);
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedPricing(null);
      })
      .finally(() => {
        if (!cancelled) setPricingLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedRoomTypeId, dateRange?.from, dateRange?.to, nights]);

  // Pricing values — use resolved data when available, fall back to base
  const fallbackRate = selectedRoomType?.base_price ?? 0;
  const roomRate = resolvedPricing?.avgNightlyRate ?? fallbackRate;
  const subtotal = resolvedPricing?.subtotal ?? fallbackRate * nights;
  const taxRate = resolvedPricing?.taxRate ?? 0;
  const taxAmount = resolvedPricing?.taxAmount ?? 0;
  const totalAmount = resolvedPricing?.totalAmount ?? subtotal;

  // ── Reset form ─────────────────────────────────────────────────
  function resetForm() {
    setStep(1);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setSelectedRoomTypeId("");
    setDateRange(undefined);
    setAdults(2);
    setChildren(0);
    setEstimatedArrival("");
    setSpecialRequests("");
    setSource("walk_in");
    setInternalNotes("");
    setPaymentPreference("pay_at_checkin");
    setErrors({});
    setResolvedPricing(null);
  }

  function handleClose(open: boolean) {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  }

  // ── Submit ─────────────────────────────────────────────────────
  async function handleSubmit() {
    // Validate
    const newErrors: Record<string, string> = {};
    if (!guestName.trim()) newErrors.guestName = "Guest name is required";
    if (!selectedRoomTypeId) newErrors.roomTypeId = "Room type is required";
    if (!dateRange?.from) newErrors.checkIn = "Check-in date is required";
    if (!dateRange?.to) newErrors.checkOut = "Check-out date is required";
    if (nights <= 0) newErrors.dates = "Check-out must be after check-in";
    if (!source) newErrors.source = "Source is required";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setLoading(true);

    const formData: NewBookingInput = {
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim() || undefined,
      guestPhone: guestPhone.trim() || undefined,
      roomTypeId: selectedRoomTypeId,
      checkIn: format(dateRange!.from!, "yyyy-MM-dd"),
      checkOut: format(dateRange!.to!, "yyyy-MM-dd"),
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
      toast.success(`Reservation ${result.reference} created`, {
        description: `${guestName} · ${format(dateRange!.from!, "MMM dd")} - ${format(dateRange!.to!, "MMM dd, yyyy")}`,
      });
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

  // ── Can proceed to next step ───────────────────────────────────
  const step1Valid = guestName.trim().length > 0;
  const step2Valid = selectedRoomTypeId.length > 0 && dateRange?.from != null && dateRange?.to != null && nights > 0;
  const step3Valid = source.length > 0;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 gap-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-b border-border/40">
          <SheetTitle className="text-lg">New Reservation</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Create a manual reservation for walk-in, phone, or assisted reservations.
          </SheetDescription>
        </SheetHeader>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border/20 bg-muted/20">
          {[1, 2, 3, 4].map((s) => (
            <React.Fragment key={s}>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "size-6 rounded-full flex items-center justify-center text-[11px] font-medium transition-colors",
                    step === s
                      ? "bg-foreground text-background"
                      : step > s
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {step > s ? "✓" : s}
                </div>
                <span
                  className={cn(
                    "text-xs hidden sm:inline",
                    step >= s ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {["Guest", "Room", "Details", "Payment"][s - 1]}
                </span>
              </div>
              {s < 4 && <div className="flex-1 h-px bg-border/50" />}
            </React.Fragment>
          ))}
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* ═══ Step 1: Guest ═══ */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  Find or create guest
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Full name
                    </label>
                    <Input
                      placeholder="Guest's full name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className={cn(
                        "h-9 rounded-xl",
                        errors.guestName && "border-destructive"
                      )}
                    />
                    {errors.guestName && (
                      <p className="text-xs text-destructive mt-1">{errors.guestName}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Email
                      </label>
                      <Input
                        type="email"
                        placeholder="guest@example.com"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className="h-9 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Phone
                      </label>
                      <Input
                        type="tel"
                        placeholder="+233 XX XXX XXXX"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        className="h-9 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Step 2: Room & Dates ═══ */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  Room & dates
                </h3>
                <div className="space-y-4">
                  {/* Room Type */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Room type
                    </label>
                    <select
                      value={selectedRoomTypeId}
                      onChange={(e) => setSelectedRoomTypeId(e.target.value)}
                      className={cn(
                        "h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                        errors.roomTypeId && "border-destructive"
                      )}
                    >
                      <option value="">Select room type...</option>
                      {roomTypeOptions.map((rt) => (
                        <option key={rt.id} value={rt.id}>
                          {rt.name}
                          {"base_price" in rt
                            ? ` — ${formatCurrency((rt as RoomTypeOption).base_price, currency)}/night`
                            : ""}
                        </option>
                      ))}
                    </select>
                    {errors.roomTypeId && (
                      <p className="text-xs text-destructive mt-1">{errors.roomTypeId}</p>
                    )}
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Check-in / Check-out
                    </label>
                    <div className="border border-border/50 rounded-xl p-2">
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={setDateRange}
                        numberOfMonths={1}
                        className="mx-auto"
                      />
                    </div>
                    {dateRange?.from && dateRange?.to && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <CalendarIcon className="size-3" />
                        <span>
                          {format(dateRange.from, "MMM dd")} → {format(dateRange.to, "MMM dd, yyyy")}
                        </span>
                        <span className="font-medium text-foreground/70">
                          · {nights} night{nights > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    {errors.dates && (
                      <p className="text-xs text-destructive mt-1">{errors.dates}</p>
                    )}
                  </div>

                  {/* Occupancy */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Adults
                      </label>
                      <select
                        value={adults}
                        onChange={(e) => setAdults(Number(e.target.value))}
                        className="h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Children
                      </label>
                      <select
                        value={children}
                        onChange={(e) => setChildren(Number(e.target.value))}
                        className="h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {[0, 1, 2, 3].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Step 3: Details ═══ */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <MessageSquareText className="size-4 text-muted-foreground" />
                Details & preferences
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Estimated arrival time
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
                    <Input
                      type="time"
                      value={estimatedArrival}
                      onChange={(e) => setEstimatedArrival(e.target.value)}
                      className="h-9 pl-9 rounded-xl"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Special requests
                  </label>
                  <textarea
                    placeholder="e.g., Late check-in, extra pillows, ground floor..."
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Reservation source
                  </label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className={cn(
                      "h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      errors.source && "border-destructive"
                    )}
                  >
                    {SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {errors.source && (
                    <p className="text-xs text-destructive mt-1">{errors.source}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Internal notes
                  </label>
                  <textarea
                    placeholder="Staff-only notes about this reservation..."
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ═══ Step 4: Review & Payment ═══ */}
          {step === 4 && (
            <div className="space-y-5">
              <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <Wallet className="size-4 text-muted-foreground" />
                Review & payment
              </h3>

              {/* Summary Card */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Guest</span>
                  <span className="text-sm font-medium text-foreground">{guestName}</span>
                </div>
                <Separator className="opacity-40" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Room</span>
                  <span className="text-sm font-medium text-foreground">
                    {selectedRoomType?.name || "—"}
                  </span>
                </div>
                <Separator className="opacity-40" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Dates</span>
                  <span className="text-sm font-medium text-foreground">
                    {dateRange?.from && dateRange?.to
                      ? `${format(dateRange.from, "MMM dd")} → ${format(dateRange.to, "MMM dd")}`
                      : "—"}
                  </span>
                </div>
                <Separator className="opacity-40" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Nights</span>
                  <span className="text-sm font-medium text-foreground">{nights}</span>
                </div>
                <Separator className="opacity-40" />

                {/* Per-night breakdown — shown when overrides exist */}
                {pricingLoading ? (
                  <div className="flex items-center gap-2 py-1">
                    <span className="size-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                    <span className="text-xs text-muted-foreground">Fetching rates…</span>
                  </div>
                ) : resolvedPricing && resolvedPricing.nightlyRates.some((n) => n.source !== "base") ? (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Nightly rates</span>
                    {resolvedPricing.nightlyRates.map((n) => (
                      <div key={n.date} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{n.date}</span>
                        <div className="flex items-center gap-1.5">
                          {n.source !== "base" && (
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                              n.source === "daily"
                                ? "bg-blue-500/10 text-blue-600"
                                : "bg-amber-500/10 text-amber-600"
                            )}>
                              {n.source === "daily" ? "Daily" : (n.seasonName ?? "Season")}
                            </span>
                          )}
                          <span className="text-xs font-medium text-foreground">
                            {formatCurrency(n.price, currency)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <Separator className="opacity-40 mt-1" />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Room rate</span>
                    <span className="text-sm text-foreground">{formatCurrency(roomRate, currency)}/night</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Subtotal</span>
                  <span className="text-sm text-foreground">{formatCurrency(subtotal, currency)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Tax ({taxRate}%)</span>
                    <span className="text-sm text-foreground">{formatCurrency(taxAmount, currency)}</span>
                  </div>
                )}
                <Separator className="opacity-40" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Total</span>
                  <span className="text-base font-semibold text-foreground">
                    {formatCurrency(totalAmount, currency)}
                  </span>
                </div>
              </div>

              {/* Payment preference */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Payment preference
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentPreference("pay_at_checkin")}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all",
                      paymentPreference === "pay_at_checkin"
                        ? "border-foreground bg-foreground/5 text-foreground"
                        : "border-border/60 hover:border-border hover:bg-muted/30"
                    )}
                  >
                    <Banknote className="size-4" />
                    <span className="text-xs font-medium">Pay at Check-In</span>
                    <span className="text-[10px] text-muted-foreground">Cash or card at hotel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentPreference("pay_now")}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all",
                      paymentPreference === "pay_now"
                        ? "border-foreground bg-foreground/5 text-foreground"
                        : "border-border/60 hover:border-border hover:bg-muted/30"
                    )}
                  >
                    <Wallet className="size-4" />
                    <span className="text-xs font-medium">Pay Now</span>
                    <span className="text-[10px] text-muted-foreground">Paystack payment link</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-border/40 px-5 py-4 flex items-center justify-between gap-3 bg-background">
          <Button
            variant="ghost"
            size="sm"
            className="text-sm rounded-xl"
            onClick={() => handleClose(false)}
          >
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="text-sm rounded-xl"
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            )}
            {step < 4 ? (
              <Button
                size="sm"
                className="text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90"
                disabled={step === 1 ? !step1Valid : step === 2 ? !step2Valid : !step3Valid}
                onClick={() => setStep(step + 1)}
              >
                Continue
              </Button>
            ) : (
              <Button
                size="sm"
                className="text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90 min-w-[140px]"
                disabled={loading}
                onClick={handleSubmit}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="size-3.5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  "Create Reservation"
                )}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
