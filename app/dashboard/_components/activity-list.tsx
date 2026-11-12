"use client";

import * as React from "react";
import {
  AlertTriangle,
  BedDouble,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  MessageSquareText,
  MoonStar,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { AlertDialog, Button, Dropdown, Label, Skeleton } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { formatDate, formatRoomLabel, getInitials, getNights } from "@/lib/format";
import { getPaymentLabel, getStatusLabel } from "@/lib/booking-status";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { CAPS, isFresh, onIdle } from "@/lib/cache/prefetch-helpers";
import type { ActivityTab } from "./activity-tabs";

export interface ActivityBooking {
  id: string;
  reference: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  roomNumber: string | null;
  roomType: string | null;
  /** Units this row holds. >1 on legacy multi-room rows; 1 for one-room rows. */
  roomsCount: number;
  checkIn: string;
  checkOut: string;
  nights: number | null;
  adults: number | null;
  children: number | null;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  source: string;
  createdAt?: string | null;
  cancelledAt?: string | null;
  hasConflict?: boolean;
  roomDirty?: boolean;
  hasNotes?: boolean;
}

interface ActivityListProps {
  bookings: ActivityBooking[];
  activeTab?: ActivityTab;
  pendingCount?: number;
  loading?: boolean;
  onCheckIn?: (bookingId: string) => void;
  onCheckOut?: (bookingId: string) => void;
  onCancel?: (bookingId: string) => void;
  onNoShow?: (bookingId: string) => void;
  onViewDetails?: (booking: ActivityBooking) => void;
  onTakePayment?: (booking: ActivityBooking) => void;
  onRefresh?: () => void;
  onNewBooking?: () => void;
}

type PendingConfirm =
  | { kind: "cancel"; booking: ActivityBooking }
  | { kind: "noshow"; booking: ActivityBooking }
  | null;

const TAB_COPY: Record<
  ActivityTab,
  { title: string; emptyTitle: string; emptyHint: string }
> = {
  arrivals: {
    title: "Arrivals",
    emptyTitle: "No arrivals scheduled",
    emptyHint: "Guests checking in on this date will appear here ready for room assignment.",
  },
  departures: {
    title: "Departures",
    emptyTitle: "No departures scheduled",
    emptyHint: "Guests checking out on this date will appear here for folio settlement.",
  },
  in_house: {
    title: "In-house guests",
    emptyTitle: "No checked-in guests",
    emptyHint: "Checked-in stays spanning this business date will appear here.",
  },
  bookings: {
    title: "New bookings",
    emptyTitle: "No bookings created on this date",
    emptyHint: "Direct online and front-desk reservations recorded on this day show up here.",
  },
  cancellations: {
    title: "Cancellations",
    emptyTitle: "No cancellations recorded",
    emptyHint: "Reservations cancelled on this business date will be listed here.",
  },
  overbookings: {
    title: "Room conflicts",
    emptyTitle: "Zero room conflicts",
    emptyHint: "Every assigned stay on this date has a dedicated, non-overlapping room.",
  },
};

function CancelConfirmContent({
  pendingConfirm,
  onConfirm,
}: {
  pendingConfirm: PendingConfirm;
  onConfirm: () => void;
}) {
  if (!pendingConfirm) return null;
  const isNoShow = pendingConfirm.kind === "noshow";
  const { booking } = pendingConfirm;
  const stayRange = `${formatDate(booking.checkIn, "MMM d")} – ${formatDate(
    booking.checkOut,
    "MMM d, yyyy"
  )}`;
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);

  return (
    <>
      <div
        className={cn(
          "mx-auto grid size-14 place-items-center rounded-[16px] border shadow-xs",
          isNoShow
            ? "border-amber-700/15 bg-amber-700/10 text-amber-700"
            : "border-destructive/15 bg-destructive/10 text-destructive"
        )}
      >
        {isNoShow ? (
          <MoonStar className="size-[24px]" aria-hidden />
        ) : (
          <CalendarX className="size-[24px]" aria-hidden />
        )}
      </div>

      <div className="mt-4 text-center">
        <AlertDialog.Heading className="text-balance text-[17px] font-semibold leading-tight tracking-tight text-foreground">
          {isNoShow ? "Mark as No-Show" : "Cancel Reservation"}
        </AlertDialog.Heading>
        <p className="mt-2 text-balance text-[13.5px] leading-relaxed text-muted-foreground">
          {isNoShow
            ? "The room returns to inventory and this stay counts toward tonight's no-shows."
            : "The room is released and can be rebooked immediately."}
        </p>
      </div>

      <dl className="mt-5 space-y-3 text-left">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="shrink-0 text-[12px] font-medium text-muted-foreground">Guest</dt>
          <dd className="truncate text-[13px] font-semibold text-foreground">{booking.guestName}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="shrink-0 text-[12px] font-medium text-muted-foreground">Reference</dt>
          <dd className="font-mono text-[12px] font-medium tracking-tight text-foreground">
            {booking.reference}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="shrink-0 text-[12px] font-medium text-muted-foreground">Stay</dt>
          <dd className="text-right text-[13px] font-medium tabular-nums text-foreground">
            {stayRange} · {nights} {nights === 1 ? "night" : "nights"}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-col gap-3">
        <Button
          variant={isNoShow ? undefined : "danger"}
          onPress={onConfirm}
          className={cn(
            "ui-press h-12 w-full rounded-full text-[15px] font-semibold text-white shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isNoShow && "bg-amber-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-amber-800"
          )}
        >
          {isNoShow ? "Mark No-Show" : "Cancel Reservation"}
        </Button>
        <Button
          slot="close"
          variant="tertiary"
          className="ui-press h-12 w-full rounded-full border border-border/70 bg-background text-[15px] font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60"
        >
          Keep Reservation
        </Button>
      </div>
    </>
  );
}

