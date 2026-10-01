"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "@heroui/react";
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
  Images,
  CreditCard,
  Landmark,
  ShieldCheck,
  ArrowLeft,
  Plus,
  X,
} from "lucide-react";
import {
  Button,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
  TextArea,
} from "@heroui/react";
import { RoomGallery } from "@/components/booking/room-gallery";
import { formatCurrency } from "@/lib/format";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { BookingDateRangePicker } from "@/components/booking/booking-date-range-picker";
import { GuestPickerPopover } from "@/components/booking/guest-picker-popover";
import { NumericStepper } from "@/components/booking/numeric-stepper";
import {
  BookingProgress,
  type BookingStepId,
} from "@/components/booking/booking-progress";
import { RESERVATION_ROOM_CAP } from "@/lib/bookings/expand-cart-lines";

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

/**
 * One room type in the cart. Keyed by room-type id, so a second "Add" of the
 * same type edits the existing card rather than stacking a duplicate. Each room
 * on the card carries its OWN occupancy — the shape Mews' booking engine returns
 * (`Reservations[]`, one per room, each with its own AdultCount/ChildCount) and
 * what the server stores: one bookings row per room sharing a group_id.
 */
interface CartLine {
  id: string;
  roomType: RoomType;
  rooms: CartRoom[];
}

/** Stable keys for cart room rows (opaque; never rendered as markup). */
let roomKeySeq = 0;
const nextRoomKey = () => `r${++roomKeySeq}`;

/** One priced cart line: its rooms, each priced and taxed on its own. */
type PricedLine = {
  line: CartLine;
  /** Sellable rooms of this card, availability-clamped and priced. */
  rooms: PricedRoom[];
  qty: number;
  nightRate: number;
  subtotal: number;
  tax: number;
  total: number;
  availableCount: number | null;
  restrictionReason: string | null;
  blocked: boolean;
};

/**
 * Per-room children cap. A positive max_children is a hard cap; 0 (the column
 * default before children capacity was surfaced) means "no explicit limit" and
 * falls back to this ceiling — so guests can always add kids when booking.
 */
