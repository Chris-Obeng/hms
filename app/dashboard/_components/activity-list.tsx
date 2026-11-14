"use client";

import * as React from "react";
import {
  AlertTriangle,
  BedDouble,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  ChevronDown,
  MessageSquareText,
  MoonStar,
} from "lucide-react";
import {
  AlertDialog,
  Button,
  ButtonGroup,
  Chip,
  Dropdown,
  Label,
  Skeleton,
} from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { formatDate, formatRoomLabel, getNights } from "@/lib/format";
import {
  getPaymentLabel,
  getStatusLabel,
  PAYMENT_DOT_COLORS,
  STATUS_COLORS,
  STATUS_DOT_FALLBACK,
} from "@/lib/booking-status";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { CAPS, isFresh, onIdle } from "@/lib/cache/prefetch-helpers";
import type { ActivityTab } from "./activity-tabs";
import { GuestAvatar } from "./guest-avatar";

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
  onNewBooking?: () => void;
  /** Filter text. The page owns the search field (one search box on screen). */
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

type PendingConfirm =
  | { kind: "cancel"; booking: ActivityBooking }
  | { kind: "noshow"; booking: ActivityBooking }
  | null;

const EMPTY_COPY: Record<ActivityTab, { title: string; hint: string }> = {
  arrivals: { title: "No arrivals", hint: "Guests checking in on this date appear here." },
  departures: { title: "No departures", hint: "Guests checking out on this date appear here." },
  in_house: { title: "No guests in house", hint: "Checked-in stays for this date appear here." },
  bookings: { title: "No new bookings", hint: "Reservations made on this date appear here." },
  cancellations: { title: "No cancellations", hint: "Reservations cancelled on this date appear here." },
  overbookings: { title: "No room conflicts", hint: "Every stay on this date has its own room." },
};

/**
 * Row grid shared by the header band and every row: two rows of two on
 * phones (guest | pay, then stay | action), four columns on tablets (room folds into the guest
 * line), five from lg up.
 */
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-2 [grid-template-areas:'guest_guest_pay'_'stay_action_action'] " +
  "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7rem_9rem] md:items-center md:gap-x-4 md:[grid-template-areas:'guest_stay_pay_action'] " +
  "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_9rem] lg:[grid-template-areas:'guest_room_stay_pay_action']";

