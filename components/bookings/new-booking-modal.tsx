"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast, Modal, Button } from "@heroui/react";
import { CalendarDate } from "@internationalized/date";

import { BookingStepper, type WizardStep } from "@/components/bookings/booking-stepper";
import { DatesStep } from "@/components/bookings/steps/dates-step";
import { AvailabilityStep } from "@/components/bookings/steps/availability-step";
import { SummaryStep, type SummaryPricing } from "@/components/bookings/steps/summary-step";
import { type StayRangeValue } from "@/components/ui/stay-range-calendar";
import { getCountryDialCode } from "@/components/ui/country-select";
import { type StaffAvailabilityRoom } from "@/app/actions/availability";
import { type GuestSearchResult } from "@/app/actions/customers";
import { getResolvedRatesForBooking } from "@/app/actions/pricing";
import { createBooking, type NewBookingInput } from "@/app/actions/bookings";

interface NewBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms?: { id: string; roomNumber: string; roomTypeId: string; status: string }[];
  currency: string;
  prefillRoomTypeId?: string;
  prefillRoomId?: string;
  prefillCheckIn?: Date;
  prefillCheckOut?: Date;
  onReservationCreated?: (result: { bookingId: string; reference: string; payNow: boolean }) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  onReservationCreated,
}: NewBookingModalProps) {
  const [step, setStep] = React.useState<WizardStep>(1);
  const [range, setRange] = React.useState<StayRangeValue | null>(null);
  const [adults, setAdults] = React.useState(1);
  const [children, setChildren] = React.useState(0);
  const [selectedRoom, setSelectedRoom] = React.useState<StaffAvailabilityRoom | null>(null);

  // Guest — either a linked existing profile (guestId set) or manual new-guest fields.
  const [guestId, setGuestId] = React.useState<string | null>(null);
  const [guestName, setGuestName] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [nationality, setNationality] = React.useState("Ghana");

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

  const checkIn = range ? cdToStr(range.start) : null;
  const checkOut = range ? cdToStr(range.end) : null;
  const nights = React.useMemo(() => {
    if (!range) return 0;
    const s = new Date(range.start.year, range.start.month - 1, range.start.day);
    const e = new Date(range.end.year, range.end.month - 1, range.end.day);
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
  }, [range]);

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

  // Apply prefill once per open; dates jump the wizard straight to Availability.
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      prefilled.current = false;
      return;
    }
    if (prefilled.current) return;
    prefilled.current = true;
    if (prefillCheckIn && prefillCheckOut) {
      setRange({ start: dateToCalendarDate(prefillCheckIn), end: dateToCalendarDate(prefillCheckOut) });
      setStep(2);
    }
  }, [open, prefillCheckIn, prefillCheckOut]);

  // Changing the stay clears a room picked for the old dates (skips the initial/prefill set).
  const stayKey = checkIn && checkOut ? `${checkIn}_${checkOut}` : null;
  const prevStayKey = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (prevStayKey.current !== null && prevStayKey.current !== stayKey) {
      setSelectedRoom(null);
    }
    prevStayKey.current = stayKey;
  }, [stayKey]);

  // Override-resolved price for the picked type + stay (React Query — replaces the old manual effect).
  const roomTypeId = selectedRoom?.roomTypeId ?? null;
  const priceQuery = useQuery({
    queryKey: ["staff-booking-price", roomTypeId, checkIn, checkOut],
    queryFn: () => getResolvedRatesForBooking(roomTypeId as string, checkIn as string, checkOut as string),
    enabled: Boolean(roomTypeId && checkIn && checkOut),
  });
  const resolved = priceQuery.data && priceQuery.data.success ? priceQuery.data.data : null;
  const pricing: SummaryPricing = {
    roomRate: resolved?.avgNightlyRate ?? selectedRoom?.avgNightly ?? 0,
    subtotal: resolved?.subtotal ?? selectedRoom?.subtotal ?? 0,
    taxAmount: resolved?.taxAmount ?? 0,
    taxRate: resolved?.taxRate ?? 0,
    totalAmount: resolved?.totalAmount ?? selectedRoom?.subtotal ?? 0,
    loading: priceQuery.isFetching && !resolved,
  };

  const canReachStep2 = Boolean(range && nights > 0);
  const canReachStep3 = canReachStep2 && Boolean(selectedRoom);
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
    setAdults(1);
    setChildren(0);
    setSelectedRoom(null);
    setGuestId(null);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setNationality("Ghana");
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
    setErrors(next);
    if (Object.keys(next).length) {
      toast.danger("Complete the highlighted fields");
      return;
    }
    if (!selectedRoom || !checkIn || !checkOut) return;

    setLoading(true);
    // Pin the physical room only when the picked type still matches the cell the desk opened from.
    // If staff switched room type mid-wizard, omit it so the server auto-assigns within the type.
    const pinnedRoomId =
      prefillRoomId && rooms?.find((r) => r.id === prefillRoomId)?.roomTypeId === selectedRoom.roomTypeId
        ? prefillRoomId
        : undefined;
    const input: NewBookingInput = {
      guestId: guestId ?? undefined,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim() || "",
      guestPhone: guestPhone.trim() || "",
      nationality: nationality || "",
      roomTypeId: selectedRoom.roomTypeId,
      roomId: pinnedRoomId,
      checkIn,
      checkOut,
      adults,
      children,
      roomRate: pricing.roomRate,
      subtotal: pricing.subtotal,
      taxAmount: pricing.taxAmount,
      totalAmount: pricing.totalAmount,
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
  }

  function handlePrimary() {
    if (step === 1 && canReachStep2) setStep(2);
    else if (step === 2 && canReachStep3) setStep(3);
    else if (step === 3) void handleSubmit();
  }

  const primaryLabel = step === 3 ? (loading ? "Creating…" : "Create reservation") : "Continue";
  const primaryDisabled = step === 1 ? !canReachStep2 : step === 2 ? !canReachStep3 : !canSubmit;

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
            </div>
            <BookingStepper current={step} canReach={canReach} onStepChange={(s) => canReach(s) && setStep(s)} />
          </Modal.Header>

          <Modal.Body className="native-scroll flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
            <div aria-live="polite" role="status" className="sr-only">
              {`Step ${step} of ${STEP_TITLES.length}: ${STEP_TITLES[step - 1]}`}
            </div>
            <div ref={stepRef} tabIndex={-1} className="outline-none">
            {step === 1 && (
              <DatesStep value={range} onChange={setRange} nights={nights} error={errors.checkIn} />
            )}

            {step === 2 && (
              <AvailabilityStep
                checkIn={checkIn}
                checkOut={checkOut}
                currency={currency}
                nights={nights}
                adults={adults}
                childrenCount={children}
                onAdultsChange={setAdults}
                onChildrenChange={setChildren}
                selectedRoomTypeId={selectedRoom?.roomTypeId ?? null}
                onSelectRoom={setSelectedRoom}
                prefillRoomTypeId={prefillRoomTypeId}
              />
            )}

            {step === 3 && selectedRoom && checkIn && checkOut && (
              <SummaryStep
                room={selectedRoom}
                checkIn={checkIn}
                checkOut={checkOut}
                nights={nights}
                adults={adults}
                childrenCount={children}
                currency={currency}
                pricing={pricing}
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
              {step > 1 && (
                <Button variant="tertiary" onPress={() => setStep((step - 1) as WizardStep)} isDisabled={loading}>
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
