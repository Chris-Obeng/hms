"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "@heroui/react";
import countries from "world-countries";
import { format, parseISO } from "date-fns";
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
import { BookingDateRangePicker } from "@/components/booking/booking-date-range-picker";
import { GuestPickerPopover } from "@/components/booking/guest-picker-popover";
import { NumericStepper } from "@/components/booking/numeric-stepper";

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
  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  /** Build international dial code from world-countries idd (e.g. GH → +233). */
  const dialCodeFromIdd = React.useCallback(
    (idd?: { root?: string; suffixes?: string[] } | null) => {
      const root = idd?.root ?? "";
      if (!root) return "";
      const suffixes = idd?.suffixes ?? [];
      // Single suffix completes country code (+2 + 33 → +233). Many suffixes = root is code (+1).
      if (suffixes.length === 1) return `${root}${suffixes[0]}`;
      return root;
    },
    []
  );

  const countryList = React.useMemo(() => {
    const list = countries.map((c) => ({
      code: c.cca2,
      name: c.name.common,
      flag: c.flag,
      dialCode: dialCodeFromIdd(c.idd),
    }));
    list.sort((a, b) => {
      if (a.name === "Ghana") return -1;
      if (b.name === "Ghana") return 1;
      if (a.name === "Nigeria") return -1;
      if (b.name === "Nigeria") return 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [dialCodeFromIdd]);

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
  const [section, setSection] = React.useState<1 | 2 | 3>(1);
  const [touched, setTouched] = React.useState({ name: false, email: false, phone: false });

  type ResolvedPrice = {
    displayPrice: number;
    subtotal: number | null;
    availableCount: number | null;
  };
  const [resolvedPrices, setResolvedPrices] = React.useState<
    Record<string, ResolvedPrice>
  >({});
  const [priceLoading, setPriceLoading] = React.useState(false);

  React.useEffect(() => {
    if (!checkIn || !checkOut || checkOut <= checkIn) return;
    let cancelled = false;
    setPriceLoading(true);
    fetch(`/api/booking/${slug}/availability?check_in=${checkIn}&check_out=${checkOut}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
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
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPriceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkIn, checkOut, slug]);

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
  const total =
    resolvedSelected?.subtotal ?? (selectedRoom?.basePrice ?? 0) * nights * roomsCount;

  const fmt = (n: number) =>
    `${hotel.currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const selectedAvail = selectedRoom
    ? resolvedPrices[selectedRoom.id]?.availableCount
    : null;
  const selectedAvailable =
    selectedAvail === null || selectedAvail === undefined || selectedAvail > 0;

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
          guest_name: guestName.trim(),
          guest_email: guestEmail.trim(),
          guest_phone: guestPhone.trim(),
          nationality: nationality || undefined,
          payment_preference: paymentPref,
          special_requests: specialRequests || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.danger(data.error ?? "Reservation failed. Please check your details.");
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

  const steps = [
    { num: 1 as const, label: "Stay" },
    { num: 2 as const, label: "Guest" },
    { num: 3 as const, label: "Confirm" },
  ];

  return (
    <>
      <div className="min-h-[100dvh] flex flex-col">
        {/* Header */}
        <header className="booking-header sticky top-0 z-40 booking-safe-x h-12 pt-[env(safe-area-inset-top)] flex items-center justify-between gap-3">
          <Link
            href={`/${slug}`}
            className="flex items-center gap-2 min-w-0 group touch-manipulation"
          >
            <ArrowLeft className="size-4 text-[var(--bk-muted)] group-hover:text-[var(--bk-ink)] transition-colors shrink-0" />
            <span className="booking-heading text-sm sm:text-base text-[var(--bk-ink)] truncate">
              {hotel.name}
            </span>
          </Link>
          <div className="booking-trust hidden sm:inline-flex">
            <ShieldCheck className="size-3.5 text-[var(--bk-success)]" strokeWidth={1.75} />
            Direct booking
          </div>
        </header>

        {/* Progress */}
        <div className="border-b border-[var(--bk-line)] bg-[var(--bk-bg)]">
          <nav
            aria-label="Booking progress"
            className="max-w-2xl mx-auto booking-safe-x py-3 sm:py-4 flex items-center gap-1.5 sm:gap-2"
          >
            {steps.map((s, i) => {
              const done = section > s.num || (s.num < 3 && (s.num === 1 ? step1Valid && section > 1 : step2Valid && section > 2));
              const active = section === s.num;
              const reachable =
                s.num === 1 ||
                (s.num === 2 && step1Valid) ||
                (s.num === 3 && step1Valid && step2Valid);

              return (
                <React.Fragment key={s.num}>
                  {i > 0 && (
                    <div
                      className="booking-step-track"
                      data-done={section > s.num - 1 ? "true" : "false"}
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => reachable && setSection(s.num)}
                    className={`flex items-center gap-1.5 sm:gap-2 shrink-0 rounded-full px-0.5 sm:px-1 py-0.5 transition-opacity touch-manipulation ${
                      reachable ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                    }`}
                    aria-current={active ? "step" : undefined}
                  >
                    <span
                      className={`size-7 sm:size-6 rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0 transition-colors ${
                        done && !active
                          ? "bg-[var(--bk-ink)] text-[#fafaf8]"
                          : active
                            ? "bg-[var(--bk-ink)] text-[#fafaf8]"
                            : "bg-[var(--bk-surface-soft)] text-[var(--bk-muted)] border border-[var(--bk-line)]"
                      }`}
                    >
                      {done && !active ? <Check className="size-3.5" strokeWidth={2.5} /> : s.num}
                    </span>
                    <span
                      className={`text-[11px] sm:text-xs font-medium ${
                        active ? "text-[var(--bk-ink)]" : "text-[var(--bk-muted)]"
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* Main */}
        <main className="flex-1 max-w-2xl w-full mx-auto booking-safe-x py-6 sm:py-8 md:py-10 pb-32">
          <div className="mb-6 sm:mb-8">
            <h1 className="booking-heading text-2xl sm:text-3xl md:text-4xl text-[var(--bk-ink)]">
              {section === 1 && "Choose your stay"}
              {section === 2 && "Guest details"}
              {section === 3 && "Review & confirm"}
            </h1>
            <p className="text-sm text-[var(--bk-muted)] mt-1.5">
              {section === 1 && "Select dates and a room to continue."}
              {section === 2 && "We will send your confirmation here."}
              {section === 3 && "Double-check everything before you confirm."}
            </p>
          </div>

          {/* ── Step 1 ── */}
          {section === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <BookingDateRangePicker
                  checkIn={checkIn}
                  checkOut={checkOut}
                  onDatesChange={(start, end) => {
                    setCheckIn(start);
                    setCheckOut(end);
                  }}
                />
                <GuestPickerPopover
                  adults={adults}
                  childrenCount={childrenCount}
                  rooms={roomsCount}
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
                onPress={() => setSection(2)}
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
            <div className="space-y-5">
              {selectedRoom && (
                <div className="booking-surface-soft px-4 py-3 flex items-center justify-between gap-3 text-sm">
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
                    onClick={() => setSection(1)}
                    className="text-xs font-semibold text-[var(--bk-accent)] hover:underline shrink-0 cursor-pointer"
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
                    <Select.Trigger className="h-11 w-full rounded-xl border border-[var(--bk-line)] bg-white px-3.5 text-sm text-[var(--bk-ink)] flex items-center justify-between">
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
                    <Select.Popover className="p-1 max-h-64 overflow-y-auto bg-white border border-[var(--bk-line)] rounded-xl shadow-lg z-50 text-[var(--bk-ink)]">
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

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
                <Button
                  variant="secondary"
                  size="lg"
                  onPress={() => setSection(1)}
                  className="w-full sm:w-auto h-12 rounded-xl text-sm font-semibold touch-manipulation"
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  isDisabled={!step2Valid}
                  onPress={() => setSection(3)}
                  className="booking-cta flex-1 w-full h-12 rounded-xl text-sm touch-manipulation hidden sm:inline-flex"
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3 ── */}
          {section === 3 && (
            <div className="space-y-5">
              {/* Summary card */}
              <div className="booking-surface p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="booking-heading text-2xl text-[var(--bk-ink)] leading-tight">
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
                    onClick={() => setSection(1)}
                    className="text-xs font-semibold text-[var(--bk-accent)] hover:underline shrink-0 cursor-pointer"
                  >
                    Edit
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
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
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--bk-muted)]">
                      {fmt(displayNightRate)} × {nights} night{nights !== 1 ? "s" : ""}
                    </span>
                    <span className="booking-price text-[var(--bk-ink)]">{fmt(total)}</span>
                  </div>
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

              <div className="flex flex-col-reverse sm:flex-row gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  onPress={() => setSection(2)}
                  isDisabled={submitting}
                  className="w-full sm:w-auto h-12 rounded-xl text-sm font-semibold touch-manipulation"
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  isDisabled={submitting || !step1Valid || !step2Valid}
                  onPress={handleConfirm}
                  className="booking-cta booking-cta-accent flex-1 w-full h-12 rounded-xl text-sm touch-manipulation"
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

        {/* Sticky total bar — mobile only; desktop uses inline CTAs */}
        {selectedRoom && section < 3 && (
          <div className="booking-sticky-bar sm:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-[var(--bk-muted)] truncate">
                  {selectedRoom.name}
                  {nights ? ` · ${nights} night${nights !== 1 ? "s" : ""}` : ""}
                </p>
                <p className="booking-price text-base font-semibold text-[var(--bk-ink)]">
                  {fmt(total)}
                  <span className="text-xs font-normal text-[var(--bk-muted)] ml-1">
                    total
                  </span>
                </p>
              </div>
              {section === 1 && (
                <Button
                  variant="primary"
                  size="md"
                  isDisabled={!step1Valid}
                  onPress={() => setSection(2)}
                  className="booking-cta h-11 min-w-[7.5rem] px-5 rounded-xl text-sm shrink-0 touch-manipulation"
                >
                  Continue
                </Button>
              )}
              {section === 2 && (
                <Button
                  variant="primary"
                  size="md"
                  isDisabled={!step2Valid}
                  onPress={() => setSection(3)}
                  className="booking-cta h-11 min-w-[7.5rem] px-5 rounded-xl text-sm shrink-0 touch-manipulation"
                >
                  Review
                </Button>
              )}
            </div>
          </div>
        )}
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
            {selected && <Check className="size-3 text-white" strokeWidth={3} />}
          </div>
        )}
      </div>
    </div>
  );
}