type RowHandlers = {
  onCheckIn?: (id: string) => void;
  onCheckOut?: (id: string) => void;
  onCancel?: (b: ActivityBooking) => void;
  onNoShow?: (b: ActivityBooking) => void;
  onViewDetails?: (b: ActivityBooking) => void;
  onTakePayment?: (b: ActivityBooking) => void;
};

/**
 * Single-DOM responsive activity queue:
 * - Phones (<640px): stacked touch card with 44px action buttons
 * - Tablets & compact laptops (640px–1279px): 2-zone horizontal row (zero horizontal scroll)
 * - Wide desktops (≥1280px): precision 4-column grid aligned with column headers
 */
export function ActivityList({
  bookings,
  activeTab,
  pendingCount,
  loading = false,
  onCheckIn,
  onCheckOut,
  onCancel,
  onNoShow,
  onViewDetails,
  onTakePayment,
  onRefresh,
  onNewBooking,
  onHoverPrefetch,
}: ActivityListProps & { onHoverPrefetch?: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm>(null);
  const mobileInputRef = React.useRef<HTMLInputElement>(null);

  const handleHoverPrefetch = React.useCallback(
    (id: string) => {
      const fn =
        onHoverPrefetch ??
        ((bid: string) => {
          if (isFresh(queryClient, bookingDetailCache.key(bid))) return;
          void queryClient.prefetchQuery(bookingDetailCache.options(bid));
        });
      fn(id);
    },
    [onHoverPrefetch, queryClient]
  );

  const filteredBookings = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter(
      (b) =>
        b.guestName.toLowerCase().includes(q) ||
        b.reference.toLowerCase().includes(q) ||
        (b.roomNumber && b.roomNumber.toLowerCase().includes(q)) ||
        (b.roomType && b.roomType.toLowerCase().includes(q))
    );
  }, [bookings, searchQuery]);

  const visibleActivityIds = React.useMemo(
    () =>
      filteredBookings
        .slice(0, CAPS.clientIdle)
        .map((b) => b.id)
        .join(","),
    [filteredBookings]
  );

  React.useEffect(() => {
    if (!visibleActivityIds) return;
    const ids = visibleActivityIds.split(",").filter(Boolean);
    return onIdle(() => {
      for (const id of ids) {
        if (isFresh(queryClient, bookingDetailCache.key(id))) continue;
        void queryClient.prefetchQuery(bookingDetailCache.options(id));
      }
    });
  }, [visibleActivityIds, queryClient]);

  const observedActivityRef = React.useRef<Set<string>>(new Set());
  const activityObsRef = React.useRef<IntersectionObserver | null>(null);
  const getActivityObs = React.useCallback(() => {
    if (activityObsRef.current) return activityObsRef.current;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return null;
    activityObsRef.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset.bookingId;
          if (!id || observedActivityRef.current.has(id)) continue;
          observedActivityRef.current.add(id);
          activityObsRef.current?.unobserve(e.target);
          if (isFresh(queryClient, bookingDetailCache.key(id))) continue;
          if (observedActivityRef.current.size > CAPS.serverWarm + CAPS.viewportAhead) continue;
          void queryClient.prefetchQuery(bookingDetailCache.options(id));
        }
      },
      { rootMargin: "400px" }
    );
    return activityObsRef.current;
  }, [queryClient]);

  const attachActivityRef = React.useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const id = el.dataset.bookingId;
      if (!id || observedActivityRef.current.has(id)) return;
      getActivityObs()?.observe(el);
    },
    [getActivityObs]
  );

  React.useEffect(() => () => activityObsRef.current?.disconnect(), []);

  const requestCancel = React.useCallback(
    (b: ActivityBooking) => setPendingConfirm({ kind: "cancel", booking: b }),
    []
  );
  const requestNoShow = React.useCallback(
    (b: ActivityBooking) => setPendingConfirm({ kind: "noshow", booking: b }),
    []
  );

  const confirmPending = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === "cancel") onCancel?.(pendingConfirm.booking.id);
    else onNoShow?.(pendingConfirm.booking.id);
    setPendingConfirm(null);
  };

  if (loading) {
    return (
      <div className="space-y-3 p-5 sm:p-6">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    );
  }

  const copy = activeTab ? TAB_COPY[activeTab] : null;
  const heading = copy ? copy.title : "Activity";
  const subtitle = buildSubtitle(bookings.length, pendingCount, activeTab);
  const rowProps: RowHandlers = {
    onCheckIn,
    onCheckOut,
    onCancel: requestCancel,
    onNoShow: requestNoShow,
    onViewDetails,
    onTakePayment,
  };

  return (
    <div>
      {/* Header & filter toolbar */}
      <div className="border-b border-border/50 px-4 py-3 sm:px-5 sm:py-4 xl:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-foreground">
                {heading}
              </h2>
              {subtitle && (
                <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                  · {subtitle}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground sm:hidden">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Persistent inline filter on sm+ (static width, no layout reflow) */}
            <div className="relative hidden sm:block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                placeholder="Filter guest, room, ref…"
                aria-label="Filter activity"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && searchQuery) {
                    e.preventDefault();
                    setSearchQuery("");
                  }
                }}
                className="h-9 w-48 rounded-xl border border-border/60 bg-background/70 pl-8 pr-7 text-[13px] text-foreground outline-none transition-[border-color,background-color] duration-150 placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus-visible:ring-2 focus-visible:ring-ring/30 lg:w-60"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear filter"
                  onClick={() => setSearchQuery("")}
                  className="ui-press absolute right-2 top-1/2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Phone filter toggle (44px target) */}
            <button
              type="button"
              aria-label={mobileSearchOpen ? "Close filter" : "Filter activity"}
              aria-expanded={mobileSearchOpen}
              onClick={() => {
                const next = !mobileSearchOpen;
                setMobileSearchOpen(next);
                if (next) {
                  requestAnimationFrame(() => mobileInputRef.current?.focus());
                } else {
                  setSearchQuery("");
                }
              }}
              className={cn(
                "ui-press grid size-11 cursor-pointer place-items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden",
                mobileSearchOpen || searchQuery
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground active:bg-muted/70"
              )}
            >
              <Search className="size-4" />
            </button>

            {onRefresh && (
              <Button
                variant="ghost"
                isIconOnly
                onPress={onRefresh}
                aria-label="Refresh activity"
                className="ui-press size-11 min-w-11 rounded-xl text-muted-foreground sm:size-9 sm:min-w-9 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
              >
                <RotateCw className="size-4 sm:size-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Mobile inline filter bar — 16px text-base prevents iOS Safari zoom */}
        {(mobileSearchOpen || searchQuery) && (
          <div className="relative mt-3 sm:hidden">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={mobileInputRef}
              type="search"
              enterKeyHint="search"
              placeholder="Filter guest, room, or reference…"
              aria-label="Filter activity"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  if (searchQuery) setSearchQuery("");
                  else setMobileSearchOpen(false);
                }
              }}
              className="h-11 w-full rounded-xl border border-border/70 bg-background pl-10 pr-10 text-base text-foreground outline-none transition-[border-color] duration-150 placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => {
                  setSearchQuery("");
                  mobileInputRef.current?.focus();
                }}
                className="ui-press absolute right-1 top-1/2 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Empty state */}
      {filteredBookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center sm:py-16">
          <span
            aria-hidden="true"
            className={cn(
              "mb-3 grid size-11 place-items-center rounded-2xl border",
              activeTab === "overbookings" && !searchQuery
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                : "border-border/60 bg-muted/40 text-muted-foreground"
            )}
          >
            {activeTab === "overbookings" && !searchQuery ? (
              <CheckCircle2 className="size-5" />
            ) : (
              <BedDouble className="size-5" />
            )}
          </span>
          <p className="text-[14px] font-semibold text-foreground">
            {searchQuery
              ? `No matches for “${searchQuery.trim()}”`
              : copy?.emptyTitle ?? "No records for this view"}
          </p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {searchQuery
              ? "Check the guest name, room number, or booking reference, or clear your filter."
              : copy?.emptyHint ?? "Reservations matching this view will appear here."}
          </p>
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="ui-press mt-4 inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60"
            >
              Clear filter
            </button>
          ) : (
            onNewBooking &&
            (activeTab === "arrivals" || activeTab === "bookings") && (
              <button
                type="button"
                onClick={onNewBooking}
                className="ui-press mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--accent-hover)]"
              >
                <CalendarPlus className="size-4" aria-hidden="true" />
                New booking
              </button>
            )
          )}
        </div>
      ) : (
        <div>
          {/* Wide desktop column header band (xl+) — sentence case per PenTable */}
          <div
            aria-hidden="true"
            className="hidden border-b border-border/50 bg-muted/20 px-6 py-3 text-xs font-medium text-muted-foreground xl:grid xl:grid-cols-[minmax(210px,1.35fr)_minmax(150px,1fr)_minmax(150px,0.95fr)_minmax(215px,auto)] xl:items-center xl:gap-4"
          >
            <span>Guest</span>
            <span>Accommodation</span>
            <span>Stay</span>
            <span className="text-right">Status &amp; actions</span>
          </div>

          <ul role="list" className="divide-y divide-border/45">
            {filteredBookings.map((b) => (
              <BookingActivityRow
                key={b.id}
                booking={b}
                {...rowProps}
                onHoverPrefetch={handleHoverPrefetch}
                attachRef={attachActivityRef}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Cancel / No-Show destructive confirmation */}
      <AlertDialog.Backdrop
        variant="blur"
        isOpen={pendingConfirm !== null}
        onOpenChange={(isOpen) => !isOpen && setPendingConfirm(null)}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="rounded-[28px] border border-border/60 bg-card px-6 py-7 shadow-2xl outline-none sm:max-w-[400px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none">
            <CancelConfirmContent
              pendingConfirm={pendingConfirm}
              onConfirm={confirmPending}
            />
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}

function BookingActivityRow({
  booking,
  onCheckIn,
  onCheckOut,
  onCancel,
  onNoShow,
  onViewDetails,
  onTakePayment,
  onHoverPrefetch,
  attachRef,
}: {
  booking: ActivityBooking;
  onHoverPrefetch?: (id: string) => void;
  attachRef?: (el: HTMLElement | null) => void;
} & RowHandlers) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const totalGuests = (booking.adults || 1) + (booking.children || 0);
  const assignedRoom = formatRoomLabel(booking.roomNumber);
  const isUnpaid = booking.paymentStatus !== "paid" && booking.status !== "cancelled";

  return (
    <li
      ref={attachRef}
      data-booking-id={booking.id}
      onClick={() => onViewDetails?.(booking)}
      onMouseEnter={() => onHoverPrefetch?.(booking.id)}
      onFocusCapture={() => onHoverPrefetch?.(booking.id)}
      className={cn(
        "group cursor-pointer px-4 py-4 transition-colors duration-150 active:bg-muted/35 sm:px-5 sm:py-4 xl:px-6",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/25",
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        "xl:grid xl:grid-cols-[minmax(210px,1.35fr)_minmax(150px,1fr)_minmax(150px,0.95fr)_minmax(215px,auto)] xl:items-center xl:gap-4"
      )}
    >
      {/* Zone 1 (sm–lg combined info wrapper; xl unwraps into grid columns via xl:contents) */}
      <div className="min-w-0 flex-1 space-y-3 sm:space-y-2 xl:contents">
        {/* Col 1: Guest + reference */}
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <GuestAvatar name={booking.guestName} hasConflict={booking.hasConflict} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDetails?.(booking);
                  }}
                  className="min-w-0 truncate text-left text-[15px] font-semibold text-foreground outline-none focus-visible:underline sm:text-sm"
                >
                  {booking.guestName}
                </button>
                {booking.hasNotes && (
                  <MessageSquareText
                    className="size-4 shrink-0 text-amber-500"
                    aria-label="Booking has notes or special requests"
                  />
                )}
                {booking.hasConflict && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/12 px-2 py-1 text-[11px] font-semibold text-destructive">
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    Conflict
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                <span className="font-mono">{booking.reference}</span>
                {booking.paymentStatus === "paid" && booking.status !== "cancelled" && (
                  <span className="font-medium text-emerald-600">· Paid</span>
                )}
                {booking.paymentStatus === "partial" && booking.status !== "cancelled" && (
                  <span className="font-medium text-amber-700">· Partial</span>
                )}
              </div>
            </div>
          </div>

          {/* Mobile-only top-right status pill so phone cards show status before actions */}
          <StatusChip status={booking.status} className="shrink-0 sm:hidden" />
        </div>

        {/* Metadata strip on mobile/tablet; splits into Col 2 (Accommodation) & Col 3 (Stay) on xl */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-0 text-xs text-muted-foreground sm:pl-12 xl:contents">
          {/* Col 2: Accommodation */}
          <div className="flex min-w-0 items-center gap-2 xl:pl-0">
            {assignedRoom ? (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <span className="truncate">{assignedRoom}</span>
                {booking.roomType && (
                  <span className="hidden truncate text-xs font-normal text-muted-foreground xl:inline">
                    · {booking.roomType}
                  </span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="rounded-md bg-amber-500/12 px-2 py-1 text-[11px] font-semibold text-amber-800">
                  Unassigned
                </span>
                {booking.roomType && (
                  <span className="truncate font-medium text-foreground">{booking.roomType}</span>
                )}
              </span>
            )}

            {booking.roomsCount > 1 && (
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
                ×{booking.roomsCount}
              </span>
            )}

            <ChevronRight
              aria-hidden="true"
              className="hidden size-4 shrink-0 text-muted-foreground/35 transition-transform duration-150 xl:inline [@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-x-0.5 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-muted-foreground/70"
            />
          </div>

          <span aria-hidden="true" className="text-border xl:hidden">
            ·
          </span>

          {/* Col 3: Stay dates & guest count */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums xl:flex-col xl:items-start xl:gap-1">
            <span className="font-medium text-foreground">
              {formatDate(booking.checkIn, "dd MMM")} – {formatDate(booking.checkOut, "dd MMM")}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {nights}n · {totalGuests} {totalGuests === 1 ? "guest" : "guests"}
            </span>
          </div>
        </div>
      </div>

      {/* Col 4: Status & primary actions (44px height on mobile, crisp 36px on sm+) */}
      <div className="flex items-center justify-end gap-2 pt-1 sm:shrink-0 sm:pt-0">
        {isUnpaid && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTakePayment?.(booking);
            }}
            className="ui-press inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-4 text-xs font-semibold whitespace-nowrap text-amber-800 outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 sm:min-h-9 sm:flex-initial sm:rounded-lg sm:px-3 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-amber-500/12"
          >
            {booking.paymentStatus === "partial" ? "Collect balance" : "Take payment"}
          </button>
        )}

        {booking.status === "confirmed" && onCheckIn ? (
          <SplitAction
            tone="primary"
            mainLabel="Check-in"
            onMain={(e) => {
              e.stopPropagation();
              onCheckIn(booking.id);
            }}
            items={[
              { key: "cancel", label: "Cancel booking", onSelect: () => onCancel?.(booking) },
              { key: "noshow", label: "Mark no-show", onSelect: () => onNoShow?.(booking) },
            ]}
          />
        ) : booking.status === "checked_in" && onCheckOut ? (
          <SplitAction
            tone="neutral"
            mainLabel="Check-out"
            onMain={(e) => {
              e.stopPropagation();
              onCheckOut(booking.id);
            }}
          />
        ) : (
          <StatusChip status={booking.status} className="hidden sm:inline-flex" />
        )}
      </div>
    </li>
  );
}

function buildSubtitle(
  total: number,
  pendingCount: number | undefined,
  activeTab: ActivityTab | undefined
): string {
  if (total === 0) return "0 reservations";
  const noun = total === 1 ? "reservation" : "reservations";
  if (activeTab === "arrivals" && typeof pendingCount === "number") {
    return pendingCount > 0
      ? `${total} scheduled · ${pendingCount} awaiting check-in`
      : `${total} scheduled · all checked in`;
  }
  if (activeTab === "departures" && typeof pendingCount === "number") {
    return pendingCount > 0
      ? `${total} scheduled · ${pendingCount} due out`
      : `${total} scheduled · all checked out`;
  }
  return `${total} ${noun}`;
}

function GuestAvatar({ name, hasConflict }: { name: string; hasConflict?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
        hasConflict
          ? "bg-destructive/12 text-destructive ring-1 ring-inset ring-destructive/25"
          : "bg-secondary text-secondary-foreground"
      )}
    >
      {getInitials(name)}
    </span>
  );
}

