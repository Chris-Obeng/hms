"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast, ListBox, Select } from "@heroui/react";
import { format, parseISO } from "date-fns";
import { COUNTRIES } from "@/lib/countries-data";
import {
  buildCartLines,
  makeRoom,
  MAX_ROOMS_PER_TYPE,
  MAX_ROOM_TYPES,
  occupancyText,
  priceRoom,
  remainingRoomAllowance,
  sumRooms,
  type CartRoom,
  type PricedRoom,
} from "@/lib/bookings/cart";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
  BedDouble,
  Users,
  User,
  Mail,
  Flag,
  CircleCheckBig,
  Circle,
  CircleAlert,
  Lock,
  Check,
  Images,
  X,
} from "lucide-react";
import { RoomGallery } from "@/components/booking/room-gallery";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { BookingDateRangePicker } from "@/components/booking/booking-date-range-picker";
import { GuestPickerPopover } from "@/components/booking/guest-picker-popover";
import { NumericStepper } from "@/components/booking/numeric-stepper";
import {
  BookingHeader,
  type BookingStepId,
} from "@/components/booking/booking-progress";
import { RESERVATION_ROOM_CAP } from "@/lib/bookings/expand-cart-lines";

export interface RoomImage {
  url: string;
  caption: string;
  order: number;
}

export interface Amenity {
  icon: string;
  label: string;
}

export interface WizardRoomType {
  id: string;
  name: string;
  basePrice: number;
  weekendPrice: number | null;
  shortDescription: string | null;
  description: string | null;
  bedConfiguration: string | null;
  maxAdults: number;
  maxChildren: number;
  images: RoomImage[];
  amenities: Amenity[];
}

export interface WizardHotel {
  name: string;
  logoUrl: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  currency: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  cancellationPolicy: string | null;
  paymentPolicy: string;
  hasPaystack: boolean;
  taxEnabled: boolean;
  taxPercentage: number;
}

export interface ResolvedNightQuote {
  date: string;
  price: number;
}

export interface ResolvedRoomQuote {
  displayPrice: number;
  subtotal: number | null;
  nights: ResolvedNightQuote[];
  availableCount: number | null;
  restrictionReason: string | null;
}

interface BookingWizardProps {
  slug: string;
  hotel: WizardHotel;
  roomTypes: WizardRoomType[];
  minDate: string;
  initialRoomTypeId: string | null;
  initialCheckIn: string;
  initialCheckOut: string;
  initialResolvedPrices: Record<string, ResolvedRoomQuote> | null;
  initialAdults?: number;
  initialChildren?: number;
  initialRooms?: number;
}

interface CartLine {
  id: string;
  roomType: WizardRoomType;
  rooms: CartRoom[];
}

const nextRoomKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `r-${Math.random().toString(36).slice(2, 10)}`;

type PricedLine = {
  line: CartLine;
  rooms: PricedRoom[];
  qty: number;
  nightRate: number;
  nightlyBreakdown: ResolvedNightQuote[];
  subtotal: number;
  tax: number;
  total: number;
  availableCount: number | null;
  restrictionReason: string | null;
  blocked: boolean;
};

const DEFAULT_MAX_CHILDREN = 6;
function childrenCapFor(rt: { maxChildren: number }): number {
  return rt.maxChildren > 0 ? rt.maxChildren : DEFAULT_MAX_CHILDREN;
}

function fmtFullDate(iso: string) {
  try {
    return format(parseISO(iso), "EEE, d MMM yyyy");
  } catch {
    return iso;
  }
}

