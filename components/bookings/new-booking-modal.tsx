"use client";

import * as React from "react";
import { format, differenceInDays } from "date-fns";
import { toast } from "@heroui/react";
import {
  CalendarIcon,
  ChevronDown,
  User,
  Plus,
  Minus,
  Building2,
  Clock,
  MessageSquareText,
  Wallet,
  Banknote,
} from "lucide-react";

import { Modal, Button, useOverlayState } from "@heroui/react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { CountrySelect } from "@/components/ui/country-select";
import type { DateRange } from "react-day-picker";
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
  roomTypes: { id: string; name: string }[];
  currency: string;
  prefillRoomTypeId?: string;
  prefillCheckIn?: Date;
  prefillCheckOut?: Date;
}

const SOURCE_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "manual", label: "Manual" },
  { value: "phone", label: "Phone" },
  { value: "walk_in", label: "Walk-in" },
] as const;



// ── Component ──────────────────────────────────────────────────────

export function NewBookingModal({
  open,
  onOpenChange,
  roomTypes: roomTypeOptions,
  currency,
  prefillRoomTypeId,
  prefillCheckIn,
  prefillCheckOut,
}: NewBookingModalProps) {
  // ── Form State ─────────────────────────────────────────────────
  const [step, setStep] = React.useState(1);
  const [loading, setLoading] = React.useState(false);

  // Apply prefill values when they change or modal opens
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
  const [nationality, setNationality] = React.useState("Ghana");

  // Room & Dates
  const [selectedRoomTypeId, setSelectedRoomTypeId] = React.useState("");
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [adults, setAdults] = React.useState(2);
  const [children, setChildren] = React.useState(0);

  // Details (now in step 2)
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

  // ── Pricing ─────────────────────────────────────────────────────
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
    setNationality("Ghana");
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

  // ── Validation ──────────────────────────────────────────────────
  const step1Valid = guestName.trim().length > 0;
  const step2Valid = selectedRoomTypeId.length > 0 && dateRange?.from != null && dateRange?.to != null && nights > 0 && source.length > 0;



  return (
    <Modal.Backdrop isOpen={open} onOpenChange={handleClose} variant="blur" isDismissable={!loading}>
      <Modal.Container placement="center" size="lg">
        <Modal.Dialog className="sm:max-w-2xl">
          <Modal.CloseTrigger />
          
          <Modal.Header className="border-b border-border/40 px-6 py-4">
            <div className="space-y-1">
              <Modal.Heading className="text-lg font-semibold">New Reservation</Modal.Heading>
              <p className="text-sm text-muted-foreground">
                Create a manual reservation for walk-in, phone, or assisted bookings.
              </p>
            </div>
          </Modal.Header>

          {/* Steps indicator */}
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border/30 bg-muted/10">
            {[1, 2].map((s) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "size-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                      step === s
                        ? "bg-primary text-primary-foreground"
                        : step > s
                        ? "bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/10"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {step > s ? "✓" : s}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium hidden sm:inline",
                      step >= s ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {["Guest Information", "Booking Details"][s - 1]}
                  </span>
                </div>
                {s < 2 && <div className="flex-1 h-px bg-border/40" />}
              </React.Fragment>
            ))}
          </div>

          <Modal.Body className="px-6 py-6">
            {/* ═══ Step 1: Guest Information ═══ */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <User className="size-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Guest Information</h3>
                    <p className="text-xs text-muted-foreground">Enter guest details for the reservation</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Full name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      placeholder="Guest's full name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className={cn(
                        "h-10",
                        errors.guestName && "border-destructive"
                      )}
                    />
                    {errors.guestName && (
                      <p className="text-xs text-destructive mt-1.5">{errors.guestName}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Email
                      </label>
                      <Input
                        type="email"
                        placeholder="guest@example.com"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Phone
                      </label>
                      <Input
                        type="tel"
                        placeholder="+233 XX XXX XXXX"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        className="h-10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Nationality
                    </label>
                    <CountrySelect
                      value={nationality}
                      onChange={setNationality}
                      placeholder="Select country..."
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">Optional - defaults to Ghana</p>
                  </div>
                </div>
              </div>
            )}



            {/* ═══ Step 2: Booking Details ═══ */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Building2 className="size-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Booking Details</h3>
                    <p className="text-xs text-muted-foreground">Room selection, dates, and preferences</p>
                  </div>
                </div>

                <div className="space-y-5">
                  {/* Room Type */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Room type <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={selectedRoomTypeId}
                      onChange={(e) => setSelectedRoomTypeId(e.target.value)}
                      className={cn(
                        "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
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
                      <p className="text-xs text-destructive mt-1.5">{errors.roomTypeId}</p>
                    )}
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Check-in / Check-out <span className="text-destructive">*</span>
                    </label>
                    <div className="border border-border rounded-lg p-3 bg-muted/5">
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={setDateRange}
                        numberOfMonths={1}
                        className="mx-auto"
                      />
                    </div>
                    {dateRange?.from && dateRange?.to && (
                      <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
                        <CalendarIcon className="size-4 text-primary" />
                        <span className="text-sm text-foreground">
                          {format(dateRange.from, "MMM dd")} → {format(dateRange.to, "MMM dd, yyyy")}
                        </span>
                        <span className="ml-auto font-semibold text-sm text-primary">
                          {nights} night{nights > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    {errors.dates && (
                      <p className="text-xs text-destructive mt-1.5">{errors.dates}</p>
                    )}
                  </div>

                  {/* Occupancy with simple stepper */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Adults
                      </label>
                      <div className="flex items-center gap-3 h-10 px-3 border border-border rounded-lg bg-background">
                        <button
                          type="button"
                          onClick={() => setAdults(Math.max(1, adults - 1))}
                          disabled={adults <= 1}
                          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus className="size-4 text-muted-foreground" />
                        </button>
                        <span className="flex-1 text-center font-semibold text-foreground">{adults}</span>
                        <button
                          type="button"
                          onClick={() => setAdults(Math.min(10, adults + 1))}
                          disabled={adults >= 10}
                          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Plus className="size-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Children
                      </label>
                      <div className="flex items-center gap-3 h-10 px-3 border border-border rounded-lg bg-background">
                        <button
                          type="button"
                          onClick={() => setChildren(Math.max(0, children - 1))}
                          disabled={children <= 0}
                          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus className="size-4 text-muted-foreground" />
                        </button>
                        <span className="flex-1 text-center font-semibold text-foreground">{children}</span>
                        <button
                          type="button"
                          onClick={() => setChildren(Math.min(8, children + 1))}
                          disabled={children >= 8}
                          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Plus className="size-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <Separator className="opacity-50" />

                  {/* Details Section */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Estimated arrival time
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="time"
                        value={estimatedArrival}
                        onChange={(e) => setEstimatedArrival(e.target.value)}
                        className="h-10 pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Special requests
                    </label>
                    <textarea
                      placeholder="e.g., Late check-in, extra pillows, ground floor..."
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 placeholder:text-muted-foreground resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Reservation source <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className={cn(
                        "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
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
                      <p className="text-xs text-destructive mt-1.5">{errors.source}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Internal notes
                    </label>
                    <textarea
                      placeholder="Staff-only notes about this reservation..."
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 placeholder:text-muted-foreground resize-none"
                    />
                  </div>

                  {/* Payment Preference */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-3 block">
                      Payment preference
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPaymentPreference("pay_at_checkin")}
                        className={cn(
                          "p-4 rounded-lg border-2 transition-all text-left",
                          paymentPreference === "pay_at_checkin"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-border/80 hover:bg-muted/5"
                        )}
                      >
                        <div className="font-medium text-sm">Pay at Check-in</div>
                        <div className="text-xs text-muted-foreground mt-1">Guest pays upon arrival</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentPreference("pay_now")}
                        className={cn(
                          "p-4 rounded-lg border-2 transition-all text-left",
                          paymentPreference === "pay_now"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-border/80 hover:bg-muted/5"
                        )}
                      >
                        <div className="font-medium text-sm">Pay Now</div>
                        <div className="text-xs text-muted-foreground mt-1">Record payment immediately</div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Modal.Body>



          <Modal.Footer className="border-t border-border/40 px-6 py-4 flex flex-col gap-4">
            {/* Real-time Pricing Display */}
            {selectedRoomTypeId && dateRange?.from && dateRange?.to && nights > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
                {pricingLoading ? (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <div className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-sm text-muted-foreground">Calculating rates...</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">Subtotal ({nights} × {formatCurrency(roomRate, currency)})</span>
                      <span className="text-sm font-medium">{formatCurrency(subtotal, currency)}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Tax ({(taxRate * 100).toFixed(0)}%)</span>
                        <span className="text-sm">{formatCurrency(taxAmount, currency)}</span>
                      </div>
                    )}
                    <Separator className="opacity-50 my-2" />
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-base font-semibold text-foreground">Total</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(totalAmount, currency)}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {step > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => setStep(step - 1)}
                    isDisabled={loading}
                  >
                    ← Previous
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => handleClose(false)}
                  isDisabled={loading}
                >
                  Cancel
                </Button>

                {step < 2 ? (
                  <Button
                    size="sm"
                    onPress={() => setStep(step + 1)}
                    isDisabled={loading || (step === 1 && !step1Valid)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Continue →
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onPress={handleSubmit}
                    isDisabled={loading || !step1Valid || !step2Valid}
                    className="min-w-[120px] bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="size-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        <span>Creating...</span>
                      </div>
                    ) : (
                      "Create Reservation"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
