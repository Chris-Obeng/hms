"use client";

import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { toast, Modal, Button } from "@heroui/react";
import { CalendarDate } from "@internationalized/date";

import { BookingStepper, type WizardStep } from "@/components/bookings/booking-stepper";
import { DatesStep } from "@/components/bookings/steps/dates-step";
import { AvailabilityStep, type StaffCartLine } from "@/components/bookings/steps/availability-step";
import { SummaryStep, type SummaryPricing } from "@/components/bookings/steps/summary-step";
import { type StayRangeValue } from "@/components/ui/stay-range-calendar";
import { getCountryDialCode } from "@/components/ui/country-select";
import { type StaffAvailabilityRoom } from "@/app/actions/availability";
import { type GuestSearchResult } from "@/app/actions/customers";
import { getResolvedRatesForBooking } from "@/app/actions/pricing";
import { createBooking, createBookingGroup, type NewBookingInput } from "@/app/actions/bookings";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";

interface NewBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms?: { id: string; roomNumber: string; roomTypeId: string; status: string }[];
  currency: string;
  prefillRoomTypeId?: string;
  prefillRoomId?: string;
  prefillCheckIn?: Date;
  prefillCheckOut?: Date;
  prefillGuest?: GuestSearchResult | null;
  onReservationCreated?: (result: { bookingId: string; reference: string; payNow: boolean }) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROOM_TYPES = 4;

/** Wizard step order — index + 1 is the step number, used for the a11y announce. */
const STEP_TITLES = ["Dates", "Availability", "Summary"] as const;

function cdToStr(cd: CalendarDate): string {
  return `${cd.year}-${String(cd.month).padStart(2, "0")}-${String(cd.day).padStart(2, "0")}`;
}