/**
 * Front-desk queue for the selected view. Each row answers the four questions a
 * desk agent asks at a glance (who, which room, which nights, paid or not) and
 * offers the one next step; everything else lives in the booking drawer.
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
  onNewBooking,
  searchQuery,
  onSearchQueryChange,
  onHoverPrefetch,
}: ActivityListProps & { onHoverPrefetch?: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm>(null);

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
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-10 w-full rounded-xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 flex-1 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  const summary = buildSummary(bookings.length, pendingCount, activeTab);
  const empty = activeTab ? EMPTY_COPY[activeTab] : null;
  const rowHandlers: RowHandlers = {
    onCheckIn,
    onCheckOut,
    onCancel: requestCancel,
    onNoShow: requestNoShow,
    onViewDetails,
    onTakePayment,
  };

  return (
    <div>
      {/* The tab counts already say how many; this line is for screen readers. */}
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      {filteredBookings.length === 0 ? (
        <EmptyState
          query={searchQuery.trim()}
          title={empty?.title ?? "Nothing here"}
          hint={empty?.hint ?? "Reservations matching this view appear here."}
          tone={activeTab === "overbookings" && !searchQuery ? "success" : "neutral"}
          onClear={() => onSearchQueryChange("")}
          onNewBooking={
            onNewBooking && (activeTab === "arrivals" || activeTab === "bookings")
              ? onNewBooking
              : undefined
          }
        />
      ) : (
        <div>
          <div
            aria-hidden="true"
            className={cn(
              ROW_GRID,
              "hidden border-b border-border bg-secondary/40 px-6 py-2 text-xs font-medium text-muted-foreground md:grid"
            )}
          >
            <span className="pl-12 [grid-area:guest]">Guest</span>
            <span className="hidden [grid-area:room] lg:block">Room</span>
            <span className="[grid-area:stay]">Stay</span>
            <span className="[grid-area:pay]">Payment</span>
            <span className="[grid-area:action]" />
          </div>
          <ul role="list" className="divide-y divide-border">
            {filteredBookings.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                {...rowHandlers}
                onHoverPrefetch={handleHoverPrefetch}
                attachRef={attachActivityRef}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Cancel / no-show confirmation */}
      <AlertDialog.Backdrop
        isOpen={pendingConfirm !== null}
        onOpenChange={(isOpen) => !isOpen && setPendingConfirm(null)}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="rounded-3xl sm:max-w-[400px]">
            <ConfirmContent pendingConfirm={pendingConfirm} onConfirm={confirmPending} />
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
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

function BookingRow({
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
  const room = formatRoomLabel(booking.roomNumber);
  const isCancelled = booking.status === "cancelled" || booking.status === "no_show";
  const owesMoney = booking.paymentStatus !== "paid" && !isCancelled;
  const paymentLabel = booking.paymentStatus === "partial" ? "Collect balance" : "Take payment";
  const nightsLabel = `${nights} ${nights === 1 ? "night" : "nights"}`;
  const guestsLabel = `${totalGuests} ${totalGuests === 1 ? "guest" : "guests"}`;

  const paymentItem =
    owesMoney && onTakePayment
      ? [{ key: "payment", label: paymentLabel, onSelect: () => onTakePayment(booking) }]
      : [];

  return (
    <li
      ref={attachRef}
      data-booking-id={booking.id}
      onClick={() => onViewDetails?.(booking)}
      onMouseEnter={() => onHoverPrefetch?.(booking.id)}
      onFocusCapture={() => onHoverPrefetch?.(booking.id)}
      className={cn(ROW_GRID, "cursor-pointer px-4 py-4 transition-colors duration-150 ease-[ease] active:bg-secondary/80 sm:px-6 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary/50")}
    >
      {/* Guest */}
      <div className="flex min-w-0 items-start gap-3 [grid-area:guest] md:items-center">
        <GuestAvatar name={booking.guestName} />
        <div className="min-w-0 flex-1">
        {/* One line: a long name truncates, the notes icon and Conflict chip keep their size. */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails?.(booking);
            }}
            className="min-w-0 truncate rounded-sm text-left text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {booking.guestName}
          </button>
          {booking.hasNotes && (
            <MessageSquareText
              className="size-4 shrink-0 text-muted-foreground"
              aria-label="Has notes or special requests"
            />
          )}
          {booking.hasConflict && (
            <Chip size="sm" color="danger" variant="soft" className="shrink-0">
              <AlertTriangle className="size-3" aria-hidden="true" />
              <Chip.Label>Conflict</Chip.Label>
            </Chip>
          )}
        </div>
        {/* Phones and tablets fold the room into the guest line; desktop gives it a column. */}
        <p className="mt-1 truncate text-xs text-muted-foreground lg:hidden">
          {room ?? <span className="font-medium text-amber-700">Unassigned</span>}
          {booking.roomType && <> · {booking.roomType}</>}
          {booking.roomsCount > 1 && <> · ×{booking.roomsCount}</>}
        </p>
        </div>
      </div>

      {/* Room (desktop) */}
      <div className="hidden min-w-0 [grid-area:room] lg:block">
        <p className="truncate text-sm font-medium text-foreground">
          {room ?? <span className="text-amber-700">Unassigned</span>}
          {booking.roomsCount > 1 && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">×{booking.roomsCount}</span>
          )}
        </p>
        {booking.roomType && (
          <p className="mt-1 truncate text-xs text-muted-foreground">{booking.roomType}</p>
        )}
      </div>

      {/* Stay */}
      <div className="min-w-0 self-center [grid-area:stay]">
        <p className="truncate text-sm tabular-nums text-foreground md:hidden">
          {formatStayRange(booking.checkIn, booking.checkOut)}
          <span className="text-muted-foreground"> · {nightsLabel}</span>
        </p>
        <div className="hidden md:block">
          <p className="truncate text-sm tabular-nums text-foreground">
            {formatStayRange(booking.checkIn, booking.checkOut)}
          </p>
          <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground">
            {nightsLabel} · {guestsLabel}
          </p>
        </div>
      </div>

      {/* Payment */}
      <div className="flex items-start justify-end [grid-area:pay] md:items-center md:justify-start">
        {!isCancelled && <PaymentStatus status={booking.paymentStatus} />}
      </div>

      {/* Next step */}
      <div
        className="flex items-center justify-end [grid-area:action]"
        onClick={(e) => e.stopPropagation()}
      >
        {booking.status === "confirmed" && onCheckIn ? (
          <SplitAction
            label="Check in"
            menuLabel="Check-in options"
            variant="primary"
            onMain={() => onCheckIn(booking.id)}
            items={[
              ...paymentItem,
              { key: "cancel", label: "Cancel booking", onSelect: () => onCancel?.(booking), danger: true },
              { key: "noshow", label: "Mark no-show", onSelect: () => onNoShow?.(booking), danger: true },
            ]}
          />
        ) : booking.status === "checked_in" && onCheckOut ? (
          <SplitAction
            label="Check out"
            menuLabel="Check-out options"
            variant="secondary"
            onMain={() => onCheckOut(booking.id)}
            items={paymentItem}
          />
        ) : (
          <StatusLabel status={booking.status} />
        )}
      </div>
    </li>
  );
}

function SplitAction({
  label,
  menuLabel,
  variant,
  onMain,
  items,
}: {
  label: string;
  menuLabel: string;
  variant: "primary" | "secondary";
  onMain: () => void;
  items: Array<{ key: string; label: string; onSelect: () => void; danger?: boolean }>;
}) {
  if (items.length === 0) {
    return (
      <Button size="sm" variant={variant} onPress={onMain} className="rounded-full px-4 font-semibold max-md:h-10 pointer-coarse:h-10">
        {label}
      </Button>
    );
  }
  return (
    <ButtonGroup size="sm" variant={variant} className="overflow-hidden rounded-full">
      <Button onPress={onMain} className="px-4 font-semibold max-md:h-10 pointer-coarse:h-10">
        {label}
      </Button>
      <Dropdown>
        <Button isIconOnly size="sm" variant={variant} aria-label={menuLabel} className="max-md:size-10 pointer-coarse:size-10">
          <ButtonGroup.Separator />
          <ChevronDown className="size-4" />
        </Button>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu
            aria-label={menuLabel}
            onAction={(key) => items.find((i) => i.key === String(key))?.onSelect()}
            className="min-w-44"
          >
            {items.map((item) => (
              <Dropdown.Item
                id={item.key}
                key={item.key}
                textValue={item.label}
                variant={item.danger ? "danger" : "default"}
              >
                <Label>{item.label}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </ButtonGroup>
  );
}

/**
 * A status dot and its word: the dot gives the scan, the word keeps it readable
 * without colour. Colours come from lib/booking-status so a row matches the drawer.
 */
function DotLabel({ dot, label }: { dot: string | undefined; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs font-medium text-foreground">
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dot ?? STATUS_DOT_FALLBACK)} />
      {label}
    </span>
  );
}

/** Payment as a soft pill: green when settled, amber part paid, red still owed. */
const PAYMENT_PILL: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-600/15",
  partial: "bg-amber-50 text-amber-800 ring-amber-600/20",
  unpaid: "bg-rose-50 text-rose-700 ring-rose-600/15",
  refunded: "bg-secondary text-muted-foreground ring-border",
};

function PaymentStatus({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-semibold ring-1 ring-inset",
        PAYMENT_PILL[status] ?? PAYMENT_PILL.refunded
      )}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", PAYMENT_DOT_COLORS[status] ?? STATUS_DOT_FALLBACK)} />
      {getPaymentLabel(status)}
    </span>
  );
}