function buildFallbackNights(
  checkIn: string,
  checkOut: string,
  nightlyRate: number
): ResolvedNightQuote[] {
  const out: ResolvedNightQuote[] = [];
  const cur = new Date(`${checkIn}T12:00:00Z`);
  const end = new Date(`${checkOut}T12:00:00Z`);
  while (cur < end && out.length < 366) {
    out.push({ date: cur.toISOString().slice(0, 10), price: nightlyRate });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function BookingWizard({
  slug,
  hotel,
  roomTypes,
  minDate,
  initialRoomTypeId,
  initialCheckIn,
  initialCheckOut,
  initialResolvedPrices,
  initialAdults = 1,
  initialChildren = 0,
  initialRooms = 1,
}: BookingWizardProps) {
  const router = useRouter();
  const countryList = COUNTRIES;

  const [checkIn, setCheckIn] = React.useState(initialCheckIn);
  const [checkOut, setCheckOut] = React.useState(initialCheckOut);
  const [adults, setAdults] = React.useState(Math.max(1, initialAdults));
  const [childrenCount, setChildrenCount] = React.useState(
    Math.max(0, initialChildren)
  );
  const [roomsCount, setRoomsCount] = React.useState(Math.max(1, initialRooms));

  /** Per-card room quantity picker state before a card is added to the cart. */
  const [pendingQtyById, setPendingQtyById] = React.useState<
    Record<string, number>
  >({});

  const [lines, setLines] = React.useState<CartLine[]>(() => {
    const seed = roomTypes.find((r) => r.id === initialRoomTypeId);
    if (!seed) return [];
    const quote = initialResolvedPrices?.[seed.id];
    if (quote && (quote.availableCount === 0 || quote.restrictionReason)) {
      return [];
    }
    const seededAdults = Math.min(
      Math.max(1, initialAdults),
      seed.maxAdults || 10
    );
    const seededChildren = Math.min(
      Math.max(0, initialChildren),
      childrenCapFor(seed)
    );
    const maxSeedRooms = Math.min(
      MAX_ROOMS_PER_TYPE,
      quote?.availableCount ?? MAX_ROOMS_PER_TYPE
    );
    const count = Math.max(1, Math.min(initialRooms, maxSeedRooms));
    const rooms = Array.from({ length: count }, () =>
      makeRoom(nextRoomKey(), seededAdults, seededChildren)
    );
    return [{ id: seed.id, roomType: seed, rooms }];
  });

  const [galleryRoom, setGalleryRoom] = React.useState<WizardRoomType | null>(
    null
  );
  const [guestName, setGuestName] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [localPhone, setLocalPhone] = React.useState("");
  const [nationality, setNationality] = React.useState("Ghana");
  const [showExtras, setShowExtras] = React.useState(false);
  const [specialRequests, setSpecialRequests] = React.useState("");
  const [paymentPref, setPaymentPref] = React.useState<
    "pay_now" | "pay_at_checkin"
  >(
    hotel.paymentPolicy === "pay_later_only" || !hotel.hasPaystack
      ? "pay_at_checkin"
      : "pay_now"
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [section, setSection] = React.useState<1 | 2>(1);
  const [touched, setTouched] = React.useState({
    name: false,
    email: false,
    phone: false,
  });
  const [availNonce, setAvailNonce] = React.useState(0);
  const roomsListRef = React.useRef<HTMLDivElement>(null);

  const goToSection = React.useCallback((next: BookingStepId) => {
    if (next === 1 || next === 2) {
      setSection(next);
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }, []);

  const [resolvedPrices, setResolvedPrices] = React.useState<
    Record<string, ResolvedRoomQuote>
  >(() => initialResolvedPrices ?? {});
  const [priceLoading, setPriceLoading] = React.useState(
    initialResolvedPrices === null && roomTypes.length > 0
  );
  const initialSnapshotKey =
    initialResolvedPrices !== null
      ? `${initialCheckIn}|${initialCheckOut}|0`
      : null;

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
    const key = `${checkIn}|${checkOut}|${availNonce}`;
    if (initialSnapshotKey === key) {
      return;
    }

    let cancelled = false;

    const fetchAvailability = async () => {
      setPriceLoading(true);
      try {
        const r = await fetch(
          `/api/booking/${slug}/availability?check_in=${checkIn}&check_out=${checkOut}`
        );
        const json = r.ok ? await r.json() : null;
        if (cancelled) return;
        if (!json?.rooms) {
          setResolvedPrices({});
          toast.danger(
            "Could not load live rates for these dates. Please try again."
          );
          return;
        }
        const map: Record<string, ResolvedRoomQuote> = {};
        for (const room of json.rooms) {
          map[room.id] = {
            displayPrice: room.displayPrice ?? room.basePrice,
            subtotal: typeof room.subtotal === "number" ? room.subtotal : null,
            nights: Array.isArray(room.nights) ? room.nights : [],
            availableCount:
              typeof room.availableCount === "number"
                ? room.availableCount
                : null,
            restrictionReason:
              typeof room.restrictionReason === "string"
                ? room.restrictionReason
                : null,
          };
        }
        setResolvedPrices(map);

        setLines((prev) =>
          prev
            .filter((l) => {
              const resolved = map[l.roomType.id];
              if (!resolved) return true;
              if (resolved.availableCount === 0) return false;
              if (resolved.restrictionReason) return false;
              return true;
            })
            .map((l) => {
              const avail = map[l.roomType.id]?.availableCount;
              if (avail != null && l.rooms.length > avail) {
                return { ...l, rooms: l.rooms.slice(0, Math.max(1, avail)) };
              }
              return l;
            })
        );
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    };

    fetchAvailability();

    return () => {
      cancelled = true;
    };
  }, [checkIn, checkOut, slug, availNonce, initialSnapshotKey]);

  const defaultRoomFor = React.useCallback(
    (rt: WizardRoomType): CartRoom =>
      makeRoom(
        nextRoomKey(),
        Math.min(Math.max(1, adults), rt.maxAdults || 10),
        Math.min(Math.max(0, childrenCount), childrenCapFor(rt))
      ),
    [adults, childrenCount]
  );

  const addLineWithQty = React.useCallback(
    (rt: WizardRoomType, desiredQty?: number) => {
      setLines((prev) => {
        if (prev.some((l) => l.roomType.id === rt.id)) return prev;
        if (prev.length >= MAX_ROOM_TYPES) return prev;
        const allowance = remainingRoomAllowance(prev);
        if (allowance <= 0) return prev;
        const resolved = resolvedPrices[rt.id];
        if (resolved?.availableCount === 0 || resolved?.restrictionReason) {
          return prev;
        }
        const avail = resolved?.availableCount;
        const target = desiredQty ?? pendingQtyById[rt.id] ?? roomsCount;
        const count = Math.max(
          1,
          Math.min(
            target,
            MAX_ROOMS_PER_TYPE,
            avail ?? MAX_ROOMS_PER_TYPE,
            allowance
          )
        );
        return [
          ...prev,
          {
            id: rt.id,
            roomType: rt,
            rooms: Array.from({ length: count }, () => defaultRoomFor(rt)),
          },
        ];
      });
    },
    [resolvedPrices, pendingQtyById, roomsCount, defaultRoomFor]
  );

  const removeLine = React.useCallback(
    (id: string) => setLines((prev) => prev.filter((l) => l.id !== id)),
    []
  );

  const setLineRoomCount = React.useCallback(
    (rt: WizardRoomType, nextQty: number) => {
      if (nextQty <= 0) {
        removeLine(rt.id);
        return;
      }
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== rt.id) return l;
          const avail = resolvedPrices[rt.id]?.availableCount;
          const max = Math.min(
            MAX_ROOMS_PER_TYPE,
            avail ?? MAX_ROOMS_PER_TYPE,
            l.rooms.length + remainingRoomAllowance(prev)
          );
          const clamped = Math.max(1, Math.min(nextQty, max));
          if (clamped === l.rooms.length) return l;
          if (clamped < l.rooms.length) {
            return { ...l, rooms: l.rooms.slice(0, clamped) };
          }
          const extra = Array.from({ length: clamped - l.rooms.length }, () =>
            defaultRoomFor(rt)
          );
          return { ...l, rooms: [...l.rooms, ...extra] };
        })
      );
    },
    [resolvedPrices, defaultRoomFor, removeLine]
  );

  const updateRoom = React.useCallback(
    (id: string, key: string, patch: Partial<Omit<CartRoom, "key">>) => {
      setLines((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                rooms: l.rooms.map((r) =>
                  r.key === key ? { ...r, ...patch } : r
                ),
              }
            : l
        )
      );
    },
    []
  );

  const nights =
    checkIn && checkOut
      ? Math.max(
          1,
          Math.ceil(
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
              86400000
          )
        )
      : 1;

  /** ISO currency code + 2 decimals (`GHS 7,260.00`) so JetBrains Mono renders every glyph cleanly. */
  const fmt = React.useCallback(
    (n: number) =>
      `${hotel.currency} ${n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    [hotel.currency]
  );

  /** Nightly display formatter: omits .00 on whole numbers (`GHS 850`), keeps decimals when fractional (`GHS 1,499.99`). */
  const fmtNightly = React.useCallback(
    (n: number) => {
      const hasCents = Math.abs(Math.round(n * 100) % 100) > 0;
      return `${hotel.currency} ${n.toLocaleString("en-US", {
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: 2,
      })}`;
    },
    [hotel.currency]
  );

  const pricedLines: PricedLine[] = lines.map((l) => {
    const resolved = resolvedPrices[l.roomType.id];
    const avail = resolved?.availableCount ?? null;
    const restrictionReason = resolved?.restrictionReason ?? null;
    const sellable =
      avail != null ? l.rooms.slice(0, Math.max(1, avail)) : l.rooms;
    const nightRate = resolved?.displayPrice ?? l.roomType.basePrice ?? 0;
    const unitSubtotal = resolved?.subtotal ?? nightRate * nights;
    const nightlyBreakdown =
      resolved?.nights && resolved.nights.length > 0
        ? resolved.nights
        : buildFallbackNights(checkIn, checkOut, nightRate);
    const rooms = sellable.map((room) =>
      priceRoom(
        room,
        unitSubtotal,
        hotel.taxEnabled ? hotel.taxPercentage : 0,
        hotel.currency
      )
    );
    const totals = sumRooms(rooms, hotel.currency);
    return {
      line: l,
      rooms,
      qty: rooms.length,
      nightRate,
      nightlyBreakdown,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      availableCount: avail,
      restrictionReason,
      blocked: avail === 0 || restrictionReason !== null,
    };
  });

  const cur = hotel.currency;
  const subtotalMinor = sumMinor(
    pricedLines.map((p) => toMinor(p.subtotal, cur))
  );
  const taxMinor = sumMinor(pricedLines.map((p) => toMinor(p.tax, cur)));
  const taxAmount = fromMinor(taxMinor, cur);
  const total = fromMinor(subtotalMinor + taxMinor, cur);
  const totalRooms = pricedLines.reduce((s, p) => s + p.rooms.length, 0);
  const totalAdults = pricedLines.reduce(
    (s, p) => s + p.rooms.reduce((rs, r) => rs + r.adults, 0),
    0
  );
  const totalChildren = pricedLines.reduce(
    (s, p) => s + p.rooms.reduce((rs, r) => rs + r.children, 0),
    0
  );

  const datesValid = !!checkIn && !!checkOut && checkOut > checkIn;
  const pricesResolved = lines.every(
    (l) => resolvedPrices[l.roomType.id] !== undefined
  );
  const step1Valid =
    lines.length >= 1 &&
    datesValid &&
    pricesResolved &&
    pricedLines.every((p) => !p.blocked);

  const selectedCountryObj =
    countryList.find((c) => c.name === nationality) ?? countryList[0];
  const selectedDialCode = selectedCountryObj?.dialCode || "+233";
  const selectedCountryCode = selectedCountryObj?.code || "GH";

  // Build compact E.164/international phone string from prefix + local number
  // so it satisfies the server's `z.string().min(7).max(20)` schema even when
  // the guest types or autofills spaces, dashes, or parentheses.
  const normalizedLocal = localPhone.trim();
  const phoneDigits = normalizedLocal.replace(/\D/g, "");
  const dialDigits = selectedDialCode.replace(/\D/g, "");
  const fullPhone = normalizedLocal.startsWith("+")
    ? `+${phoneDigits}`
    : dialDigits
      ? `+${dialDigits} ${phoneDigits.replace(/^0+/, "") || phoneDigits}`
      : phoneDigits;

  const nameOk = guestName.trim().length > 1;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());
  const phoneOk =
    phoneDigits.length >= 6 &&
    phoneDigits.length <= 15 &&
    fullPhone.length >= 7 &&
    fullPhone.length <= 20;
  const step2Valid = nameOk && emailOk && phoneOk;

  const lineById = React.useMemo(() => {
    const m = new Map<string, CartLine>();
    for (const l of lines) m.set(l.id, l);
    return m;
  }, [lines]);

  const roomAllowance = remainingRoomAllowance(lines);
  const maxRoomsFor = React.useCallback(
    (rt: WizardRoomType) =>
      Math.min(
        MAX_ROOMS_PER_TYPE,
        resolvedPrices[rt.id]?.availableCount ?? MAX_ROOMS_PER_TYPE
      ),
    [resolvedPrices]
  );

  const phonePlaceholder =
    selectedDialCode === "+233"
      ? "24 123 4567"
      : selectedDialCode === "+234"
        ? "801 234 5678"
        : selectedDialCode === "+1"
          ? "555 123 4567"
          : selectedDialCode === "+44"
            ? "7700 900123"
            : "Phone number";

  const sortedRooms = React.useMemo(() => {
    const unbookable = (id: string) => {
      const resolved = resolvedPrices[id];
      return resolved?.availableCount === 0 || resolved?.restrictionReason
        ? 1
        : 0;
    };
    return [...roomTypes].sort((a, b) => unbookable(a.id) - unbookable(b.id));
  }, [roomTypes, resolvedPrices]);

  async function handleBookSubmit() {
    setTouched({ name: true, email: true, phone: true });
    if (!step1Valid) {
      goToSection(1);
      return;
    }
    if (!step2Valid || pricedLines.length === 0) {
      const firstInvalidId = !nameOk
        ? "bk-full-name"
        : !emailOk
          ? "bk-email"
          : !phoneOk
            ? "bk-phone"
            : null;
      if (firstInvalidId && typeof document !== "undefined") {
        const el = document.getElementById(firstInvalidId);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus({ preventScroll: true });
      }
      return;
    }

    const isGroup = totalRooms > 1;
    if (totalRooms > RESERVATION_ROOM_CAP) {
      toast.danger(
        `A reservation can hold up to ${RESERVATION_ROOM_CAP} rooms. Please adjust your selection.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const guestFields = {
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim(),
        guest_phone: fullPhone,
        nationality: nationality || undefined,
        payment_preference: paymentPref,
        special_requests: specialRequests.trim() || undefined,
      };
      const body = isGroup
        ? {
            ...guestFields,
            lines: buildCartLines(
              pricedLines.map((p) => ({
                roomTypeId: p.line.roomType.id,
                rooms: p.rooms.map((r) => ({
                  key: r.key,
                  adults: r.adults,
                  children: r.children,
                })),
              })),
              { checkIn, checkOut }
            ),
          }
        : {
            room_type_id: pricedLines[0].line.roomType.id,
            check_in: checkIn,
            check_out: checkOut,
            adults: pricedLines[0].rooms[0].adults,
            children: pricedLines[0].rooms[0].children,
            rooms_count: 1,
            ...guestFields,
          };

      const res = await fetch(`/api/booking/${slug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409) {
          toast.danger(
            data?.error ??
              "A room was just taken for these dates. Adjust your selection or change your dates."
          );
          setAvailNonce((n) => n + 1);
          goToSection(1);
          return;
        }
        if (res.status === 410 || res.status === 400) {
          toast.danger(
            data?.error ??
              "Reservation failed. Please check your details and try again."
          );
          if (res.status === 410) goToSection(1);
          return;
        }
        toast.danger(
          data?.error ?? "Reservation failed. Please check your details."
        );
        return;
      }
      if (data.paymentRequired && data.authorizationUrl) {
        window.location.assign(data.authorizationUrl);
        return;
      }
      router.push(`/${slug}/confirmation?reference=${data.reference}`);
    } catch {
      toast.danger("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canReachStep = (step: BookingStepId) =>
    step === 1 || (step === 2 && step1Valid);

  const selectedNames = pricedLines.map((p) => p.line.roomType.name).join(", ");
  const propertyAddress = Array.from(
    new Set(
      [hotel.address?.trim(), hotel.city?.trim()].filter(
        (v): v is string => Boolean(v)
      )
    )
  ).join(", ");
  const partySummary = occupancyText(totalAdults, totalChildren);

  const galleryResolved = galleryRoom
    ? resolvedPrices[galleryRoom.id]
    : undefined;
  const galleryBlocked = galleryRoom
    ? galleryResolved?.availableCount === 0 ||
      !!galleryResolved?.restrictionReason
    : false;
  const galleryLine = galleryRoom ? (lineById.get(galleryRoom.id) ?? null) : null;
  const galleryInCart = galleryLine !== null;
  const galleryMaxSelectable = galleryRoom
    ? galleryLine
      ? Math.min(maxRoomsFor(galleryRoom), galleryLine.rooms.length + roomAllowance)
      : Math.min(maxRoomsFor(galleryRoom), Math.max(1, roomAllowance))
    : 1;
  const gallerySelectedQty = galleryRoom
    ? galleryLine
      ? galleryLine.rooms.length
      : Math.max(
          1,
          Math.min(
            pendingQtyById[galleryRoom.id] ?? roomsCount,
            Math.max(1, galleryMaxSelectable)
          )
        )
    : 1;

  return (
    <>
      <div className="min-h-[100dvh] flex flex-col bg-[#F5F5F5]">
        <a href="#booking-main" className="booking-skip-link">
          Skip to booking
        </a>

        <BookingHeader
          hotelName={hotel.name}
          logoUrl={hotel.logoUrl}
          currentStep={section}
          onBrandClick={section > 1 ? () => goToSection(1) : undefined}
          canReachStep={canReachStep}
          onStepChange={goToSection}
        />

        <main id="booking-main" className="flex-1 w-full">
          {/* ══════════════════════════════════════════════════════════════
           *  STEP 1 · Choose stay (`dZjQo` Desktop / `v24Sj` Mobile)
           * ══════════════════════════════════════════════════════════════ */}
          {section === 1 && (
            <div className="pb-28 md:pb-24">
              {/* Search bar section */}
              <div className="mx-auto max-w-[1440px] booking-safe-x py-4 md:py-6 flex justify-center">
                {/* Desktop floating white pill (`Z5y4nf`) */}
                <div className="hidden md:inline-flex h-16 items-center gap-2 rounded-3xl bg-white p-2 shadow-[0_6px_16px_rgb(0_0_0/0.12)]">
                  <BookingDateRangePicker
                    checkIn={checkIn}
                    checkOut={checkOut}
                    minDate={minDate}
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
                  <button
                    type="button"
                    onClick={() => {
                      setAvailNonce((n) => n + 1);
                      roomsListRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                      });
                    }}
                    aria-label="Check room availability"
                    className="flex size-[52px] shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[#0485F7] text-[#FCFCFC] hover:bg-[#0374DB] active:scale-[0.98] transition-all"
                  >
                    {priceLoading ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Search className="size-5" strokeWidth={2.2} />
                    )}
                  </button>
                </div>

                {/* Mobile search card (`v9CRG`) */}
                <div className="flex md:hidden w-full flex-col gap-3 rounded-2xl bg-white p-3 shadow-[0_2px_6px_rgb(0_0_0/0.08)]">
                  <div className="grid grid-cols-2 gap-3">
                    <BookingDateRangePicker
                      checkIn={checkIn}
                      checkOut={checkOut}
                      minDate={minDate}
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
                  <button
                    type="button"
                    onClick={() => {
                      setAvailNonce((n) => n + 1);
                      roomsListRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                      });
                    }}
                    className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0485F7] text-sm font-semibold text-[#FCFCFC] hover:bg-[#0374DB] active:scale-[0.99] transition-all touch-manipulation"
                  >
                    {priceLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" strokeWidth={2.25} />
                    )}
                    <span>Check availability</span>
                  </button>
                </div>
              </div>

              {/* Room cards list (`f4QPSd` Desktop / `vaBn2` Mobile) */}
              <div
                ref={roomsListRef}
                className="mx-auto max-w-[1440px] booking-safe-x pt-0 md:pt-1 space-y-4 md:space-y-6"
              >
                {roomTypes.length === 0 ? (
                  <div className="rounded-3xl bg-white p-12 text-center border border-[#E4E4E7]">
                    <p className="text-sm text-[#71717A]">
                      No rooms are available for booking yet.
                    </p>
                  </div>
                ) : (
                  sortedRooms.map((rt) => {
                    const line = lineById.get(rt.id) ?? null;
                    const maxForType = maxRoomsFor(rt);
                    const maxSelectable = line
                      ? Math.min(
                          maxForType,
                          line.rooms.length + roomAllowance
                        )
                      : Math.min(maxForType, Math.max(1, roomAllowance));
                    const pendingQty = Math.max(
                      1,
                      Math.min(
                        pendingQtyById[rt.id] ?? roomsCount,
                        Math.max(1, maxSelectable)
                      )
                    );

                    return (
                      <StayRoomCard
                        key={rt.id}
                        room={rt}
                        displayPrice={
                          resolvedPrices[rt.id]?.displayPrice ?? rt.basePrice
                        }
                        taxEnabled={hotel.taxEnabled}
                        priceLoading={priceLoading}
                        availableCount={
                          resolvedPrices[rt.id]?.availableCount ?? null
                        }
                        restrictionReason={
                          resolvedPrices[rt.id]?.restrictionReason ?? null
                        }
                        line={line}
                        selectedQty={line ? line.rooms.length : pendingQty}
                        maxSelectable={Math.max(1, maxSelectable)}
                        atLimit={
                          !line &&
                          (lines.length >= MAX_ROOM_TYPES || roomAllowance <= 0)
                        }
                        fmtNightly={fmtNightly}
                        onQtyChange={(qty) => {
                          if (line) {
                            setLineRoomCount(rt, qty);
                          } else {
                            setPendingQtyById((prev) => ({
                              ...prev,
                              [rt.id]: qty,
                            }));
                          }
                        }}
                        onBook={() => addLineWithQty(rt, pendingQty)}
                        onRemove={() => removeLine(rt.id)}
                        onRoomAdults={(key, a) =>
                          updateRoom(rt.id, key, { adults: a })
                        }
                        onRoomChildren={(key, c) =>
                          updateRoom(rt.id, key, { children: c })
                        }
                        onPhotos={() => setGalleryRoom(rt)}
                      />
                    );
                  })
                )}
              </div>

              {/* Sticky bottom selection bar (`cdfmZ` Desktop / `UfKwz` Mobile) */}
              <div className="fixed inset-x-0 bottom-0 z-35 bg-white border-t border-[#E4E4E7] pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto max-w-[1440px] booking-safe-x py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {totalRooms > 0 ? (
                      <>
                        <p className="text-sm font-semibold text-[#18181B] truncate">
                          {totalRooms} {totalRooms === 1 ? "room" : "rooms"}{" "}
                          selected
                        </p>
                        <p className="text-2xs text-[#71717A] truncate">
                          {selectedNames} · {nights}{" "}
                          {nights === 1 ? "night" : "nights"}
                        </p>
                        <p className="md:hidden booking-mono text-xs font-semibold text-[#18181B] mt-1">
                          {fmt(total)} total
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-[#18181B]">
                          No rooms selected
                        </p>
                        <p className="text-2xs text-[#71717A]">
                          Select one or more rooms above to continue
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {totalRooms > 0 && (
                      <div className="hidden md:flex flex-col items-end">
                        <span className="text-2xs text-[#71717A]">
                          Total
                        </span>
                        <span className="booking-mono text-lg font-semibold tracking-[-0.3px] text-[#18181B]">
                          {fmt(total)}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={!step1Valid}
                      onClick={() => goToSection(2)}
                      className="booking-btn-primary h-10 px-4 text-md md:text-base cursor-pointer touch-manipulation shrink-0"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
           *  STEP 2 · Personal details (`Sx3Ue` Desktop / `yexEC` Mobile / `s6bjj` Error)
           * ══════════════════════════════════════════════════════════════ */}
          {section === 2 && (
            <div className="mx-auto max-w-[1440px] booking-safe-x py-4 md:py-8 pb-28 lg:pb-12">
              <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-6">
                {/* Mobile top Booking + Price Summary Card (`hBo0z` in `yexEC`) */}
                <div className="lg:hidden rounded-2xl bg-white border border-[#E4E4E7] p-4 space-y-3">
                  <p className="text-md font-semibold text-[#18181B]">
                    Booking summary
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[#18181B]">
                        Check-in
                      </p>
                      <p className="text-2xs text-[#71717A]">
                        {fmtFullDate(checkIn)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[#18181B]">
                        Check-out
                      </p>
                      <p className="text-2xs text-[#71717A]">
                        {fmtFullDate(checkOut)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[#18181B]">
                      Your booking
                    </p>
                    <p className="text-2xs text-[#71717A]">
                      {nights} {nights === 1 ? "night" : "nights"},{" "}
                      {totalRooms} {totalRooms === 1 ? "room" : "rooms"} ·{" "}
                      {partySummary}
                    </p>
                    <p className="text-2xs text-[#71717A] truncate">
                      {selectedNames}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToSection(1)}
                    className="text-xs font-medium text-[#0485F7] hover:underline cursor-pointer"
                  >
                    Change selection
                  </button>

                  <div className="h-px bg-[#E4E4E7]" />

                  <div className="space-y-2">
                    <p className="text-md font-semibold text-[#18181B]">
                      Price summary
                    </p>
                    {pricedLines.map((p) => (
                      <div
                        key={p.line.id}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-[#71717A] truncate">
                          {p.qty > 1 ? `${p.qty} × ` : ""}
                          {p.line.roomType.name} · {nights}{" "}
                          {nights === 1 ? "night" : "nights"}
                        </span>
                        <span className="booking-mono font-medium text-[#18181B] shrink-0">
                          {fmt(p.subtotal)}
                        </span>
                      </div>
                    ))}
                    {hotel.taxEnabled && taxAmount > 0 && (
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-[#71717A]">
                          Taxes & fees ({hotel.taxPercentage}%)
                        </span>
                        <span className="booking-mono font-medium text-[#18181B] shrink-0">
                          {fmt(taxAmount)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span className="text-sm font-semibold text-[#18181B]">
                        Total
                      </span>
                      <span className="booking-mono text-md font-semibold tracking-[-0.3px] text-[#18181B]">
                        {fmt(total)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Left / Main Form Column */}
                <div className="flex-1 min-w-0 space-y-4 md:space-y-6">
                  <div className="hidden lg:block space-y-1">
                    <h1 className="text-[26px] font-semibold tracking-[-0.3px] text-[#18181B] leading-tight">
                      Personal details
                    </h1>
                    <p className="text-sm text-[#71717A]">
                      We will send your confirmation here.
                    </p>
                  </div>

                  {/* Personal details form card (`Rh0GS` / `T5co9` / `s6bjj`) */}
                  <div className="rounded-2xl md:rounded-3xl bg-white border border-[#E4E4E7] p-4 md:p-6 space-y-4 md:space-y-4">
                    <p className="lg:hidden text-md font-semibold text-[#18181B]">
                      Personal details
                    </p>

                    {/* Full name */}
                    <div className="space-y-2">
                      <label
                        htmlFor="bk-full-name"
                        className="block text-xs font-medium text-[#18181B]"
                      >
                        Full name
                      </label>
                      <div
                        className={`flex h-11 md:h-10 items-center gap-2 rounded-xl bg-white px-3 border transition-colors focus-within:border-[#0485F7] focus-within:ring-2 focus-within:ring-[#0485F7]/15 ${
                          touched.name && !nameOk
                            ? "border-[#FF383C]"
                            : "border-[#DEDEE0]"
                        }`}
                      >
                        <User
                          className="size-4 shrink-0 text-[#71717A]"
                          strokeWidth={2}
                        />
                        <input
                          id="bk-full-name"
                          type="text"
                          autoComplete="name"
                          placeholder="Ama Mensah"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          onBlur={() =>
                            setTouched((t) => ({ ...t, name: true }))
                          }
                          aria-invalid={touched.name && !nameOk}
                          className="w-full bg-transparent text-sm text-[#18181B] placeholder:text-[#A1A1AA] outline-none"
                        />
                      </div>
                      {touched.name && !nameOk ? (
                        <p className="flex items-center gap-2 text-2xs text-[#FF383C]">
                          <CircleAlert className="size-3 shrink-0" />
                          <span>Enter your full name</span>
                        </p>
                      ) : (
                        <p className="text-2xs text-[#71717A]">
                          As it appears on your ID
                        </p>
                      )}
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                      <label
                        htmlFor="bk-email"
                        className="block text-xs font-medium text-[#18181B]"
                      >
                        Email
                      </label>
                      <div
                        className={`flex h-11 md:h-10 items-center gap-2 rounded-xl bg-white px-3 border transition-colors focus-within:border-[#0485F7] focus-within:ring-2 focus-within:ring-[#0485F7]/15 ${
                          touched.email && !emailOk
                            ? "border-[#FF383C]"
                            : "border-[#DEDEE0]"
                        }`}
                      >
                        <Mail
                          className="size-4 shrink-0 text-[#71717A]"
                          strokeWidth={2}
                        />
                        <input
                          id="bk-email"
                          type="email"
                          autoComplete="email"
                          placeholder="ama.mensah@example.com"
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          onBlur={() =>
                            setTouched((t) => ({ ...t, email: true }))
                          }
                          aria-invalid={touched.email && !emailOk}
                          className="w-full bg-transparent text-sm text-[#18181B] placeholder:text-[#A1A1AA] outline-none"
                        />
                      </div>
                      {touched.email && !emailOk && (
                        <p className="flex items-center gap-2 text-2xs text-[#FF383C]">
                          <CircleAlert className="size-3 shrink-0" />
                          <span>Enter a valid email address</span>
                        </p>
                      )}
                    </div>

                    {/* Phone (`GeH5J` split prefix + number) */}
                    <div className="space-y-2">
                      <label
                        htmlFor="bk-phone"
                        className="block text-xs font-medium text-[#18181B]"
                      >
                        Phone
                      </label>
                      <div
                        className={`flex h-11 md:h-10 items-stretch overflow-hidden rounded-xl bg-white border transition-colors focus-within:border-[#0485F7] focus-within:ring-2 focus-within:ring-[#0485F7]/15 ${
                          touched.phone && !phoneOk
                            ? "border-[#FF383C]"
                            : "border-[#DEDEE0]"
                        }`}
                      >
                        <span className="inline-flex shrink-0 items-center bg-[#F5F5F5] border-r border-[#DEDEE0] px-3 text-xs font-medium text-[#71717A] select-none">
                          {selectedCountryCode} {selectedDialCode}
                        </span>
                        <input
                          id="bk-phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel-national"
                          placeholder={phonePlaceholder}
                          value={localPhone}
                          onChange={(e) => setLocalPhone(e.target.value)}
                          onBlur={() =>
                            setTouched((t) => ({ ...t, phone: true }))
                          }
                          aria-invalid={touched.phone && !phoneOk}
                          className="w-full bg-transparent px-3 text-sm text-[#18181B] placeholder:text-[#A1A1AA] outline-none"
                        />
                      </div>
                      {touched.phone && !phoneOk && (
                        <p className="flex items-center gap-2 text-2xs text-[#FF383C]">
                          <CircleAlert className="size-3 shrink-0" />
                          <span>Enter a valid phone number</span>
                        </p>
                      )}
                    </div>

                    {/* Nationality (`XOZ86`) */}
                    <div className="space-y-2">
                      <span className="block text-xs font-medium text-[#18181B]">
                        Nationality
                      </span>
                      <Select
                        aria-label="Nationality"
                        placeholder="Select country"
                        value={nationality || null}
                        onChange={(value) => {
                          if (value) setNationality(String(value));
                        }}
                        className="w-full"
                      >
                        <Select.Trigger className="h-11 md:h-10 w-full rounded-xl border border-[#DEDEE0] bg-white px-3 text-sm text-[#18181B] flex items-center justify-between shadow-none hover:border-[#A1A1AA] focus-visible:border-[#0485F7]">
                          <Select.Value>
                            {({ defaultChildren, isPlaceholder }) => {
                              if (isPlaceholder || !selectedCountryObj) {
                                return (
                                  <span className="flex items-center gap-2 text-[#71717A]">
                                    <Flag className="size-4 shrink-0 text-[#71717A]" />
                                    <span>{defaultChildren}</span>
                                  </span>
                                );
                              }
                              return (
                                <span className="flex items-center gap-2 truncate text-[#18181B]">
                                  <Flag className="size-4 shrink-0 text-[#71717A]" />
                                  <span className="truncate">
                                    {selectedCountryObj.name}
                                  </span>
                                </span>
                              );
                            }}
                          </Select.Value>
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover className="booking-portal p-1 max-h-64 overflow-y-auto bg-white border border-[#E4E4E7] rounded-2xl shadow-[0_12px_28px_rgb(0_0_0/0.12)] z-50 text-[#18181B]">
                          <ListBox>
                            {countryList.map((c) => (
                              <ListBox.Item
                                key={c.name}
                                id={c.name}
                                textValue={`${c.name} ${c.dialCode}`}
                                className="text-sm px-3 py-2 rounded-lg cursor-pointer hover:bg-[#F5F5F5] flex items-center gap-2 text-[#18181B]"
                              >
                                <span
                                  className="text-base leading-none"
                                  aria-hidden
                                >
                                  {c.flag}
                                </span>
                                <span className="flex-1 truncate">
                                  {c.name}
                                </span>
                                {c.dialCode ? (
                                  <span className="text-xs text-[#71717A] shrink-0">
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

                    {/* Special requests (`uFOXF`) */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowExtras((v) => !v)}
                        aria-expanded={showExtras}
                        className="flex w-full items-center justify-between rounded-xl bg-[#F5F5F5] hover:bg-[#EBEBEC]/75 px-3 py-3 text-sm font-medium text-[#18181B] transition-colors cursor-pointer touch-manipulation"
                      >
                        <span>Special requests</span>
                        {showExtras ? (
                          <ChevronUp className="size-4 text-[#71717A]" />
                        ) : (
                          <ChevronDown className="size-4 text-[#71717A]" />
                        )}
                      </button>

                      {showExtras && (
                        <div className="mt-3">
                          <textarea
                            rows={3}
                            placeholder="Early check-in, quiet room, high floor..."
                            value={specialRequests}
                            onChange={(e) => setSpecialRequests(e.target.value)}
                            className="w-full resize-none rounded-xl border border-[#DEDEE0] bg-white px-3 py-3 text-sm text-[#18181B] placeholder:text-[#A1A1AA] outline-none focus:border-[#0485F7] focus:ring-2 focus:ring-[#0485F7]/15"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Payment selection card (`DhW2Y` / `ultj7`) */}
                  {hotel.paymentPolicy === "choice" && hotel.hasPaystack && (
                    <div className="rounded-2xl md:rounded-3xl bg-white border border-[#E4E4E7] p-4 md:p-6 space-y-3 md:space-y-3">
                      <h2 className="text-md font-semibold text-[#18181B]">
                        Payment
                      </h2>

                      {(
                        [
                          {
                            id: "pay_now" as const,
                            title: "Pay online",
                            desc: "Card or mobile money · instant confirmation",
                          },
                          {
                            id: "pay_at_checkin" as const,
                            title: "Pay on arrival",
                            desc: "Reserve free · settle at check-in",
                          },
                        ] as const
                      ).map((opt) => {
                        const active = paymentPref === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setPaymentPref(opt.id)}
                            aria-pressed={active}
                            className={`flex w-full items-center gap-3 rounded-xl bg-white p-3 md:p-4 text-left transition-colors cursor-pointer touch-manipulation ${
                              active
                                ? "border-[1.5px] border-[#0485F7]"
                                : "border border-[#E4E4E7] hover:border-[#DEDEE0]"
                            }`}
                          >
                            {active ? (
                              <CircleCheckBig
                                className="size-4 md:size-5 shrink-0 text-[#0485F7]"
                                strokeWidth={2}
                              />
                            ) : (
                              <Circle
                                className="size-4 md:size-5 shrink-0 text-[#A1A1AA]"
                                strokeWidth={1.75}
                              />
                            )}
                            <span className="flex flex-col gap-1 min-w-0">
                              <span className="text-sm font-semibold text-[#18181B]">
                                {opt.title}
                              </span>
                              <span className="text-2xs md:text-xs text-[#71717A]">
                                {opt.desc}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Booking details card (`FPIqF` Desktop / `z0O03` Mobile) */}
                  <div className="rounded-2xl md:rounded-3xl bg-white border border-[#E4E4E7] p-4 md:p-6 space-y-3">
                    <h2 className="text-md font-semibold text-[#18181B]">
                      Booking details
                    </h2>

                    {/* Desktop nightly breakdown with room thumbnails */}
                    <div className="hidden md:block space-y-3">
                      {pricedLines.map((p, idx) => {
                        const img = p.line.roomType.images[0]?.url ?? null;
                        const lineAdults = p.rooms.reduce(
                          (s, r) => s + r.adults,
                          0
                        );
                        const lineChildren = p.rooms.reduce(
                          (s, r) => s + r.children,
                          0
                        );
                        return (
                          <React.Fragment key={p.line.id}>
                            {idx > 0 && <div className="h-px bg-[#E4E4E7]" />}
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-[#EBEBEC]">
                                  {img ? (
                                    <Image
                                      src={img}
                                      alt=""
                                      fill
                                      className="object-cover"
                                      sizes="64px"
                                    />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-2xs font-semibold text-[#71717A]">
                                      {p.line.roomType.name
                                        .slice(0, 2)
                                        .toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[#18181B] truncate">
                                    {p.qty > 1 ? `${p.qty} × ` : ""}
                                    {p.line.roomType.name}
                                  </p>
                                  <p className="text-xs text-[#71717A]">
                                    {occupancyText(lineAdults, lineChildren)}
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-2">
                                {p.nightlyBreakdown.map((night) => (
                                  <div
                                    key={night.date}
                                    className="flex items-center justify-between gap-4 text-sm"
                                  >
                                    <span className="text-[#18181B]">
                                      {fmtFullDate(night.date)}
                                    </span>
                                    <span className="booking-mono font-medium text-[#18181B]">
                                      {fmt(night.price * p.qty)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Mobile compact breakdown (`z0O03`) */}
                    <div className="md:hidden space-y-2">
                      {pricedLines.map((p) => (
                        <div
                          key={p.line.id}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="text-[#71717A] truncate">
                            {p.qty > 1 ? `${p.qty} × ` : ""}
                            {p.line.roomType.name} · {nights}{" "}
                            {nights === 1 ? "night" : "nights"}
                          </span>
                          <span className="booking-mono font-medium text-[#18181B] shrink-0">
                            {fmt(p.subtotal)}
                          </span>
                        </div>
                      ))}
                      {hotel.taxEnabled && taxAmount > 0 && (
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-[#71717A]">
                            Taxes & fees ({hotel.taxPercentage}%)
                          </span>
                          <span className="booking-mono font-medium text-[#18181B] shrink-0">
                            {fmt(taxAmount)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <span className="text-sm font-semibold text-[#18181B]">
                          Total
                        </span>
                        <span className="booking-mono text-sm font-semibold tracking-[-0.3px] text-[#18181B]">
                          {fmt(total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment terms & Cancellation policy (`ug5Ji` / `R81iF`) */}
                  <div className="rounded-2xl md:rounded-3xl bg-white border border-[#E4E4E7] p-4 md:p-6 space-y-2">
                    <p className="text-xs md:text-sm font-semibold text-[#18181B]">
                      Payment terms
                    </p>
                    <p className="text-2xs md:text-xs leading-4 text-[#71717A]">
                      {hotel.paymentPolicy === "pay_later_only" ||
                      !hotel.hasPaystack
                        ? "Reserve online now and settle your balance directly at the hotel during check-in."
                        : hotel.paymentPolicy === "pay_now_only"
                          ? "Full payment is processed securely online to confirm your reservation immediately."
                          : "Pay online on our secure payment page, or pay at the hotel at check-in."}
                    </p>
                    {hotel.cancellationPolicy && (
                      <>
                        <p className="pt-1 text-xs md:text-sm font-semibold text-[#18181B]">
                          Cancellation policy
                        </p>
                        <p className="text-2xs md:text-xs leading-4 text-[#71717A]">
                          {hotel.cancellationPolicy}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Desktop Right Sticky Booking + Price Summary Card (`kuDtR`) */}
                <aside className="hidden lg:block w-[400px] xl:w-[440px] shrink-0 sticky top-24">
                  <div className="rounded-3xl bg-white p-6 shadow-[0_2px_4px_rgb(0_0_0/0.04)] space-y-3">
                    <h2 className="text-lg font-semibold text-[#18181B]">
                      Booking summary
                    </h2>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[#18181B]">
                          Check-in
                        </p>
                        <p className="text-xs text-[#71717A]">
                          {fmtFullDate(checkIn)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[#18181B]">
                          Check-out
                        </p>
                        <p className="text-xs text-[#71717A]">
                          {fmtFullDate(checkOut)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#18181B]">
                        Your booking
                      </p>
                      <p className="text-xs text-[#71717A]">
                        {nights} {nights === 1 ? "night" : "nights"},{" "}
                        {totalRooms} {totalRooms === 1 ? "room" : "rooms"}
                      </p>
                      <p className="text-xs text-[#71717A]">
                        {partySummary}
                      </p>
                      <p className="text-xs text-[#71717A]">
                        {selectedNames}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#18181B]">
                        Property
                      </p>
                      <p className="text-xs text-[#71717A]">{hotel.name}</p>
                      {propertyAddress && (
                        <p className="text-xs text-[#71717A]">
                          {propertyAddress}
                        </p>
                      )}
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => goToSection(1)}
                        className="text-sm font-medium text-[#0485F7] hover:underline cursor-pointer"
                      >
                        Change selection
                      </button>
                    </div>

                    <div className="h-px bg-[#E4E4E7]" />

                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-[#18181B]">
                        Price summary
                      </h3>
                      {pricedLines.map((p) => (
                        <div
                          key={p.line.id}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="text-[#71717A] truncate">
                            {p.qty > 1 ? `${p.qty} × ` : ""}
                            {p.line.roomType.name} · {nights}{" "}
                            {nights === 1 ? "night" : "nights"}
                          </span>
                          <span className="booking-mono font-medium text-[#18181B] shrink-0">
                            {fmt(p.subtotal)}
                          </span>
                        </div>
                      ))}
                      {hotel.taxEnabled && taxAmount > 0 && (
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-[#71717A]">
                            Taxes & fees ({hotel.taxPercentage}%)
                          </span>
                          <span className="booking-mono font-medium text-[#18181B] shrink-0">
                            {fmt(taxAmount)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <span className="text-md font-semibold text-[#18181B]">
                          Total
                        </span>
                        <span className="booking-mono text-xl font-semibold tracking-[-0.3px] text-[#18181B]">
                          {fmt(total)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleBookSubmit}
                      className="booking-btn-primary h-10 w-full text-base inline-flex items-center justify-center gap-2 cursor-pointer touch-manipulation"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <span>Book now</span>
                      )}
                    </button>

                    <p className="flex items-center justify-center gap-2 text-2xs text-[#71717A] pt-1">
                      <Lock className="size-3 text-[#A1A1AA]" />
                      <span>Payments are secure and encrypted.</span>
                    </p>
                  </div>
                </aside>
              </div>

              {/* Mobile sticky Book now footer (`dImCB` / `vTN1Q`) */}
              <div className="lg:hidden fixed inset-x-0 bottom-0 z-35 bg-white border-t border-[#E4E4E7] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleBookSubmit}
                  className="booking-btn-primary h-10 w-full text-base inline-flex items-center justify-center gap-2 cursor-pointer touch-manipulation"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Book now</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {galleryRoom && (
        <RoomGallery
          open={!!galleryRoom}
          onClose={() => setGalleryRoom(null)}
          images={galleryRoom.images}
          roomName={galleryRoom.name}
          shortDescription={galleryRoom.shortDescription}
          description={galleryRoom.description}
          bedConfiguration={galleryRoom.bedConfiguration}
          maxAdults={galleryRoom.maxAdults}
          maxChildren={galleryRoom.maxChildren}
          amenities={galleryRoom.amenities}
          formattedPrice={fmtNightly(
            galleryResolved?.displayPrice ?? galleryRoom.basePrice
          )}
          taxEnabled={hotel.taxEnabled}
          availableCount={galleryResolved?.availableCount ?? null}
          restrictionReason={galleryResolved?.restrictionReason ?? null}
          selectedQty={gallerySelectedQty}
          maxSelectable={Math.max(1, galleryMaxSelectable)}
          inCart={galleryInCart}
          blocked={galleryBlocked}
          atLimit={
            !galleryInCart &&
            (lines.length >= MAX_ROOM_TYPES || roomAllowance <= 0)
          }
          onQtyChange={(qty) => {
            if (galleryLine) {
              setLineRoomCount(galleryRoom, qty);
            } else {
              setPendingQtyById((prev) => ({
                ...prev,
                [galleryRoom.id]: qty,
              }));
            }
          }}
          onBook={() => addLineWithQty(galleryRoom, gallerySelectedQty)}
        />
      )}
    </>
  );
}

/**
 * Room card matching `dZjQo` (Desktop horizontal) and `v24Sj` (Mobile vertical).
 */
function StayRoomCard({
  room,
  displayPrice,
  taxEnabled,
  priceLoading,
  availableCount,
  restrictionReason,
  line,
  selectedQty,
  maxSelectable,
  atLimit,
  fmtNightly,
  onQtyChange,
  onBook,
  onRemove,
  onRoomAdults,
  onRoomChildren,
  onPhotos,
}: {
  room: WizardRoomType;
  displayPrice: number;
  taxEnabled: boolean;
  priceLoading: boolean;
  availableCount: number | null;
  restrictionReason: string | null;
  line: CartLine | null;
  selectedQty: number;
  maxSelectable: number;
  atLimit: boolean;
  fmtNightly: (n: number) => string;
  onQtyChange: (qty: number) => void;
  onBook: () => void;
  onRemove: () => void;
  onRoomAdults: (key: string, adults: number) => void;
  onRoomChildren: (key: string, children: number) => void;
  onPhotos: () => void;
}) {
  const [customizeGuests, setCustomizeGuests] = React.useState(false);
  const img = room.images[0]?.url ?? null;
  const hasPhotos = room.images.length > 0;
  const soldOut = availableCount === 0;
  const blocked = soldOut || restrictionReason !== null;
  const scarce =
    !blocked &&
    availableCount !== null &&
    availableCount > 0 &&
    availableCount <= 2;
  const inCart = line !== null;

  const sleepsLabel =
    room.maxChildren > 0
      ? `Sleeps ${room.maxAdults} ${
          room.maxAdults === 1 ? "adult" : "adults"
        } + ${room.maxChildren} ${
          room.maxChildren === 1 ? "child" : "children"
        }`
      : `Sleeps ${room.maxAdults} ${room.maxAdults === 1 ? "adult" : "adults"}`;

  const qtyOptions = Array.from({ length: maxSelectable }, (_, i) => i + 1);

  return (
    <div
      data-selected={inCart ? "true" : "false"}
      className="booking-room-card overflow-hidden"
    >
      <div className="flex flex-col md:flex-row md:min-h-[196px]">
        {/* Room photo (`LAgSX` 400x196 Desktop / `U6BSeF` fullx190 Mobile) */}
        <div
          className="relative h-48 w-full md:h-auto md:w-[320px] lg:w-[400px] shrink-0 bg-[#EBEBEC] overflow-hidden cursor-pointer group"
          onClick={onPhotos}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPhotos();
            }
          }}
          aria-label={`View details and photos of ${room.name}`}
        >
          {img ? (
            <Image
              src={img}
              alt={room.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 767px) 100vw, 400px"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-semibold text-[#A1A1AA] tracking-wider">
                {room.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
          )}

          {blocked && !inCart && (
            <div className="absolute inset-0 bg-[#E4E4E7]/70" />
          )}

          {hasPhotos && !blocked && (
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/92 backdrop-blur-md px-3 py-1 text-2xs font-semibold text-[#18181B] shadow-[0_1px_4px_rgb(0_0_0/0.12)]">
              <Images className="size-3 text-[#0485F7]" />
              {room.images.length}
            </span>
          )}
        </div>

        {/* Room details & controls */}
        <div className="flex flex-1 flex-col justify-between gap-2 p-4 md:px-6 md:py-6 min-w-0">
          <div className="space-y-2">
            {/* Metadata row: Bed + Sleeps */}
            <div
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs md:text-xs ${
                blocked && !inCart ? "text-[#A1A1AA]" : "text-[#71717A]"
              }`}
            >
              {room.bedConfiguration && (
                <span className="inline-flex items-center gap-2">
                  <BedDouble className="size-4 shrink-0" strokeWidth={1.75} />
                  <span>{room.bedConfiguration}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <Users className="size-4 shrink-0" strokeWidth={1.75} />
                <span>{sleepsLabel}</span>
              </span>
            </div>

            {/* Room title + scarcity chip */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onPhotos}
                className={`text-left text-md md:text-base font-semibold leading-snug hover:text-[#0485F7] transition-colors cursor-pointer ${
                  blocked && !inCart ? "text-[#71717A]" : "text-[#18181B]"
                }`}
              >
                {room.name}
              </button>
              {scarce && (
                <span className="inline-flex items-center rounded-full bg-[#F5A524]/15 px-2 py-1 text-2xs font-medium text-[#F5A524]">
                  Only {availableCount} left
                </span>
              )}
            </div>

            {/* Description */}
            {room.shortDescription && (
              <p
                className={`text-xs line-clamp-2 ${
                  blocked && !inCart ? "text-[#A1A1AA]" : "text-[#71717A]"
                }`}
              >
                {room.shortDescription}
              </p>
            )}

            {restrictionReason && !soldOut && (
              <p className="text-2xs font-medium text-[#F5A524]">
                {restrictionReason}
              </p>
            )}
          </div>

          {/* Bottom bar: Unavailable pill OR Price + Qty selector + Book CTA */}
          {blocked && !inCart ? (
            <div className="pt-2 flex items-end justify-between">
              <span className="inline-flex h-11 w-full md:w-[160px] items-center justify-center rounded-full bg-[#EBEBEC] text-sm font-medium text-[#A1A1AA]">
                Not available
              </span>
            </div>
          ) : (
            <div className="pt-2 space-y-3 md:space-y-0">
              <div className="flex items-end justify-between gap-3">
                {/* Price */}
                <div className="space-y-1 min-w-0">
                  <p
                    className={`booking-mono text-xl md:text-[22px] font-semibold tracking-[-0.3px] text-[#18181B] leading-tight ${
                      priceLoading ? "opacity-45" : ""
                    }`}
                  >
                    {fmtNightly(displayPrice)}
                  </p>
                  <p className="text-2xs text-[#71717A]">
                    {taxEnabled
                      ? "per night · excl. taxes & fees"
                      : "per night"}
                  </p>
                </div>

                {/* Room qty selector + Desktop Book button */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="relative">
                    <select
                      aria-label={`Number of rooms for ${room.name}`}
                      value={selectedQty}
                      disabled={atLimit && !inCart}
                      onChange={(e) =>
                        onQtyChange(Number.parseInt(e.target.value, 10))
                      }
                      className="h-10 md:h-10 w-[96px] md:w-[104px] appearance-none rounded-xl border border-[#DEDEE0] bg-white pl-3 pr-8 text-xs md:text-sm font-medium text-[#18181B] outline-none hover:border-[#A1A1AA] focus:border-[#0485F7] cursor-pointer disabled:opacity-50"
                    >
                      {inCart && <option value={0}>0 rooms</option>}
                      {qtyOptions.map((q) => (
                        <option key={q} value={q}>
                          {q} {q === 1 ? "room" : "rooms"}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#71717A]"
                      strokeWidth={2}
                    />
                  </div>

                  {inCart ? (
                    <div className="hidden md:flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCustomizeGuests((v) => !v)}
                        className="h-10 rounded-full border border-[#0485F7] bg-[#0485F7]/10 px-4 text-sm font-semibold text-[#0485F7] hover:bg-[#0485F7]/18 inline-flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <Check className="size-4 stroke-[2.5]" />
                        <span>Selected</span>
                      </button>
                      <button
                        type="button"
                        onClick={onRemove}
                        aria-label={`Remove ${room.name}`}
                        className="inline-flex size-10 items-center justify-center rounded-full text-[#71717A] hover:bg-[#F5F5F5] hover:text-[#FF383C] cursor-pointer transition-colors"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={atLimit}
                      onClick={onBook}
                      className="hidden md:inline-flex booking-btn-primary h-10 px-4 items-center justify-center text-base cursor-pointer touch-manipulation"
                    >
                      {atLimit ? "Limit reached" : "Book"}
                    </button>
                  )}
                </div>
              </div>

              {/* Mobile full-width Book / Selected button (`oiv2Z`) */}
              <div className="md:hidden">
                {inCart ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomizeGuests((v) => !v)}
                      className="flex-1 h-10 rounded-full border border-[#0485F7] bg-[#0485F7]/10 text-sm font-semibold text-[#0485F7] inline-flex items-center justify-center gap-2 cursor-pointer touch-manipulation"
                    >
                      <Check className="size-4 stroke-[2.5]" />
                      <span>Selected · Guests</span>
                    </button>
                    <button
                      type="button"
                      onClick={onRemove}
                      aria-label={`Remove ${room.name}`}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F5F5F5] text-[#71717A] hover:text-[#FF383C] cursor-pointer touch-manipulation"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={atLimit}
                    onClick={onBook}
                    className="booking-btn-primary h-10 w-full flex items-center justify-center text-base cursor-pointer touch-manipulation"
                  >
                    {atLimit ? "Limit reached" : "Book"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expandable per-room occupancy tuner when room is selected */}
      {line && customizeGuests && (
        <div className="border-t border-[#E4E4E7] bg-[#F5F5F5]/70 px-4 md:px-6 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#18181B]">
              Guests per room
            </span>
            <button
              type="button"
              onClick={() => setCustomizeGuests(false)}
              className="text-2xs font-medium text-[#0485F7] cursor-pointer"
            >
              Done
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {line.rooms.map((cartRoom, index) => (
              <div
                key={cartRoom.key}
                className="rounded-xl bg-white border border-[#E4E4E7] px-3 py-2"
              >
                <p className="text-2xs font-semibold text-[#71717A] pb-1">
                  Room {index + 1}
                </p>
                <NumericStepper
                  label="Adults"
                  value={cartRoom.adults}
                  min={1}
                  max={room.maxAdults}
                  onChange={(a) => onRoomAdults(cartRoom.key, a)}
                  size="sm"
                />
                <NumericStepper
                  label="Children"
                  value={cartRoom.children}
                  min={0}
                  max={childrenCapFor(room)}
                  onChange={(c) => onRoomChildren(cartRoom.key, c)}
                  size="sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
