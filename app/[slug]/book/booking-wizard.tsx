"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "@heroui/react";
import { format, parseISO } from "date-fns";
import { COUNTRIES } from "@/lib/countries-data";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Images,
  Check,
  CreditCard,
  Landmark,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import {
  Button,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
  TextField,
} from "@heroui/react";
import { RoomGallery } from "@/components/booking/room-gallery";
import { formatCurrencyCompact } from "@/lib/format-currency";
import { BookingDateRangePicker } from "@/components/booking/booking-date-range-picker";
import { GuestPickerPopover } from "@/components/booking/guest-picker-popover";
import { NumericStepper } from "@/components/booking/numeric-stepper";
import {
  BookingProgress,
  type BookingStepId,
} from "@/components/booking/booking-progress";

interface RoomImage {
  url: string;
  caption: string;
  order: number;
}
interface Amenity {
  icon: string;
  label: string;
}
interface RoomType {
  id: string;
  name: string;
  basePrice: number;
  weekendPrice: number | null;
  shortDescription: string | null;
  bedConfiguration: string | null;
  maxAdults: number;
  maxChildren: number;
  images: RoomImage[];
  amenities: Amenity[];
}
interface Hotel {
  name: string;
  currency: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  cancellationPolicy: string | null;
  paymentPolicy: string;
  hasPaystack: boolean;
  /** Mirrors the server-side tax math so displayed totals match charged amounts. */
  taxEnabled: boolean;
  taxPercentage: number;
}
interface Props {
  slug: string;
  hotel: Hotel;
  roomTypes: RoomType[];
  initialRoomTypeId: string | null;
  initialCheckIn: string | null;
  initialCheckOut: string | null;
  initialAdults?: number;
  initialChildren?: number;
  initialRooms?: number;
}

function fmtDate(iso: string) {
  try {
    return format(parseISO(iso), "EEE, MMM d");
  } catch {
    return iso;
  }
}