/** Booking state shown in the action column once there is no next step. */
function StatusLabel({ status }: { status: string }) {
  return <DotLabel dot={STATUS_COLORS[status]} label={getStatusLabel(status)} />;
}

function EmptyState({
  query,
  title,
  hint,
  tone,
  onClear,
  onNewBooking,
}: {
  query: string;
  title: string;
  hint: string;
  tone: "success" | "neutral";
  onClear: () => void;
  onNewBooking?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center border-t border-border/50 px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className={cn(
          "mb-4 grid size-12 place-items-center rounded-2xl",
          tone === "success" && !query
            ? "bg-emerald-500/10 text-emerald-600"
            : "bg-secondary text-muted-foreground"
        )}
      >
        {tone === "success" && !query ? (
          <CheckCircle2 className="size-5" />
        ) : (
          <BedDouble className="size-5" />
        )}
      </span>
      <p className="text-sm font-semibold text-foreground">
        {query ? `No matches for “${query}”` : title}
      </p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
        {query ? "Try a guest name, room number or booking reference." : hint}
      </p>
      {query ? (
        <Button size="sm" variant="secondary" onPress={onClear} className="mt-4 rounded-xl">
          Clear filter
        </Button>
      ) : (
        onNewBooking && (
          <Button size="sm" variant="primary" onPress={onNewBooking} className="mt-4 rounded-xl">
            <CalendarPlus className="size-4" aria-hidden="true" />
            New booking
          </Button>
        )
      )}
    </div>
  );
}

