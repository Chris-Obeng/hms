"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookingDateRangePicker } from "@/components/booking/booking-date-range-picker";
import { GuestPickerPopover } from "@/components/booking/guest-picker-popover";
import { Button } from "@heroui/react";
import { Search } from "lucide-react";

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().split("T")[0];
}

function parsePositiveInt(value: string | null, fallback: number, max = 20) {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

interface DateSearchBarProps {
  slug: string;
  /** Visual density — hero sits over imagery; compact fits sticky chrome */
  variant?: "hero" | "compact";
}

export function DateSearchBar({ slug, variant = "hero" }: DateSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialCheckIn = searchParams.get("check_in");
  const initialCheckOut = searchParams.get("check_out");
  const initialAdults = searchParams.get("adults");
  const initialChildren = searchParams.get("children");
  const initialRooms = searchParams.get("rooms");

  const [checkIn, setCheckIn] = React.useState(
    initialCheckIn && /^\d{4}-\d{2}-\d{2}$/.test(initialCheckIn)
      ? initialCheckIn
      : todayISO()
  );
  const [checkOut, setCheckOut] = React.useState(
    initialCheckOut &&
      /^\d{4}-\d{2}-\d{2}$/.test(initialCheckOut) &&
      initialCheckOut > (initialCheckIn ?? "")
      ? initialCheckOut
      : tomorrowISO()
  );
  const [adults, setAdults] = React.useState(
    Math.max(1, parsePositiveInt(initialAdults, 1, 10))
  );
  const [childrenCount, setChildrenCount] = React.useState(
    parsePositiveInt(initialChildren, 0, 10)
  );
  const [rooms, setRooms] = React.useState(
    Math.max(1, parsePositiveInt(initialRooms, 1, 5))
  );

  // Keep form in sync when URL changes (e.g. browser back / clear dates)
  const [prevParams, setPrevParams] = React.useState(searchParams);
  if (prevParams !== searchParams) {
    setPrevParams(searchParams);
    const ci = searchParams.get("check_in");
    const co = searchParams.get("check_out");
    if (ci && /^\d{4}-\d{2}-\d{2}$/.test(ci)) setCheckIn(ci);
    if (co && /^\d{4}-\d{2}-\d{2}$/.test(co) && (!ci || co > ci)) setCheckOut(co);
    const a = searchParams.get("adults");
    const c = searchParams.get("children");
    const r = searchParams.get("rooms");
    if (a) setAdults(Math.max(1, parsePositiveInt(a, 1, 10)));
    if (c) setChildrenCount(parsePositiveInt(c, 0, 10));
    if (r) setRooms(Math.max(1, parsePositiveInt(r, 1, 5)));
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkIn || !checkOut || checkOut <= checkIn) return;
    const params = new URLSearchParams({
      check_in: checkIn,
      check_out: checkOut,
      adults: String(adults),
      children: String(childrenCount),
      rooms: String(rooms),
    });
    router.push(`/${slug}/rooms?${params.toString()}`);
  };

  const shellClass =
    variant === "compact"
      ? "grid grid-cols-1 min-[480px]:grid-cols-[1.2fr_1fr_auto] gap-1 items-stretch min-[480px]:items-center bg-white rounded-xl p-1 border border-[var(--bk-line)] shadow-[var(--bk-shadow)] w-full min-w-0"
      : "grid grid-cols-1 min-[480px]:grid-cols-[1.25fr_1fr_auto] gap-1.5 sm:gap-2 items-stretch min-[480px]:items-center bg-white/95 backdrop-blur-xl rounded-2xl p-1.5 sm:p-2 shadow-[var(--bk-shadow-lg)] border border-white/40 w-full max-w-4xl mx-auto min-w-0";

  return (
    <form onSubmit={handleSearch} className={shellClass} role="search">
      <div className="w-full min-w-0">
        <BookingDateRangePicker
          checkIn={checkIn}
          checkOut={checkOut}
          onDatesChange={(start, end) => {
            setCheckIn(start);
            setCheckOut(end);
          }}
          variant={variant === "compact" ? "compact" : "hero"}
        />
      </div>

      <div className="w-full min-w-0">
        <GuestPickerPopover
          adults={adults}
          childrenCount={childrenCount}
          rooms={rooms}
          onAdultsChange={setAdults}
          onChildrenChange={setChildrenCount}
          onRoomsChange={setRooms}
          className={
            variant === "compact"
              ? "h-10 rounded-lg shadow-none"
              : undefined
          }
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className={`booking-cta rounded-xl text-sm shrink-0 flex items-center justify-center gap-2 whitespace-nowrap w-full min-[480px]:w-auto ${
          variant === "compact"
            ? "h-10 px-3.5"
            : "h-11 min-[480px]:h-12 sm:h-[52px] px-4 sm:px-5"
        }`}
      >
        <Search className="size-4 shrink-0" strokeWidth={2} />
        <span className="min-[480px]:hidden">
          {variant === "compact" ? "Search" : "Check availability"}
        </span>
        <span className="hidden min-[480px]:inline">Search</span>
      </Button>
    </form>
  );
}