export function BookingWizard({
  slug,
  hotel,
  roomTypes,
  initialRoomTypeId,
  initialCheckIn,
  initialCheckOut,
  initialAdults = 1,
  initialChildren = 0,
  initialRooms = 1,
}: Props) {
  const router = useRouter();
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split("T")[0];

  // Static trimmed dataset (Ghana/Nigeria first) — see scripts/generate-countries.mjs
  const countryList = COUNTRIES;

  const defaultDial =
    countryList.find((c) => c.name === "Ghana")?.dialCode ?? "+233";

  const [checkIn, setCheckIn] = React.useState(initialCheckIn ?? todayStr);
  const [checkOut, setCheckOut] = React.useState(initialCheckOut ?? tomorrowStr);
  const [adults, setAdults] = React.useState(Math.max(1, initialAdults));
  const [childrenCount, setChildrenCount] = React.useState(Math.max(0, initialChildren));
  const [roomsCount, setRoomsCount] = React.useState(Math.max(1, initialRooms));
  const [selectedRoom, setSelectedRoom] = React.useState<RoomType | null>(
    roomTypes.find((r) => r.id === initialRoomTypeId) ?? null
  );
  const [galleryRoom, setGalleryRoom] = React.useState<RoomType | null>(null);
  const [guestName, setGuestName] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState(`${defaultDial} `);
  const [nationality, setNationality] = React.useState("Ghana");
  const [showExtras, setShowExtras] = React.useState(false);
  const [specialRequests, setSpecialRequests] = React.useState("");
  const [paymentPref, setPaymentPref] = React.useState<"pay_now" | "pay_at_checkin">(
    hotel.paymentPolicy === "pay_later_only" ? "pay_at_checkin" : "pay_now"
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [section, setSection] = React.useState<BookingStepId>(1);
  const [touched, setTouched] = React.useState({ name: false, email: false, phone: false });
  /** Bumped to force an availability re-fetch after a room-taken rejection. */
  const [availNonce, setAvailNonce] = React.useState(0);
  const mainRef = React.useRef<HTMLElement>(null);

  const goToSection = React.useCallback((next: BookingStepId) => {
    setSection(next);
    // Keep focus/context after step change on mobile (OTA pattern)
    requestAnimationFrame(() => {
      mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  type ResolvedPrice = {
    displayPrice: number;
    subtotal: number | null;
    availableCount: number | null;
  };
  const [resolvedPrices, setResolvedPrices] = React.useState<
    Record<string, ResolvedPrice>
  >({});
  const [priceLoading, setPriceLoading] = React.useState(false);
  const [lastCheckIn, setLastCheckIn] = React.useState(checkIn);
  const [lastCheckOut, setLastCheckOut] = React.useState(checkOut);
  if (lastCheckIn !== checkIn || lastCheckOut !== checkOut) {
    setLastCheckIn(checkIn);
    setLastCheckOut(checkOut);
    if (checkIn && checkOut && checkOut > checkIn) {
      setPriceLoading(true);
    }
  }

  React.useEffect(() => {
    if (!checkIn || !checkOut || checkOut <= checkIn) return;
    let cancelled = false;

    const fetchAvailability = async () => {
      try {
        const r = await fetch(`/api/booking/${slug}/availability?check_in=${checkIn}&check_out=${checkOut}`);
        const json = r.ok ? await r.json() : null;
        if (cancelled || !json?.rooms) return;
        const map: Record<string, ResolvedPrice> = {};
        for (const room of json.rooms) {
          map[room.id] = {
            displayPrice: room.displayPrice ?? room.basePrice,
            subtotal: typeof room.subtotal === "number" ? room.subtotal : null,
            availableCount:
              typeof room.availableCount === "number" ? room.availableCount : null,
          };
        }
        setResolvedPrices(map);

        // Deselect if chosen room sold out for new dates
        setSelectedRoom((prev) => {
          if (!prev) return prev;
          const count = map[prev.id]?.availableCount;
          if (count === 0) return null;
          return prev;
        });
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    };

    fetchAvailability();

    return () => {
      cancelled = true;
    };
  }, [checkIn, checkOut, slug, availNonce]);

  const nights =
    checkIn && checkOut
      ? Math.max(
          1,
          Math.ceil(
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
          )
        )
      : 1;

  const resolvedSelected = selectedRoom ? resolvedPrices[selectedRoom.id] : null;
  const displayNightRate = resolvedSelected?.displayPrice ?? selectedRoom?.basePrice ?? 0;

  // Availability caps how many rooms of this type the party can actually book.
  const selectedAvail = selectedRoom
    ? resolvedPrices[selectedRoom.id]?.availableCount
    : null;
  const bookableRooms =
    selectedAvail != null ? Math.max(1, Math.min(roomsCount, selectedAvail)) : roomsCount;

  // Pricing mirrors POST /api/booking/[slug]/bookings exactly:
  // unit subtotal (override-resolved) × rooms, then tax on top.
  const unitSubtotal =
    resolvedSelected?.subtotal ?? (selectedRoom?.basePrice ?? 0) * nights;
  const subtotal = Math.round(unitSubtotal * bookableRooms * 100) / 100;
  const taxAmount = hotel.taxEnabled
    ? Math.round(subtotal * (hotel.taxPercentage / 100) * 100) / 100
    : 0;
  const total = subtotal + taxAmount;

  const fmt = (n: number) => formatCurrencyCompact(n, hotel.currency);

  const selectedAvailable = selectedAvail === null || selectedAvail === undefined || selectedAvail > 0;

  const step1Valid =
    !!selectedRoom &&
    !!checkIn &&
    !!checkOut &&
    checkOut > checkIn &&
    selectedAvailable;
  const nameOk = guestName.trim().length > 1;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());
  const phoneOk = guestPhone.replace(/\s/g, "").length >= 7;
  const step2Valid = nameOk && emailOk && phoneOk;

  const selectedCountryObj = countryList.find((c) => c.name === nationality);
  const selectedDialCode = selectedCountryObj?.dialCode || defaultDial;

  /** When nationality changes, swap dial prefix if phone empty or only held a prior dial code. */
  const handleNationalityChange = React.useCallback(
    (countryName: string) => {
      const next = countryList.find((c) => c.name === countryName);
      const nextDial = next?.dialCode || defaultDial;
      setNationality(countryName);
      setGuestPhone((prev) => {
        const trimmed = prev.trim();
        if (!trimmed) return `${nextDial} `;
        // Dial-only (e.g. "+233" or "+233 ")
        if (/^\+\d{1,4}\s*$/.test(trimmed)) return `${nextDial} `;

        // Longest-prefix match so +233 wins over +2
        const sortedDials = countryList
          .map((c) => c.dialCode)
          .filter((d): d is string => !!d)
          .sort((a, b) => b.length - a.length);
        const prevDial = sortedDials.find(
          (d) => trimmed === d || trimmed.startsWith(`${d} `) || trimmed.startsWith(d)
        );
        if (prevDial) {
          const rest = trimmed.slice(prevDial.length).replace(/^\s*/, "");
          return rest ? `${nextDial} ${rest}` : `${nextDial} `;
        }
        return prev;
      });
    },
    [countryList, defaultDial]
  );

  const phonePlaceholder = React.useMemo(() => {
    // Ghana-style sample for +233; generic otherwise
    if (selectedDialCode === "+233") return "+233 24 123 4567";
    if (selectedDialCode === "+234") return "+234 801 234 5678";
    if (selectedDialCode === "+1") return "+1 555 123 4567";
    if (selectedDialCode === "+44") return "+44 7700 900123";
    return `${selectedDialCode} …`;
  }, [selectedDialCode]);

  const sortedRooms = React.useMemo(() => {
    return [...roomTypes].sort((a, b) => {
      const aCount = resolvedPrices[a.id]?.availableCount;
      const bCount = resolvedPrices[b.id]?.availableCount;
      const aSold = aCount === 0 ? 1 : 0;
      const bSold = bCount === 0 ? 1 : 0;
      if (aSold !== bSold) return aSold - bSold;
      return 0;
    });
  }, [roomTypes, resolvedPrices]);

  async function handleConfirm() {
    if (!selectedRoom || !step1Valid || !step2Valid) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/booking/${slug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_type_id: selectedRoom.id,
          check_in: checkIn,
          check_out: checkOut,
          adults,
          children: childrenCount,
          rooms_count: bookableRooms,
          guest_name: guestName.trim(),
          guest_email: guestEmail.trim(),
          guest_phone: guestPhone.trim(),
          nationality: nationality || undefined,
          payment_preference: paymentPref,
          special_requests: specialRequests || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409) {
          // Room taken while checking out — honest copy, refresh live counts,
          // and send the guest back to step 1 with everything they typed kept.
          toast.danger(
            data?.error ??
              "That room was just taken for these dates. Pick another room or change your dates."
          );
          setAvailNonce((n) => n + 1);
          goToSection(1);
          return;
        }
        if (res.status === 410 || res.status === 400) {
          // Hold expired / validation / policy rejection — same recovery path.
          toast.danger(data?.error ?? "Reservation failed. Please check your details and try again.");
          if (res.status === 410) goToSection(1);
          return;
        }
        toast.danger(data?.error ?? "Reservation failed. Please check your details.");
        return;
      }
      if (data.paymentRequired && data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return;
      }
      router.push(`/${slug}/book/confirmation?reference=${data.reference}`);
    } catch {
      toast.danger("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canReachStep = React.useCallback(
    (step: BookingStepId) =>
      step === 1 ||
      (step === 2 && step1Valid) ||
      (step === 3 && step1Valid && step2Valid),
    [step1Valid, step2Valid]
  );

  const isStepComplete = React.useCallback(
    (step: BookingStepId) => {
      if (step === 1) return step1Valid && section > 1;
      if (step === 2) return step2Valid && section > 2;
      return false;
    },
    [step1Valid, step2Valid, section]
  );

  return (
    <>
      <div className="min-h-[100dvh] flex flex-col bg-[var(--bk-bg)]">
        {/*
          Sticky chrome stack (industry standard for hotel OTA checkout):
          1) Brand bar — hotel identity + exit only (never put funnel steps here)
          2) Progress strip — sticky under brand, always visible while scrolling
        */}
        <div className="sticky top-0 z-40">
          <header className="booking-header booking-safe-x h-12 pt-[env(safe-area-inset-top)] flex items-center justify-between gap-2 sm:gap-3">
            <Link
              href={`/${slug}`}
              className="flex items-center gap-2 min-w-0 group touch-manipulation max-w-[70%]"
            >
              <ArrowLeft className="size-4 text-[var(--bk-muted)] group-hover:text-[var(--bk-ink)] transition-colors shrink-0" />
              <span className="booking-heading text-sm sm:text-base text-[var(--bk-ink)] truncate">
                {hotel.name}
              </span>
            </Link>
            <div className="booking-trust hidden sm:inline-flex shrink-0">
              <ShieldCheck className="size-3.5 text-[var(--bk-success)]" strokeWidth={1.75} />
              Direct booking
            </div>
            <span className="sm:hidden text-[10px] font-semibold uppercase tracking-wider text-[var(--bk-muted)] shrink-0">
              Secure
            </span>
          </header>

          <BookingProgress
            current={section}
            canReach={canReachStep}
            isComplete={isStepComplete}
            onStepChange={goToSection}
          />
        </div>

        {/* Main */}
        <main
          ref={mainRef}
          className="flex-1 w-full max-w-2xl mx-auto booking-safe-x pt-5 sm:pt-8 md:pt-10 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:pb-12"
        >
          <div className="mb-5 sm:mb-8">
            <h1 className="booking-heading text-[1.65rem] leading-tight sm:text-3xl md:text-4xl text-[var(--bk-ink)] text-balance">
              {section === 1 && "Choose your stay"}
              {section === 2 && "Guest details"}
              {section === 3 && "Review & confirm"}
            </h1>
            <p className="text-sm text-[var(--bk-muted)] mt-1.5 max-w-prose">
              {section === 1 && "Select dates and a room to continue."}
              {section === 2 && "We will send your confirmation here."}
              {section === 3 && "Double-check everything before you confirm."}
            </p>
          </div>

          {/* ── Step 1 ── */}
          {section === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                <BookingDateRangePicker
                  checkIn={checkIn}
                  checkOut={checkOut}
                  onDatesChange={(start, end) => {
                    setCheckIn(start);
                    setCheckOut(end);
                  }}
                  variant="card"
                />
                <GuestPickerPopover
                  adults={adults}
                  childrenCount={childrenCount}
                  rooms={roomsCount}
                  maxRooms={
                    selectedRoom && selectedAvail != null
                      ? Math.max(1, Math.min(5, selectedAvail))
                      : 5
                  }
                  onAdultsChange={setAdults}
                  onChildrenChange={setChildrenCount}
                  onRoomsChange={setRoomsCount}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold text-[var(--bk-ink)]">
                    Available rooms
                  </h2>
                  {nights > 0 && (
                    <span className="text-xs text-[var(--bk-muted)]">
                      {nights} night{nights !== 1 ? "s" : ""}
                      {priceLoading ? " · updating rates..." : ""}
                    </span>
                  )}
                </div>

                {roomTypes.length === 0 ? (
                  <div className="booking-surface-soft p-8 text-center">
                    <p className="text-sm text-[var(--bk-muted)]">
                      No rooms are available for booking yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3" role="radiogroup" aria-label="Room type">
                    {sortedRooms.map((rt) => {
                      const avail = resolvedPrices[rt.id]?.availableCount ?? null;
                      const soldOut = avail === 0;
                      return (
                        <RoomOptionCard
                          key={rt.id}
                          room={rt}
                          selected={selectedRoom?.id === rt.id}
                          currency={hotel.currency}
                          displayPrice={
                            resolvedPrices[rt.id]?.displayPrice ?? rt.basePrice
                          }
                          priceLoading={priceLoading}
                          availableCount={avail}
                          onSelect={() => {
                            if (!soldOut) setSelectedRoom(rt);
                          }}
                          onPhotos={(e) => {
                            e.stopPropagation();
                            setGalleryRoom(rt);
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Desktop continue — mobile uses sticky bar when room selected */}
              <Button
                variant="primary"
                size="lg"
                isDisabled={!step1Valid}
                onPress={() => goToSection(2)}
                className={`booking-cta w-full h-12 rounded-xl text-sm touch-manipulation ${
                  selectedRoom ? "hidden sm:inline-flex" : ""
                }`}
              >
                Continue
              </Button>
            </div>
          )}

          {/* ── Step 2 ── */}
          {section === 2 && (
            <div className="space-y-4 sm:space-y-5">
              {selectedRoom && (
                <div className="booking-surface-soft px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--bk-ink)] truncate">
                      {selectedRoom.name}
                    </p>
                    <p className="text-xs text-[var(--bk-muted)] mt-0.5">
                      {fmtDate(checkIn)} - {fmtDate(checkOut)} · {nights} night
                      {nights !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToSection(1)}
                    className="text-xs font-semibold text-[var(--bk-accent)] hover:underline shrink-0 cursor-pointer min-h-9 px-1"
                  >
                    Change
                  </button>
                </div>
              )}

              <TextField
                name="fullName"
                isRequired
                isInvalid={touched.name && !nameOk}
                value={guestName}
                onChange={setGuestName}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                autoComplete="name"
                className="booking-field w-full"
              >
                <Label>Full name</Label>
                <Input placeholder="As it appears on your ID" className="h-11" />
                {touched.name && !nameOk && (
                  <p className="text-xs text-[var(--bk-danger)] mt-1">
                    Enter your full name
                  </p>
                )}
              </TextField>

              <TextField
                name="email"
                type="email"
                isRequired
                isInvalid={touched.email && !emailOk}
                value={guestEmail}
                onChange={setGuestEmail}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                autoComplete="email"
                className="booking-field w-full"
              >
                <Label>Email</Label>
                <Input placeholder="you@example.com" className="h-11" />
                {touched.email && !emailOk && (
                  <p className="text-xs text-[var(--bk-danger)] mt-1">
                    Enter a valid email address
                  </p>
                )}
              </TextField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField
                  name="phone"
                  type="tel"
                  isRequired
                  isInvalid={touched.phone && !phoneOk}
                  value={guestPhone}
                  onChange={setGuestPhone}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                  autoComplete="tel"
                  className="booking-field w-full"
                >
                  <Label>Phone</Label>
                  <Input
                    placeholder={phonePlaceholder}
                    className="h-11"
                    inputMode="tel"
                  />
                  {touched.phone && !phoneOk && (
                    <p className="text-xs text-[var(--bk-danger)] mt-1">
                      Enter a valid phone number
                    </p>
                  )}
                  {selectedDialCode && (
                    <p className="text-[11px] text-[var(--bk-muted)] mt-1">
                      Country code {selectedDialCode}
                      {selectedCountryObj
                        ? ` · ${selectedCountryObj.name}`
                        : ""}
                    </p>
                  )}
                </TextField>

                <div className="booking-field-select space-y-1.5">
                  <Label>Nationality</Label>
                  <Select
                    aria-label="Nationality"
                    placeholder="Select country"
                    value={nationality || null}
                    onChange={(value) => {
                      if (value) handleNationalityChange(String(value));
                    }}
                    className="w-full"
                  >
                    <Select.Trigger className="h-11 w-full rounded-xl border border-[var(--bk-line)] bg-[var(--bk-field-bg)] px-3.5 text-sm text-[var(--bk-ink)] flex items-center justify-between">
                      <Select.Value>
                        {({ defaultChildren, isPlaceholder }) => {
                          if (isPlaceholder || !selectedCountryObj) {
                            return (
                              <span className="text-[var(--bk-muted)]">
                                {defaultChildren}
                              </span>
                            );
                          }
                          return (
                            <span className="flex items-center gap-2 truncate text-[var(--bk-ink)]">
                              <span aria-hidden className="text-base leading-none">
                                {selectedCountryObj.flag}
                              </span>
                              <span className="truncate">
                                {selectedCountryObj.name}
                              </span>
                              {selectedCountryObj.dialCode ? (
                                <span className="text-[var(--bk-muted)] shrink-0">
                                  {selectedCountryObj.dialCode}
                                </span>
                              ) : null}
                            </span>
                          );
                        }}
                      </Select.Value>
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover className="p-1 max-h-64 overflow-y-auto bg-[var(--bk-surface)] border border-[var(--bk-line)] rounded-xl shadow-lg z-50 text-[var(--bk-ink)]">
                      <ListBox>
                        {countryList.map((c) => (
                          <ListBox.Item
                            key={c.name}
                            id={c.name}
                            textValue={`${c.flag} ${c.name} ${c.dialCode}`}
                            className="text-sm px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--bk-surface-soft)] flex items-center gap-2 text-[var(--bk-ink)]"
                          >
                            <span className="text-base leading-none" aria-hidden>
                              {c.flag}
                            </span>
                            <span className="flex-1 truncate">{c.name}</span>
                            {c.dialCode ? (
                              <span className="text-xs text-[var(--bk-muted)] shrink-0">
                                {c.dialCode}
                              </span>
                            ) : null}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowExtras(!showExtras)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[var(--bk-ink-soft)] hover:text-[var(--bk-ink)] transition-colors cursor-pointer"
                  aria-expanded={showExtras}
                >
                  {showExtras ? (
                    <ChevronUp className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                  Special requests & guest count
                </button>

                {showExtras && (
                  <div className="mt-3 p-4 booking-surface-soft space-y-4">
                    <NumericStepper
                      label="Adults"
                      description={`Max ${selectedRoom?.maxAdults ?? 10}`}
                      value={adults}
                      onChange={setAdults}
                      min={1}
                      max={selectedRoom?.maxAdults ?? 10}
                    />
                    <NumericStepper
                      label="Children"
                      description="Ages 0-12"
                      value={childrenCount}
                      onChange={setChildrenCount}
                      min={0}
                      max={selectedRoom?.maxChildren ?? 6}
                    />
                    <TextField
                      name="specialRequests"
                      value={specialRequests}
                      onChange={setSpecialRequests}
                      className="booking-field w-full"
                    >
                      <Label>Special requests</Label>
                      <TextArea
                        placeholder="Early check-in, quiet room, high floor..."
                        rows={3}
                        className="resize-none"
                      />
                    </TextField>
                  </div>
                )}
              </div>

              <div className="hidden sm:flex flex-row gap-3 pt-1">
                <Button
                  variant="secondary"
                  size="lg"
                  onPress={() => goToSection(1)}
                  className="w-auto h-12 rounded-xl text-sm font-semibold touch-manipulation"
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  isDisabled={!step2Valid}
                  onPress={() => goToSection(3)}
                  className="booking-cta flex-1 h-12 rounded-xl text-sm touch-manipulation"
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3 ── */}
          {section === 3 && (
            <div className="space-y-4 sm:space-y-5">
              {/* Summary card */}
              <div className="booking-surface p-4 sm:p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="booking-heading text-xl sm:text-2xl text-[var(--bk-ink)] leading-tight">
                      {selectedRoom?.name}
                    </p>
                    {selectedRoom?.bedConfiguration && (
                      <p className="text-xs text-[var(--bk-muted)] mt-1">
                        {selectedRoom.bedConfiguration}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => goToSection(1)}
                    className="text-xs font-semibold text-[var(--bk-accent)] hover:underline shrink-0 cursor-pointer min-h-9 px-1"
                  >
                    Edit
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm">
                  <div className="booking-surface-soft p-3 rounded-xl">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--bk-muted)]">
                      Check-in
                    </p>
                    <p className="font-semibold text-[var(--bk-ink)] mt-0.5">
                      {fmtDate(checkIn)}
                    </p>
                    {hotel.checkInTime && (
                      <p className="text-xs text-[var(--bk-muted)]">from {hotel.checkInTime}</p>
                    )}
                  </div>
                  <div className="booking-surface-soft p-3 rounded-xl">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--bk-muted)]">
                      Check-out
                    </p>
                    <p className="font-semibold text-[var(--bk-ink)] mt-0.5">
                      {fmtDate(checkOut)}
                    </p>
                    {hotel.checkOutTime && (
                      <p className="text-xs text-[var(--bk-muted)]">by {hotel.checkOutTime}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm border-t border-[var(--bk-line)] pt-3">
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--bk-muted)]">Guest</span>
                    <span className="text-right font-medium text-[var(--bk-ink)]">
                      {guestName.trim()}
                      {selectedCountryObj ? ` ${selectedCountryObj.flag}` : ""}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--bk-muted)]">Party</span>
                    <span className="text-right text-[var(--bk-ink)]">
                      {adults} adult{adults !== 1 ? "s" : ""}
                      {childrenCount > 0
                        ? `, ${childrenCount} child${childrenCount !== 1 ? "ren" : ""}`
                        : ""}
                      {bookableRooms > 1 ? `, ${bookableRooms} rooms` : ""}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--bk-muted)]">
                      {fmt(displayNightRate)} × {nights} night
                      {nights !== 1 ? "s" : ""}
                      {bookableRooms > 1 ? ` × ${bookableRooms} rooms` : ""}
                    </span>
                    <span className="booking-price text-[var(--bk-ink)]">{fmt(subtotal)}</span>
                  </div>
                  {taxAmount > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-[var(--bk-muted)]">
                        Taxes & fees ({hotel.taxPercentage}%)
                      </span>
                      <span className="booking-price text-[var(--bk-ink)]">{fmt(taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline gap-4 pt-2 border-t border-[var(--bk-line)]">
                    <span className="font-semibold text-[var(--bk-ink)]">Total</span>
                    <span className="booking-heading booking-price text-2xl text-[var(--bk-ink)]">
                      {fmt(total)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment */}
              {hotel.paymentPolicy === "choice" && hotel.hasPaystack && (
                <div className="space-y-2.5">
                  <p className="text-sm font-semibold text-[var(--bk-ink)]">Payment</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(
                      [
                        {
                          id: "pay_now" as const,
                          title: "Pay online",
                          desc: "Card or mobile money · instant confirmation",
                          icon: CreditCard,
                        },
                        {
                          id: "pay_at_checkin" as const,
                          title: "Pay at hotel",
                          desc: "Reserve free · settle at check-in",
                          icon: Landmark,
                        },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPaymentPref(p.id)}
                        data-selected={paymentPref === p.id}
                        className="booking-pay-option p-4 text-left cursor-pointer"
                        aria-pressed={paymentPref === p.id}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-semibold text-[var(--bk-ink)]">
                            {p.title}
                          </span>
                          <p.icon
                            className={`size-4 ${
                              paymentPref === p.id
                                ? "text-[var(--bk-ink)]"
                                : "text-[var(--bk-muted)]"
                            }`}
                            strokeWidth={1.75}
                          />
                        </div>
                        <p className="text-xs text-[var(--bk-muted)] leading-relaxed">
                          {p.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {hotel.cancellationPolicy && (
                <p className="text-xs text-[var(--bk-muted)] leading-relaxed booking-surface-soft p-3.5">
                  <span className="font-semibold text-[var(--bk-ink-soft)]">
                    Cancellation:{" "}
                  </span>
                  {hotel.cancellationPolicy}
                </p>
              )}

              {/* Desktop CTAs — mobile uses sticky bar */}
              <div className="hidden sm:flex flex-row gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  onPress={() => goToSection(2)}
                  isDisabled={submitting}
                  className="w-auto h-12 rounded-xl text-sm font-semibold touch-manipulation"
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  isDisabled={submitting || !step1Valid || !step2Valid}
                  onPress={handleConfirm}
                  className="booking-cta booking-cta-accent flex-1 h-12 rounded-xl text-sm touch-manipulation"
                >
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Processing...
                    </span>
                  ) : paymentPref === "pay_now" &&
                    (hotel.paymentPolicy === "pay_now_only" ||
                      (hotel.paymentPolicy === "choice" && hotel.hasPaystack)) ? (
                    `Pay ${fmt(total)}`
                  ) : (
                    "Confirm reservation"
                  )}
                </Button>
              </div>
            </div>
          )}
        </main>

        {/* Sticky checkout bar — mobile (OTA pattern: price + primary CTA always reachable) */}
        <div className="booking-sticky-bar sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {selectedRoom ? (
                <>
                  <p className="text-[11px] text-[var(--bk-muted)] truncate">
                    {selectedRoom.name}
                    {nights ? ` · ${nights} night${nights !== 1 ? "s" : ""}` : ""}
                  </p>
                  <p className="booking-price text-base font-semibold text-[var(--bk-ink)] tabular-nums">
                    {fmt(total)}
                    <span className="text-[11px] font-normal text-[var(--bk-muted)] ml-1">
                      total
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-xs text-[var(--bk-muted)] leading-snug">
                  Select a room to continue
                </p>
              )}
            </div>

            {section === 1 && (
              <Button
                variant="primary"
                size="md"
                isDisabled={!step1Valid}
                onPress={() => goToSection(2)}
                className="booking-cta h-11 min-w-[7rem] px-4 rounded-xl text-sm shrink-0 touch-manipulation"
              >
                Continue
              </Button>
            )}
            {section === 2 && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="secondary"
                  size="md"
                  onPress={() => goToSection(1)}
                  className="h-11 px-3 rounded-xl text-sm touch-manipulation"
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  isDisabled={!step2Valid}
                  onPress={() => goToSection(3)}
                  className="booking-cta h-11 min-w-[6.5rem] px-4 rounded-xl text-sm touch-manipulation"
                >
                  Review
                </Button>
              </div>
            )}
            {section === 3 && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="secondary"
                  size="md"
                  isDisabled={submitting}
                  onPress={() => goToSection(2)}
                  className="h-11 px-3 rounded-xl text-sm touch-manipulation"
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  isDisabled={submitting || !step1Valid || !step2Valid}
                  onPress={handleConfirm}
                  className="booking-cta booking-cta-accent h-11 min-w-[6.5rem] px-3.5 rounded-xl text-sm touch-manipulation"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : paymentPref === "pay_now" &&
                    (hotel.paymentPolicy === "pay_now_only" ||
                      (hotel.paymentPolicy === "choice" && hotel.hasPaystack)) ? (
                    "Pay"
                  ) : (
                    "Confirm"
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {galleryRoom && (
        <RoomGallery
          open={!!galleryRoom}
          onClose={() => setGalleryRoom(null)}
          images={galleryRoom.images}
          roomName={galleryRoom.name}
          shortDescription={galleryRoom.shortDescription}
          amenities={galleryRoom.amenities}
          basePrice={galleryRoom.basePrice}
          currency={hotel.currency}
          roomTypeId={galleryRoom.id}
          checkIn={checkIn}
          checkOut={checkOut}
        />
      )}
    </>
  );
}

function RoomOptionCard({
  room,
  selected,
  currency,
  displayPrice,
  priceLoading,
  availableCount,
  onSelect,
  onPhotos,
}: {
  room: RoomType;
  selected: boolean;
  currency: string;
  displayPrice: number;
  priceLoading: boolean;
  availableCount: number | null;
  onSelect: () => void;
  onPhotos: (e: React.MouseEvent) => void;
}) {
  const img = room.images[0]?.url ?? null;
  const soldOut = availableCount === 0;
  const scarce =
    availableCount !== null && availableCount > 0 && availableCount <= 2;

  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={soldOut || undefined}
      tabIndex={soldOut ? -1 : 0}
      onClick={() => {
        if (!soldOut) onSelect();
      }}
      onKeyDown={(e) => {
        if (soldOut) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      data-selected={selected}
      data-sold-out={soldOut ? "true" : "false"}
      className={`booking-room-option p-3 sm:p-4 touch-manipulation ${
        soldOut ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <div className="flex items-start gap-3 sm:gap-3.5">
        <div className="relative shrink-0 w-16 h-16 sm:w-24 sm:h-[4.5rem] rounded-xl overflow-hidden bg-[var(--bk-surface-soft)]">
          {img ? (
            <Image
              src={img}
              alt=""
              fill
              className={`object-cover ${soldOut ? "grayscale" : ""}`}
              sizes="96px"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-semibold text-[var(--bk-muted)] tracking-wide">
                {room.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
          )}

          {room.images.length > 1 && (
            <button
              type="button"
              onClick={onPhotos}
              className="absolute bottom-1 right-1 bg-[var(--bk-ink)]/75 text-white rounded-md px-1.5 py-0.5 text-[9px] font-semibold flex items-center gap-0.5 hover:bg-[var(--bk-ink)]/90 cursor-pointer touch-manipulation"
              aria-label={`View ${room.images.length} photos of ${room.name}`}
            >
              <Images className="size-2.5" />
              {room.images.length}
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-[15px] font-semibold text-[var(--bk-ink)] leading-snug">
                  {room.name}
                </h3>
                {soldOut && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bk-danger)]">
                    Sold out
                  </span>
                )}
                {scarce && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bk-accent)]">
                    Only {availableCount} left
                  </span>
                )}
              </div>
              {room.bedConfiguration && (
                <p className="text-xs text-[var(--bk-muted)] mt-0.5 line-clamp-1">
                  {room.bedConfiguration}
                </p>
              )}
            </div>
            <div className="text-right shrink-0 pl-1">
              <p
                className={`booking-price text-sm sm:text-[15px] font-semibold text-[var(--bk-ink)] ${
                  priceLoading ? "opacity-40" : ""
                }`}
              >
                {currency} {displayPrice.toLocaleString()}
              </p>
              <p className="text-[10px] text-[var(--bk-muted)]">per night</p>
            </div>
          </div>

          {selected && room.shortDescription && (
            <p className="text-xs text-[var(--bk-muted)] mt-2 leading-relaxed line-clamp-2">
              {room.shortDescription}
            </p>
          )}

          {room.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {room.amenities.slice(0, 2).map((a) => (
                <span key={a.label} className="booking-chip sm:hidden">
                  {a.label}
                </span>
              ))}
              {room.amenities.slice(0, 3).map((a) => (
                <span key={`d-${a.label}`} className="booking-chip hidden sm:inline-flex">
                  {a.label}
                </span>
              ))}
              {room.amenities.length > 2 && (
                <span className="text-[10px] text-[var(--bk-muted)] self-center sm:hidden">
                  +{room.amenities.length - 2}
                </span>
              )}
              {room.amenities.length > 3 && (
                <span className="text-[10px] text-[var(--bk-muted)] self-center hidden sm:inline">
                  +{room.amenities.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Selection indicator */}
        {!soldOut && (
          <div
            className={`mt-0.5 size-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
              selected
                ? "border-[var(--bk-ink)] bg-[var(--bk-ink)]"
                : "border-[var(--bk-line-strong)] bg-transparent"
            }`}
            aria-hidden
          >
            {selected && <Check className="size-3 text-[var(--bk-on-ink)]" strokeWidth={3} />}
          </div>
        )}
      </div>
    </div>
  );
}