function ConfirmContent({
  pendingConfirm,
  onConfirm,
}: {
  pendingConfirm: PendingConfirm;
  onConfirm: () => void;
}) {
  if (!pendingConfirm) return null;
  const isNoShow = pendingConfirm.kind === "noshow";
  const { booking } = pendingConfirm;
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);

  return (
    <>
      <AlertDialog.Header className="items-center text-center">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-12 place-items-center rounded-2xl",
            isNoShow ? "bg-amber-500/12 text-amber-700" : "bg-destructive/10 text-destructive"
          )}
        >
          {isNoShow ? <MoonStar className="size-5" /> : <CalendarX className="size-5" />}
        </span>
        <AlertDialog.Heading className="text-lg font-semibold text-foreground">
          {isNoShow ? "Mark as No-Show" : "Cancel Reservation"}
        </AlertDialog.Heading>
      </AlertDialog.Header>
      <AlertDialog.Body className="text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{booking.guestName}</span> ·{" "}
          {formatStayRange(booking.checkIn, booking.checkOut)} · {nights}{" "}
          {nights === 1 ? "night" : "nights"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {isNoShow
            ? "The room returns to inventory and the stay counts as a no-show."
            : "The room is released and can be rebooked right away."}
        </p>
      </AlertDialog.Body>
      <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row">
        <Button slot="close" variant="tertiary" fullWidth className="rounded-xl">
          Keep Reservation
        </Button>
        <Button
          variant={isNoShow ? "secondary" : "danger"}
          fullWidth
          onPress={onConfirm}
          className={cn("rounded-xl font-semibold", isNoShow && "text-amber-800")}
        >
          {isNoShow ? "Mark No-Show" : "Cancel Reservation"}
        </Button>
      </AlertDialog.Footer>
    </>
  );
}

function formatStayRange(checkIn: string, checkOut: string): string {
  const sameMonth = checkIn.slice(0, 7) === checkOut.slice(0, 7);
  return sameMonth
    ? `${formatDate(checkIn, "d")}–${formatDate(checkOut, "d MMM")}`
    : `${formatDate(checkIn, "d MMM")} – ${formatDate(checkOut, "d MMM")}`;
}

function buildSummary(
  total: number,
  pendingCount: number | undefined,
  activeTab: ActivityTab | undefined
): string {
  if (total === 0) return "Nothing scheduled";
  const noun = total === 1 ? "reservation" : "reservations";
  if (activeTab === "arrivals" && typeof pendingCount === "number") {
    return pendingCount > 0 ? `${pendingCount} of ${total} still to check in` : `All ${total} checked in`;
  }
  if (activeTab === "departures" && typeof pendingCount === "number") {
    return pendingCount > 0 ? `${pendingCount} of ${total} still to check out` : `All ${total} checked out`;
  }
  return `${total} ${noun}`;
}