function SplitAction({
  mainLabel,
  tone,
  onMain,
  items,
}: {
  mainLabel: string;
  tone: "primary" | "neutral";
  onMain: (e: React.MouseEvent) => void;
  items?: Array<{ key: string; label: string; onSelect: () => void }>;
}) {
  const tones = {
    primary:
      "border-primary bg-primary text-primary-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--accent-hover)]",
    neutral:
      "border-foreground bg-foreground text-background [@media(hover:hover)_and_(pointer:fine)]:hover:bg-foreground/90",
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex min-h-11 flex-1 overflow-hidden rounded-xl border text-xs font-semibold shadow-2xs divide-x divide-white/20 sm:min-h-9 sm:flex-initial sm:rounded-lg",
        tones[tone]
      )}
    >
      <button
        type="button"
        onClick={onMain}
        className="ui-press flex-1 cursor-pointer px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80 sm:flex-initial sm:px-3 sm:py-2"
      >
        {mainLabel}
      </button>
      {items && items.length > 0 && (
        <Dropdown>
          <Dropdown.Trigger
            aria-label={`${mainLabel} options`}
            className="ui-press grid w-11 shrink-0 cursor-pointer place-items-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80 sm:w-8"
          >
            <ChevronDown className="size-4 sm:size-4" />
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              onAction={(key) => {
                const item = items.find((i) => i.key === String(key));
                if (item) item.onSelect();
              }}
              className="w-44 text-xs"
            >
              {items.map((item) => (
                <Dropdown.Item id={item.key} key={item.key} textValue={item.label}>
                  <Label>{item.label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      )}
    </div>
  );
}

export function StatusChip({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset",
        chipTone(status),
        className
      )}
    >
      {getStatusLabel(status ?? "")}
    </span>
  );
}

function chipTone(status: string): string {
  switch (status) {
    case "checked_in":
      return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25";
    case "confirmed":
      return "bg-blue-500/10 text-blue-700 ring-blue-500/20";
    case "pending":
      return "bg-amber-500/10 text-amber-700 ring-amber-500/25";
    case "cancelled":
    case "no_show":
      return "bg-red-500/10 text-red-600 ring-red-500/25";
    default:
      return "bg-muted text-muted-foreground ring-border";
  }
}

export { getPaymentLabel };