function dateToCalendarDate(d: Date): CalendarDate {
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function NewBookingModal({
  open,
  onOpenChange,
  rooms,
  currency,
  prefillRoomTypeId,
  prefillRoomId,
  prefillCheckIn,
  prefillCheckOut,
  prefillGuest,
  onReservationCreated,
}: NewBookingModalProps) {
  const [step, setStep] = React.useState<WizardStep>(1);
  const [range, setRange] = React.useState<StayRangeValue | null>(null);
  const [prefillDismissed, setPrefillDismissed] = React.useState(false);
  const [cartLines, setCartLines] = React.useState<StaffCartLine[]>([]);

  // Guest — either a linked existing profile (guestId set) or manual new-guest fields.
  const [guestId, setGuestId] = React.useState<string | null>(null);
  const [guestName, setGuestName] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [nationality, setNationality] = React.useState("Ghana");
  const [appliedGuestPrefillKey, setAppliedGuestPrefillKey] = React.useState<string | null>(null);

  const guestPrefillKey = open && prefillGuest ? `${prefillGuest.id}` : null;
  if (guestPrefillKey !== appliedGuestPrefillKey) {
    setAppliedGuestPrefillKey(guestPrefillKey);
    if (prefillGuest && open) {
      setGuestId(prefillGuest.id);
      setGuestName(prefillGuest.fullName);
      setGuestEmail(prefillGuest.email ?? "");
      setGuestPhone(prefillGuest.phone ?? "");
      if (prefillGuest.nationality) setNationality(prefillGuest.nationality);
    }
  }

  const [source, setSource] = React.useState<string | null>("walk_in");
  const [paymentPreference, setPaymentPreference] = React.useState<"pay_now" | "pay_at_checkin">("pay_at_checkin");
  const [estimatedArrival, setEstimatedArrival] = React.useState("");
  const [specialRequests, setSpecialRequests] = React.useState("");
  const [internalNotes, setInternalNotes] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Move focus into the step body on each advance so keyboard/SR users land on the new content.
  const stepRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (open) stepRef.current?.focus();
  }, [step, open]);

  const prefillRange =
    prefillCheckIn && prefillCheckOut
      ? { start: dateToCalendarDate(prefillCheckIn), end: dateToCalendarDate(prefillCheckOut) }
      : null;
  const prefillActive = open && !prefillDismissed && Boolean(prefillRange);
  const effectiveRange = prefillActive ? prefillRange : range;
  const effectiveStep = prefillActive ? 2 : step;
  const checkIn = effectiveRange ? cdToStr(effectiveRange.start) : null;
  const checkOut = effectiveRange ? cdToStr(effectiveRange.end) : null;
  const nights = React.useMemo(() => {
    if (!effectiveRange) return 0;
    const s = new Date(effectiveRange.start.year, effectiveRange.start.month - 1, effectiveRange.start.day);
    const e = new Date(effectiveRange.end.year, effectiveRange.end.month - 1, effectiveRange.end.day);
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
  }, [effectiveRange]);

  const countryDialCode = getCountryDialCode(nationality) || "+233";

  // Mobile: pin the sheet to the visual viewport so the on-screen keyboard doesn't cover the footer.
  React.useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const sync = () => document.documentElement.style.setProperty("--reservation-vvh", `${vv.height}px`);
    sync();
    vv.addEventListener("resize", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      document.documentElement.style.removeProperty("--reservation-vvh");
    };
  }, [open]);

  function handleRangeChange(next: StayRangeValue | null) {
    const previousStayKey = checkIn && checkOut ? `${checkIn}_${checkOut}` : null;
    const nextCheckIn = next ? cdToStr(next.start) : null;
    const nextCheckOut = next ? cdToStr(next.end) : null;
    const nextStayKey = nextCheckIn && nextCheckOut ? `${nextCheckIn}_${nextCheckOut}` : null;

    if (previousStayKey !== null && nextStayKey === null) setCartLines([]);
    setPrefillDismissed(true);
    setRange(next);
  }

  function dismissPrefill() {
    if (prefillActive && prefillRange) setRange(prefillRange);
    setPrefillDismissed(true);
  }

  // ── Cart mutations ──
  const handleAddLine = React.useCallback((room: StaffAvailabilityRoom) => {
    setCartLines((prev) => {
      if (prev.some((l) => l.roomTypeId === room.roomTypeId)) return prev;
      if (prev.length >= MAX_ROOM_TYPES) {
        toast.danger(`You can add up to ${MAX_ROOM_TYPES} room types per reservation`);
        return prev;
      }
      return [
        ...prev,
        {
          roomTypeId: room.roomTypeId,
          room,
          adults: 1,
          children: 0,
          quantity: 1,
        },
      ];
    });
  }, []);

  const handleRemoveLine = React.useCallback((roomTypeId: string) => {
    setCartLines((prev) => prev.filter((l) => l.roomTypeId !== roomTypeId));
  }, []);

  const handleUpdateLine = React.useCallback(
    (roomTypeId: string, patch: Partial<Omit<StaffCartLine, "roomTypeId" | "room">>) => {
      setCartLines((prev) => prev.map((l) => (l.roomTypeId === roomTypeId ? { ...l, ...patch } : l)));
    },
    []
  );

  const handleSyncCart = React.useCallback((next: StaffCartLine[]) => {
    setCartLines(next);
  }, []);

  // ── Pricing: one query per cart line (others cached) ──
  const priceQueries = useQueries({
    queries: cartLines.map((line) => ({
      queryKey: ["staff-booking-price", line.roomTypeId, checkIn, checkOut] as const,
      queryFn: () => getResolvedRatesForBooking(line.roomTypeId, checkIn as string, checkOut as string),
      enabled: Boolean(checkIn && checkOut && line.roomTypeId),
    })),
  });

  // Build per-line pricing — all maths in minor units so ×qty sums reconcile to the charge.
  const linePricings: { line: StaffCartLine; pricing: SummaryPricing }[] = React.useMemo(() => {
    return cartLines.map((line, idx) => {
      const q = priceQueries[idx];
      const resolved = q?.data && q.data.success ? q.data.data : null;
      const unitSubtotalMinor = toMinor(resolved?.subtotal ?? line.room.subtotal ?? 0, currency);
      const unitTaxMinor = resolved ? toMinor(resolved.taxAmount ?? 0, currency) : 0;
      const taxRate = resolved?.taxRate ?? 0;
      const subtotalMinor = unitSubtotalMinor * line.quantity;
      const taxMinor = unitTaxMinor * line.quantity;
      const totalMinor = subtotalMinor + taxMinor;
      // Display avgNightly as per-line aggregate nightly rate (unit × qty)
      const unitAvgMinor = toMinor(resolved?.avgNightlyRate ?? line.room.avgNightly ?? 0, currency);
      const avgNightlyMinor = unitAvgMinor * line.quantity;
      return {
        line,
        pricing: {
          roomRate: fromMinor(avgNightlyMinor, currency),
          subtotal: fromMinor(subtotalMinor, currency),
          taxAmount: fromMinor(taxMinor, currency),
          taxRate,
          totalAmount: fromMinor(totalMinor, currency),
          loading: Boolean(q?.isFetching && !resolved),
        },
      };
    });
  }, [cartLines, priceQueries, currency]);

  // Grand totals in minor units so the sum equals the charge to the pesewa
  const grand = React.useMemo(() => {
    if (!linePricings.length) return { subtotal: 0, taxAmount: 0, totalAmount: 0, loading: false };
    const subtotalMinor = sumMinor(linePricings.map((p) => toMinor(p.pricing.subtotal, currency)));
    const taxMinor = sumMinor(linePricings.map((p) => toMinor(p.pricing.taxAmount, currency)));
    const loading = linePricings.some((p) => p.pricing.loading);
    return {
      subtotal: fromMinor(subtotalMinor, currency),
      taxAmount: fromMinor(taxMinor, currency),
      totalAmount: fromMinor(subtotalMinor + taxMinor, currency),
      loading,
    };
  }, [linePricings, currency]);

  const totalRooms = React.useMemo(() => cartLines.reduce((s, l) => s + l.quantity, 0), [cartLines]);

  const canReachStep2 = Boolean(effectiveRange && nights > 0);
  const canReachStep3 = canReachStep2 && cartLines.length > 0;
  const canReach = (s: WizardStep) => (s === 1 ? true : s === 2 ? canReachStep2 : canReachStep3);

  const emailValid = !guestEmail.trim() || EMAIL_RE.test(guestEmail.trim());
  const canSubmit = canReachStep3 && Boolean(guestName.trim()) && emailValid && Boolean(source) && !loading;

  function handleSelectGuest(g: GuestSearchResult) {
    setGuestId(g.id);
    setGuestName(g.fullName);
    setGuestEmail(g.email ?? "");
    setGuestPhone(g.phone ?? "");
    if (g.nationality) setNationality(g.nationality);
    setErrors((e) => ({ ...e, guestName: "", guestEmail: "" }));
  }

  function handleClearGuest() {
    setGuestId(null);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
  }

  // Keep an empty/prefix-only phone in sync with the selected country's dial code.
  function handleNationalityChange(next: string) {
    const prevCode = getCountryDialCode(nationality);
    const nextCode = getCountryDialCode(next);
    setNationality(next);
    if (nextCode && (!guestPhone.trim() || guestPhone.trim() === (prevCode ?? "").trim())) {
      setGuestPhone(`${nextCode} `);
    }
  }

  function resetState() {
    setStep(1);
    setRange(null);
    setPrefillDismissed(false);
    setCartLines([]);
    setGuestId(null);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setNationality("Ghana");
    setAppliedGuestPrefillKey(null);
    setSource("walk_in");
    setPaymentPreference("pay_at_checkin");
    setEstimatedArrival("");
    setSpecialRequests("");
    setInternalNotes("");
    setErrors({});
  }

  function handleClose(next: boolean) {
    if (loading) return;
    onOpenChange(next);
    if (!next) resetState();
  }

  async function handleSubmit() {
    const next: Record<string, string> = {};
    if (!guestName.trim()) next.guestName = "Guest name is required";
    if (!emailValid) next.guestEmail = "Enter a valid email";
    if (!source) next.source = "Select a source";
    if (!cartLines.length) next.cart = "Add at least one room";
    setErrors(next);
    if (Object.keys(next).length) {
      toast.danger("Complete the highlighted fields");
      return;
    }
    if (!checkIn || !checkOut || !cartLines.length) return;

    setLoading(true);

    // Single-room fast path: preserve the existing createBooking flow byte-for-byte
    // (including pinned physical room when the type matches the grid cell the desk opened from).
    if (cartLines.length === 1 && cartLines[0].quantity === 1) {
      const line = cartLines[0];
      const pricing = linePricings[0]?.pricing;
      const pinnedRoomId =
        prefillRoomId && rooms?.find((r) => r.id === prefillRoomId)?.roomTypeId === line.roomTypeId
          ? prefillRoomId
          : undefined;
      const input: NewBookingInput = {
        guestId: guestId ?? undefined,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim() || "",
        guestPhone: guestPhone.trim() || "",
        nationality: nationality || "",
        roomTypeId: line.roomTypeId,
        roomId: pinnedRoomId,
        checkIn,
        checkOut,
        adults: line.adults,
        children: line.children,
        roomRate: pricing?.roomRate ?? line.room.avgNightly,
        subtotal: pricing?.subtotal ?? line.room.subtotal,
        taxAmount: pricing?.taxAmount ?? 0,
        totalAmount: pricing?.totalAmount ?? line.room.subtotal,
        estimatedArrival: estimatedArrival || "",
        specialRequests: specialRequests.trim() || "",
        source: source as NewBookingInput["source"],
        paymentPreference,
        internalNotes: internalNotes.trim() || "",
      };

      const result = await createBooking(input);
      setLoading(false);

      if (result.success) {
        toast.success(`Reservation ${result.reference} created`);
        onReservationCreated?.({
          bookingId: result.bookingId,
          reference: result.reference,
          payNow: paymentPreference === "pay_now",
        });
        handleClose(false);
        return;
      }

      if (result.fieldErrors) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.fieldErrors)) mapped[k] = v[0] ?? "Invalid";
        setErrors(mapped);
      }
      toast.danger(result.error || "Failed to create reservation");
      return;
    }

    // Multi-room / multi-quantity: one group, one guest, N stays
    const groupInput = {
      guestId: guestId ?? undefined,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim() || "",
      guestPhone: guestPhone.trim() || "",
      nationality: nationality || "",
      checkIn,
      checkOut,
      source: source as NewBookingInput["source"],
      paymentPreference,
      estimatedArrival: estimatedArrival || "",
      specialRequests: specialRequests.trim() || "",
      internalNotes: internalNotes.trim() || "",
      lines: cartLines.map((l) => ({
        roomTypeId: l.roomTypeId,
        adults: l.adults,
        children: l.children,
        quantity: l.quantity,
      })),
    };

    const result = await createBookingGroup(groupInput);
    setLoading(false);

    if (result.success) {
      const roomsLabel = totalRooms === 1 ? "1 room" : `${totalRooms} rooms`;
      toast.success(`Reservation ${result.reference} · ${roomsLabel} created`);
      onReservationCreated?.({
        bookingId: result.groupId,
        reference: result.reference,
        payNow: paymentPreference === "pay_now",
      });
      handleClose(false);
      return;
    }

    if (result.fieldErrors) {
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(result.fieldErrors)) mapped[k] = v[0] ?? "Invalid";
      setErrors(mapped);
    }
    toast.danger(result.error || "Failed to create reservation");
  }

  function handlePrimary() {
    if (effectiveStep === 1 && canReachStep2) setStep(2);
    else if (effectiveStep === 2 && canReachStep3) {
      dismissPrefill();
      setStep(3);
    }
    else if (effectiveStep === 3) void handleSubmit();
  }

  function handleStepChange(next: WizardStep) {
    if (prefillActive && next !== 2) dismissPrefill();
    if (canReach(next)) setStep(next);
  }

  const primaryLabel = effectiveStep === 3 ? (loading ? "Creating…" : cartLines.length > 1 || totalRooms > 1 ? `Create reservation · ${totalRooms} rooms` : "Create reservation") : "Continue";
  const primaryDisabled = effectiveStep === 1 ? !canReachStep2 : effectiveStep === 2 ? !canReachStep3 : !canSubmit;

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={handleClose} variant="opaque" isDismissable={!loading}>
      <Modal.Container
        placement="top"
        size="lg"
        scroll="inside"
        className="items-start p-0 sm:items-center sm:p-4"
      >
        <Modal.Dialog className="reservation-modal flex h-[var(--reservation-vvh,100dvh)] max-h-[var(--reservation-vvh,100dvh)] w-full flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[96dvh] sm:w-full sm:max-w-4xl sm:rounded-2xl">
          <Modal.CloseTrigger className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-muted/80 text-foreground/80 shadow-xs transition-all hover:scale-105 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95" />
          <Modal.Header className="flex shrink-0 flex-col gap-2 border-b border-border/60 px-4 py-2 pr-12 sm:px-6 sm:pr-14">
            <div className="min-w-0">
              <Modal.Heading className="text-base font-semibold text-foreground">New reservation</Modal.Heading>
              {totalRooms > 0 && <p className="text-xs text-muted-foreground">{totalRooms} room{totalRooms !== 1 ? "s" : ""} · {cartLines.length} type{cartLines.length !== 1 ? "s" : ""}</p>}
            </div>
            <BookingStepper current={effectiveStep} canReach={canReach} onStepChange={handleStepChange} />
          </Modal.Header>

          <Modal.Body className="native-scroll flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
            <div aria-live="polite" role="status" className="sr-only">
              {`Step ${effectiveStep} of ${STEP_TITLES.length}: ${STEP_TITLES[effectiveStep - 1]}`}
            </div>
            <div ref={stepRef} tabIndex={-1} className="outline-none">
            {effectiveStep === 1 && (
              <DatesStep value={effectiveRange} onChange={handleRangeChange} nights={nights} error={errors.checkIn} />
            )}

            {effectiveStep === 2 && (
              <AvailabilityStep
                checkIn={checkIn}
                checkOut={checkOut}
                currency={currency}
                nights={nights}
                cartLines={cartLines}
                onAddLine={handleAddLine}
                onRemoveLine={handleRemoveLine}
                onUpdateLine={handleUpdateLine}
                onSyncCart={handleSyncCart}
                prefillRoomTypeId={prefillRoomTypeId}
              />
            )}

            {effectiveStep === 3 && checkIn && checkOut && cartLines.length > 0 && (
              <SummaryStep
                cartLines={cartLines}
                linePricings={linePricings}
                grand={grand}
                checkIn={checkIn}
                checkOut={checkOut}
                nights={nights}
                currency={currency}
                guestId={guestId}
                guestName={guestName}
                guestEmail={guestEmail}
                guestPhone={guestPhone}
                nationality={nationality}
                onGuestNameChange={setGuestName}
                onGuestEmailChange={setGuestEmail}
                onGuestPhoneChange={setGuestPhone}
                onNationalityChange={handleNationalityChange}
                onSelectGuest={handleSelectGuest}
                onClearGuest={handleClearGuest}
                source={source}
                onSourceChange={setSource}
                paymentPreference={paymentPreference}
                onPaymentPreferenceChange={setPaymentPreference}
                estimatedArrival={estimatedArrival}
                onEstimatedArrivalChange={setEstimatedArrival}
                specialRequests={specialRequests}
                onSpecialRequestsChange={setSpecialRequests}
                internalNotes={internalNotes}
                onInternalNotesChange={setInternalNotes}
                countryDialCode={countryDialCode}
                errors={errors}
              />
            )}
            </div>
          </Modal.Body>

          <Modal.Footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6">
            <div>
              {effectiveStep > 1 && (
                <Button
                  variant="tertiary"
                  onPress={() => {
                    if (prefillActive) dismissPrefill();
                    setStep((effectiveStep - 1) as WizardStep);
                  }}
                  isDisabled={loading}
                >
                  Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="hidden sm:inline-flex"
                onPress={() => handleClose(false)}
                isDisabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={handlePrimary}
                isDisabled={primaryDisabled}
                isPending={loading}
              >
                {primaryLabel}
              </Button>
            </div>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