const DEFAULT_MAX_CHILDREN = 6;
function childrenCapFor(rt: { maxChildren: number }): number {
  return rt.maxChildren > 0 ? rt.maxChildren : DEFAULT_MAX_CHILDREN;
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
  // Party defaults applied to the NEXT room added; each cart room then owns its
  // own occupancy, edited on the room card.
  const [adults, setAdults] = React.useState(Math.max(1, initialAdults));
  const [childrenCount, setChildrenCount] = React.useState(Math.max(0, initialChildren));
  const [roomsCount, setRoomsCount] = React.useState(Math.max(1, initialRooms));
  // Cart. A deep link (?room=) seeds the first line so the funnel opens ready.
  const [lines, setLines] = React.useState<CartLine[]>(() => {
    const seed = roomTypes.find((r) => r.id === initialRoomTypeId);
    if (!seed) return [];
    const adults = Math.min(Math.max(1, initialAdults), seed.maxAdults || 10);
    const children = Math.min(Math.max(0, initialChildren), childrenCapFor(seed));
    // `?rooms=` seeds that many rooms of the deep-linked type, each starting
    // with the party defaults; the guest then tunes occupancy per room.
    const rooms = Array.from(
      { length: Math.max(1, Math.min(initialRooms, MAX_ROOMS_PER_TYPE)) },
      () => makeRoom(nextRoomKey(), adults, children)
    );
    return [{ id: seed.id, roomType: seed, rooms }];
  });
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
    /**
     * Why the rate plan will not sell this window, already written for a guest by
     * the API. Separate from availableCount because free rooms and a sellable
     * stay are two different questions: a three-night minimum leaves the room
     * bookable, just not for these dates.
     */
    restrictionReason: string | null;
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
        if (cancelled) return;
        if (!json?.rooms) {
          // A failed rate lookup must not leave the previous window's prices on
          // screen: the guest would carry them to payment and be charged the real
          // ones. Clear them (which blocks step 1 via `pricesResolved`) and say so.
          setResolvedPrices({});
          toast.danger("Could not load live rates for these dates. Please try again.");
          return;
        }
        const map: Record<string, ResolvedPrice> = {};
        for (const room of json.rooms) {
          map[room.id] = {
            displayPrice: room.displayPrice ?? room.basePrice,
            subtotal: typeof room.subtotal === "number" ? room.subtotal : null,
            availableCount:
              typeof room.availableCount === "number" ? room.availableCount : null,
            restrictionReason:
              typeof room.restrictionReason === "string" ? room.restrictionReason : null,
          };
        }
        setResolvedPrices(map);

        // Reconcile the cart with the new dates: drop any line that is sold out or
        // no longer sellable, and clamp a card's rooms to what is left. This is
        // what stops a guest carrying a restricted or oversold stay to payment for
        // the write to refuse it.
        setLines((prev) =>
          prev
            .filter((l) => {
              const resolved = map[l.roomType.id];
              if (!resolved) return true; // absent from response — let the server judge
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
  }, [checkIn, checkOut, slug, availNonce]);

  // ── Cart mutations ──
  /** Occupancy a freshly added room starts with, clamped to the type's caps. */
  const defaultRoomFor = React.useCallback(
    (rt: RoomType): CartRoom =>
      makeRoom(
        nextRoomKey(),
        Math.min(Math.max(1, adults), rt.maxAdults || 10),
        Math.min(Math.max(0, childrenCount), childrenCapFor(rt))
      ),
    [adults, childrenCount]
  );

  const addLine = React.useCallback(
    (rt: RoomType) => {
      setLines((prev) => {
        if (prev.some((l) => l.roomType.id === rt.id)) return prev;
        if (prev.length >= MAX_ROOM_TYPES) return prev;
        const avail = resolvedPrices[rt.id]?.availableCount;
        // Party picker seeds how many rooms this type starts with; the guest
        // then adds/removes rooms and sets each room's own occupancy.
        const count = Math.max(
          1,
          Math.min(
            roomsCount,
            MAX_ROOMS_PER_TYPE,
            avail ?? MAX_ROOMS_PER_TYPE,
            remainingRoomAllowance(prev)
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
    [resolvedPrices, roomsCount, defaultRoomFor]
  );

  const removeLine = React.useCallback(
    (id: string) => setLines((prev) => prev.filter((l) => l.id !== id)),
    []
  );

  /** Adds one more room to a card, within every cap (type, availability, 10). */
  const addRoom = React.useCallback(
    (id: string) => {
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l;
          const avail = resolvedPrices[l.roomType.id]?.availableCount;
          const max = Math.min(
            MAX_ROOMS_PER_TYPE,
            avail ?? MAX_ROOMS_PER_TYPE,
            l.rooms.length + remainingRoomAllowance(prev)
          );
          if (l.rooms.length >= max) return l;
          return { ...l, rooms: [...l.rooms, defaultRoomFor(l.roomType)] };
        })
      );
    },
    [resolvedPrices, defaultRoomFor]
  );

  /** Removes one room; removing the last room removes the card. */
  const removeRoom = React.useCallback((id: string, key: string) => {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.id !== id) return [l];
        const rooms = l.rooms.filter((r) => r.key !== key);
        return rooms.length > 0 ? [{ ...l, rooms }] : [];
      })
    );
  }, []);

  /** Edits one room's occupancy. */
  const updateRoom = React.useCallback(
    (id: string, key: string, patch: Partial<Omit<CartRoom, "key">>) => {
      setLines((prev) =>
        prev.map((l) =>
          l.id === id
            ? { ...l, rooms: l.rooms.map((r) => (r.key === key ? { ...r, ...patch } : r)) }
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
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
          )
        )
      : 1;

  // 2-decimal so the displayed figures match the exact minor amount charged;
  // the compact formatter rounded GHS 450.50 to "451".
  const fmt = (n: number) => formatCurrency(n, hotel.currency);

  // Per-room pricing mirrors POST /api/booking/[slug]/bookings exactly: every
  // room is priced and taxed on its own (the server writes one row per room and
  // rounds tax per row), then the line and the cart are summed in minor units.
  const pricedLines: PricedLine[] = lines.map((l) => {
    const resolved = resolvedPrices[l.roomType.id];
    const avail = resolved?.availableCount ?? null;
    const restrictionReason = resolved?.restrictionReason ?? null;
    // Availability caps how many rooms of this type can be sold; rows beyond
    // that are not priced and never submitted.
    const sellable = avail != null ? l.rooms.slice(0, Math.max(1, avail)) : l.rooms;
    const unitSubtotal = resolved?.subtotal ?? (l.roomType.basePrice ?? 0) * nights;
    const rooms = sellable.map((room) =>
      priceRoom(room, unitSubtotal, hotel.taxEnabled ? hotel.taxPercentage : 0, hotel.currency)
    );
    const totals = sumRooms(rooms, hotel.currency);
    return {
      line: l,
      rooms,
      qty: rooms.length,
      nightRate: resolved?.displayPrice ?? l.roomType.basePrice ?? 0,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      availableCount: avail,
      restrictionReason,
      blocked: avail === 0 || restrictionReason !== null,
    };
  });
  // Sum in minor units then convert once, so the grand total equals the sum of
  // the per-line charges to the pesewa — a raw float reduce can drift.
  const cur = hotel.currency;
  const subtotalMinor = sumMinor(pricedLines.map((p) => toMinor(p.subtotal, cur)));
  const taxMinor = sumMinor(pricedLines.map((p) => toMinor(p.tax, cur)));
  const subtotal = fromMinor(subtotalMinor, cur);
  const taxAmount = fromMinor(taxMinor, cur);
  const total = fromMinor(subtotalMinor + taxMinor, cur);
  const totalRooms = pricedLines.reduce((s, p) => s + p.rooms.length, 0);

  const datesValid = !!checkIn && !!checkOut && checkOut > checkIn;
  // Every line must carry a server-resolved price before the guest may continue:
  // the base-price fallback above would display one number while the server
  // prices the real (seasonal/rate-plan) one, so a missing resolution blocks the
  // step instead of guessing.
  const pricesResolved = lines.every((l) => resolvedPrices[l.roomType.id] !== undefined);
  const step1Valid =
    lines.length >= 1 && datesValid && pricesResolved && pricedLines.every((p) => !p.blocked);

  const nameOk = guestName.trim().length > 1;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());
  const phoneOk = guestPhone.replace(/\s/g, "").length >= 7;
  const step2Valid = nameOk && emailOk && phoneOk;

  const lineById = React.useMemo(() => {
    const m = new Map<string, CartLine>();
    for (const l of lines) m.set(l.id, l);
    return m;
  }, [lines]);
  const totalById = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pricedLines) m.set(p.line.id, p.total);
    return m;
  }, [pricedLines]);

  // Rooms still allowed in this reservation, and the ceiling for one room type
  // (availability, then the product cap). The server enforces the same ceiling.
  const roomAllowance = remainingRoomAllowance(lines);
  const maxRoomsFor = React.useCallback(
    (rt: RoomType) =>
      Math.min(
        MAX_ROOMS_PER_TYPE,
        resolvedPrices[rt.id]?.availableCount ?? MAX_ROOMS_PER_TYPE
      ),
    [resolvedPrices]
  );

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

  // Anything the guest cannot book for these dates sinks to the bottom, whether
  // the rooms are gone or the rate plan is closed for the window.
  const sortedRooms = React.useMemo(() => {
    const unbookable = (id: string) => {
      const resolved = resolvedPrices[id];
      return resolved?.availableCount === 0 || resolved?.restrictionReason ? 1 : 0;
    };
    return [...roomTypes].sort((a, b) => unbookable(a.id) - unbookable(b.id));
  }, [roomTypes, resolvedPrices]);

  async function handleConfirm() {
    if (!step1Valid || !step2Valid || pricedLines.length === 0) return;
    // Two rooms of the SAME type arrive as one line with qty 2 — still two
    // rooms, so the group body is what keeps each room's check-in/check-out
    // independent (one booking row per room, linked by a group). Only a true
    // single-room cart takes the legacy single-room body.
    const isGroup = totalRooms > 1;
    if (totalRooms > RESERVATION_ROOM_CAP) {
      toast.danger(
        `A reservation can hold up to ${RESERVATION_ROOM_CAP} rooms. Split this booking into two?`
      );
      return;
    }
    setSubmitting(true);
    try {
      // Shared reservation fields — one primary guest, one payment, whatever the
      // room count. Sent identically on both the single and group paths.
      const guestFields = {
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim(),
        guest_phone: guestPhone.trim(),
        nationality: nationality || undefined,
        payment_preference: paymentPref,
        special_requests: specialRequests || undefined,
      };
      // A one-line cart posts the legacy single-room body (NULL group_id path,
      // byte-for-byte today's behaviour); 2+ rooms post the group cart, one line
      // per room so every room keeps its own occupancy.
      const body = isGroup
        ? {
            ...guestFields,
            lines: buildCartLines(
              pricedLines.map((p) => ({
                roomTypeId: p.line.roomType.id,
                rooms: p.rooms.map((r) => ({ key: r.key, adults: r.adults, children: r.children })),
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
          // A room was taken while checking out — honest copy, refresh live counts
          // (which prunes/clamps the cart), and send the guest back to step 1 with
          // everything they typed kept.
          toast.danger(
            data?.error ??
              "A room was just taken for these dates. Adjust your selection or change your dates."
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

  const payNowCta =
    paymentPref === "pay_now" &&
    (hotel.paymentPolicy === "pay_now_only" ||
      (hotel.paymentPolicy === "choice" && hotel.hasPaystack));

  // Step 1 needs room for the cart side-rail; the form steps stay a tight column.
  const mainMax = section === 1 ? "max-w-5xl" : "max-w-2xl";

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
          className={`flex-1 w-full ${mainMax} mx-auto booking-safe-x pt-5 sm:pt-8 md:pt-10 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:pb-12`}
        >
          <div className="mb-5 sm:mb-8">
            <h1 className="booking-heading text-[1.65rem] leading-tight sm:text-3xl md:text-4xl text-[var(--bk-ink)] text-balance">
              {section === 1 && "Choose your stay"}
              {section === 2 && "Guest details"}
              {section === 3 && "Review & confirm"}
            </h1>
            <p className="text-sm text-[var(--bk-muted)] mt-1.5 max-w-prose">
              {section === 1 && "Select your dates, then add one or more rooms."}
              {section === 2 && "We will send your confirmation here."}
              {section === 3 && "Double-check everything before you confirm."}
            </p>
          </div>

          {/* ── Step 1 ── */}
          {section === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:max-w-3xl">
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
                  onAdultsChange={setAdults}
                  onChildrenChange={setChildrenCount}
                  onRoomsChange={setRoomsCount}
                />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8 lg:items-start">
                {/* Room list */}
                <div className="space-y-3 min-w-0">
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
                    <div className="space-y-3">
                      {sortedRooms.map((rt) => {
                        const line = lineById.get(rt.id) ?? null;
                        return (
                          <RoomCard
                            key={rt.id}
                            room={rt}
                            currency={hotel.currency}
                            displayPrice={
                              resolvedPrices[rt.id]?.displayPrice ?? rt.basePrice
                            }
                            priceLoading={priceLoading}
                            availableCount={resolvedPrices[rt.id]?.availableCount ?? null}
                            restrictionReason={
                              resolvedPrices[rt.id]?.restrictionReason ?? null
                            }
                            line={line}
                            lineTotal={totalById.get(rt.id) ?? null}
                            atLimit={lines.length >= MAX_ROOM_TYPES && !line}
                            fmt={fmt}
                            maxRooms={maxRoomsFor(rt)}
                            canAddRoom={
                              line !== null && line.rooms.length < maxRoomsFor(rt) && roomAllowance > 0
                            }
                            onAdd={() => addLine(rt)}
                            onRemove={() => removeLine(rt.id)}
                            onAddRoom={() => addRoom(rt.id)}
                            onRemoveRoom={(key) => removeRoom(rt.id, key)}
                            onRoomAdults={(key, a) => updateRoom(rt.id, key, { adults: a })}
                            onRoomChildren={(key, c) => updateRoom(rt.id, key, { children: c })}
                            onPhotos={(e) => {
                              e.stopPropagation();
                              setGalleryRoom(rt);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Inline cart — tablet & mobile (rail is desktop only) */}
                  <div className="lg:hidden pt-1">
                    <CartSummary
                      pricedLines={pricedLines}
                      nights={nights}
                      checkIn={checkIn}
                      checkOut={checkOut}
                      taxEnabled={hotel.taxEnabled}
                      taxPercentage={hotel.taxPercentage}
                      subtotal={subtotal}
                      taxAmount={taxAmount}
                      total={total}
                      fmt={fmt}
                      onRemove={removeLine}
                    />
                  </div>

                  {/* Tablet continue (mobile uses sticky bar; desktop uses rail) */}
                  <Button
                    variant="primary"
                    size="lg"
                    isDisabled={!step1Valid}
                    onPress={() => goToSection(2)}
                    className="booking-cta w-full h-12 rounded-xl text-sm touch-manipulation hidden sm:inline-flex lg:hidden"
                  >
                    Continue
                  </Button>
                </div>

                {/* Cart rail — desktop */}
                <aside className="hidden lg:block">
                  <div className="lg:sticky lg:top-28">
                    <CartSummary
                      pricedLines={pricedLines}
                      nights={nights}
                      checkIn={checkIn}
                      checkOut={checkOut}
                      taxEnabled={hotel.taxEnabled}
                      taxPercentage={hotel.taxPercentage}
                      subtotal={subtotal}
                      taxAmount={taxAmount}
                      total={total}
                      fmt={fmt}
                      onRemove={removeLine}
                      onContinue={() => goToSection(2)}
                      canContinue={step1Valid}
                    />
                  </div>
                </aside>
              </div>
            </div>
          )}

          {/* ── Step 2 ── */}
          {section === 2 && (
            <div className="space-y-4 sm:space-y-5">
              {lines.length > 0 && (
                <div className="booking-surface-soft px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--bk-ink)] truncate">
                      {totalRooms} room{totalRooms !== 1 ? "s" : ""}
                      {lines.length > 1 ? ` · ${lines.length} types` : ""}
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
                      {selectedCountryObj ? ` · ${selectedCountryObj.name}` : ""}
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
                  Special requests
                </button>

                {showExtras && (
                  <div className="mt-3 p-4 booking-surface-soft space-y-4">
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
              {/* Reservation summary */}
              <div className="booking-surface p-4 sm:p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="booking-heading text-xl sm:text-2xl text-[var(--bk-ink)] leading-tight">
                      {totalRooms} room{totalRooms !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-[var(--bk-muted)] mt-1">
                      {fmtDate(checkIn)} - {fmtDate(checkOut)} · {nights} night
                      {nights !== 1 ? "s" : ""}
                    </p>
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

                {/* Per-line breakdown — every room reads as its own line */}
                <div className="space-y-3 border-t border-[var(--bk-line)] pt-3">
                  {pricedLines.map((p) => (
                    <div key={p.line.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--bk-ink)] truncate">
                          {p.rooms.length > 1 ? `${p.rooms.length} × ` : ""}
                          {p.line.roomType.name}
                        </p>
                        <p className="text-xs text-[var(--bk-muted)] mt-0.5">
                          {fmt(p.nightRate)}/night
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {p.rooms.map((cartRoom, index) => (
                            <li key={cartRoom.key} className="text-xs text-[var(--bk-muted)]">
                              Room {index + 1}: {occupancyText(cartRoom.adults, cartRoom.children)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <span className="booking-price text-sm text-[var(--bk-ink)] shrink-0 tabular-nums">
                        {fmt(p.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Guest + totals */}
                <div className="space-y-2 text-sm border-t border-[var(--bk-line)] pt-3">
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--bk-muted)]">Guest</span>
                    <span className="text-right font-medium text-[var(--bk-ink)]">
                      {guestName.trim()}
                      {selectedCountryObj ? ` ${selectedCountryObj.flag}` : ""}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--bk-muted)]">Subtotal</span>
                    <span className="booking-price text-[var(--bk-ink)] tabular-nums">
                      {fmt(subtotal)}
                    </span>
                  </div>
                  {taxAmount > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-[var(--bk-muted)]">
                        Taxes & fees ({hotel.taxPercentage}%)
                      </span>
                      <span className="booking-price text-[var(--bk-ink)] tabular-nums">
                        {fmt(taxAmount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline gap-4 pt-2 border-t border-[var(--bk-line)]">
                    <span className="font-semibold text-[var(--bk-ink)]">Total</span>
                    <span className="booking-heading booking-price text-2xl text-[var(--bk-ink)] tabular-nums">
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
                  ) : payNowCta ? (
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
              {lines.length > 0 ? (
                <>
                  <p className="text-[11px] text-[var(--bk-muted)] truncate">
                    {totalRooms} room{totalRooms !== 1 ? "s" : ""}
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
                  Add a room to continue
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
                  ) : payNowCta ? (
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
          slug={slug}
        />
      )}
    </>
  );
}

/**
 * Reservation cart — desktop side-rail and mobile inline. Lists every line with
 * per-line remove and a live subtotal/tax/total. `onContinue` is passed only by
 * the desktop rail (mobile advances from the sticky bar).
 */
function CartSummary({
  pricedLines,
  nights,
  checkIn,
  checkOut,
  taxEnabled,
  taxPercentage,
  subtotal,
  taxAmount,
  total,
  fmt,
  onRemove,
  onContinue,
  canContinue,
}: {
  pricedLines: PricedLine[];
  nights: number;
  checkIn: string;
  checkOut: string;
  taxEnabled: boolean;
  taxPercentage: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  fmt: (n: number) => string;
  onRemove: (id: string) => void;
  onContinue?: () => void;
  canContinue?: boolean;
}) {
  const empty = pricedLines.length === 0;
  const totalRooms = pricedLines.reduce((s, p) => s + p.rooms.length, 0);

  return (
    <div className="booking-surface p-4 sm:p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--bk-ink)]">
          Your reservation
        </h2>
        {!empty && (
          <span className="text-xs text-[var(--bk-muted)]">
            {totalRooms} room{totalRooms !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {empty ? (
        <p className="text-xs text-[var(--bk-muted)] leading-relaxed py-1">
          No rooms added yet. Choose a room to see your price.
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--bk-muted)]">
            {fmtDate(checkIn)} - {fmtDate(checkOut)} · {nights} night
            {nights !== 1 ? "s" : ""}
          </p>
          <ul className="space-y-2.5">
            {pricedLines.map((p) => (
              <li
                key={p.line.id}
                className="flex items-start justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--bk-ink)] truncate">
                    {p.rooms.length > 1 ? `${p.rooms.length} × ` : ""}
                    {p.line.roomType.name}
                    {p.blocked ? " · unavailable" : ""}
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {p.rooms.map((cartRoom, index) => (
                      <li key={cartRoom.key} className="text-[11px] text-[var(--bk-muted)]">
                        Room {index + 1}: {occupancyText(cartRoom.adults, cartRoom.children)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="booking-price text-sm text-[var(--bk-ink)] tabular-nums">
                    {fmt(p.subtotal)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(p.line.id)}
                    aria-label={`Remove ${p.line.roomType.name}`}
                    className="p-1 rounded-md text-[var(--bk-muted)] hover:text-[var(--bk-danger)] hover:bg-[var(--bk-surface-soft)] transition-colors cursor-pointer touch-manipulation"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-1.5 text-sm border-t border-[var(--bk-line)] pt-3">
            <div className="flex justify-between gap-4">
              <span className="text-[var(--bk-muted)]">Subtotal</span>
              <span className="booking-price text-[var(--bk-ink)] tabular-nums">
                {fmt(subtotal)}
              </span>
            </div>
            {taxEnabled && taxAmount > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-[var(--bk-muted)]">
                  Taxes & fees ({taxPercentage}%)
                </span>
                <span className="booking-price text-[var(--bk-ink)] tabular-nums">
                  {fmt(taxAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-baseline gap-4 pt-2 border-t border-[var(--bk-line)]">
              <span className="font-semibold text-[var(--bk-ink)]">Total</span>
              <span className="booking-heading booking-price text-xl text-[var(--bk-ink)] tabular-nums">
                {fmt(total)}
              </span>
            </div>
          </div>
        </>
      )}

      {onContinue && (
        <Button
          variant="primary"
          size="lg"
          isDisabled={!canContinue}
          onPress={onContinue}
          className="booking-cta w-full h-12 rounded-xl text-sm touch-manipulation"
        >
          Continue
        </Button>
      )}
    </div>
  );
}

function RoomCard({
  room,
  currency,
  displayPrice,
  priceLoading,
  availableCount,
  restrictionReason,
  line,
  lineTotal,
  atLimit,
  fmt,
  onAdd,
  onRemove,
  onAddRoom,
  onRemoveRoom,
  onRoomAdults,
  onRoomChildren,
  canAddRoom,
  maxRooms,
  onPhotos,
}: {
  room: RoomType;
  currency: string;
  displayPrice: number;
  priceLoading: boolean;
  availableCount: number | null;
  /** Rate plan reason this window cannot be sold, already guest-facing. */
  restrictionReason: string | null;
  line: CartLine | null;
  lineTotal: number | null;
  atLimit: boolean;
  fmt: (n: number) => string;
  onAdd: () => void;
  onRemove: () => void;
  onAddRoom: () => void;
  onRemoveRoom: (key: string) => void;
  onRoomAdults: (key: string, adults: number) => void;
  onRoomChildren: (key: string, children: number) => void;
  /** A further room may be added (within type, availability and cart caps). */
  canAddRoom: boolean;
  maxRooms: number;
  onPhotos: (e: React.MouseEvent) => void;
}) {
  const img = room.images[0]?.url ?? null;
  const soldOut = availableCount === 0;
  // Sold out and restricted are both unbookable; the copy tells them apart.
  const blocked = soldOut || restrictionReason !== null;
  const scarce =
    !blocked && availableCount !== null && availableCount > 0 && availableCount <= 2;
  const inCart = line !== null;

  return (
    <div
      data-in-cart={inCart ? "true" : "false"}
      data-sold-out={soldOut ? "true" : "false"}
      data-blocked={blocked ? "true" : "false"}
      className={`booking-room-option p-3 sm:p-4 ${
        blocked && !inCart ? "opacity-60" : ""
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
                {!soldOut && restrictionReason !== null && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bk-danger)]">
                    Unavailable
                  </span>
                )}
                {scarce && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bk-accent)]">
                    Only {availableCount} left
                  </span>
                )}
              </div>
              {restrictionReason !== null && (
                <p className="text-xs text-[var(--bk-danger)] mt-1 leading-relaxed">
                  {restrictionReason}
                </p>
              )}
              {room.bedConfiguration && (
                <p className="text-xs text-[var(--bk-muted)] mt-0.5 line-clamp-1">
                  {room.bedConfiguration}
                </p>
              )}
              {room.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {room.amenities.slice(0, 3).map((a) => (
                    <span key={a.label} className="booking-chip">
                      {a.label}
                    </span>
                  ))}
                  {room.amenities.length > 3 && (
                    <span className="text-[10px] text-[var(--bk-muted)] self-center">
                      +{room.amenities.length - 3}
                    </span>
                  )}
                </div>
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
        </div>
      </div>

      {line ? (
        <div className="mt-3 pt-3 border-t border-[var(--bk-line)] space-y-2.5">
          {/* One block per room: occupancy belongs to the room, not the type. */}
          {line.rooms.map((cartRoom, index) => (
            <div
              key={cartRoom.key}
              className="rounded-xl bg-[var(--bk-surface-soft)] px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2 pb-0.5">
                <p className="text-xs font-semibold text-[var(--bk-ink)]">
                  Room {index + 1}
                  <span className="ml-1.5 font-normal text-[var(--bk-muted)]">
                    {cartRoom.adults + cartRoom.children}{" "}
                    {cartRoom.adults + cartRoom.children === 1 ? "guest" : "guests"}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => onRemoveRoom(cartRoom.key)}
                  aria-label={`Remove room ${index + 1} of ${room.name}`}
                  className="p-1 rounded-md text-[var(--bk-muted)] hover:text-[var(--bk-danger)] transition-colors cursor-pointer touch-manipulation"
                >
                  <X className="size-3.5" />
                </button>
              </div>
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
                description="Age 0 to 12"
                value={cartRoom.children}
                min={0}
                max={childrenCapFor(room)}
                onChange={(c) => onRoomChildren(cartRoom.key, c)}
                size="sm"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={onAddRoom}
            disabled={!canAddRoom}
            className="w-full h-9 rounded-xl border border-dashed border-[var(--bk-line)] text-xs font-semibold text-[var(--bk-ink)] hover:bg-[var(--bk-surface-soft)] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer touch-manipulation"
          >
            {line.rooms.length >= maxRooms
              ? `Only ${maxRooms} available`
              : "Add another room"}
          </button>

          <div className="flex items-center justify-between gap-3 pt-2.5 mt-1 border-t border-[var(--bk-line)]">
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--bk-muted)] hover:text-[var(--bk-danger)] transition-colors cursor-pointer min-h-9 touch-manipulation"
            >
              <X className="size-3.5" />
              Remove
            </button>
            {lineTotal !== null && (
              <span className="booking-price text-sm font-semibold text-[var(--bk-ink)] tabular-nums">
                {fmt(lineTotal)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button
            variant="secondary"
            size="md"
            isDisabled={blocked || atLimit}
            onPress={onAdd}
            className="booking-cta w-full h-11 rounded-xl text-sm touch-manipulation"
          >
            {!blocked && !atLimit && <Plus className="size-4" />}
            {blocked
              ? "Unavailable"
              : atLimit
                ? `Limit ${MAX_ROOM_TYPES} room types`
                : "Add room"}
          </Button>
        </div>
      )}
    </div>
  );
}
