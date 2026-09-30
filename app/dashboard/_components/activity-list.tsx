"use client";

import * as React from "react";
import {
  MessageSquareText,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  RotateCw,
} from "lucide-react";
import { MorphIcon, type IconInput } from "morphicons/react";
import { AlertDialog, Button, Dropdown, Skeleton } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatDate, getNights, getInitials } from "@/lib/format";
import { getStatusLabel } from "@/lib/booking-status";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { CAPS, onIdle, isFresh } from "@/lib/cache/prefetch-helpers";

// ── Morphicon geometry (module scope — stable refs for plan caches) ──
const SEARCH_ICON: IconInput = [
  ["circle", { cx: "11", cy: "11", r: "8" }],
  ["path", { d: "m21 21-4.34-4.34" }],
];
const CLOSE_ICON: IconInput = [
  ["path", { d: "M18 6 6 18" }],
  ["path", { d: "m6 6 12 12" }],
];

export interface ActivityBooking {
  id: string;
  reference: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  roomNumber: string | null;
  roomType: string | null;
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
  loading?: boolean;
  onCheckIn?: (bookingId: string) => void;
  onCheckOut?: (bookingId: string) => void;
  onCancel?: (bookingId: string) => void;
  onNoShow?: (bookingId: string) => void;
  onViewDetails?: (booking: ActivityBooking) => void;
  onTakePayment?: (booking: ActivityBooking) => void;
  onRefresh?: () => void;
}

type PendingConfirm =
  | { kind: "cancel"; booking: ActivityBooking }
  | { kind: "noshow"; booking: ActivityBooking }
  | null;

export function ActivityList({
  bookings,
  loading = false,
  onCheckIn,
  onCheckOut,
  onCancel,
  onNoShow,
  onViewDetails,
  onTakePayment,
  onRefresh,
  onHoverPrefetch,
}: ActivityListProps & { onHoverPrefetch?: (id: string) => void }) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const handleHoverPrefetch = React.useCallback(
    (id: string) => {
      const fn = onHoverPrefetch ?? ((bid: string) => {
        if (isFresh(queryClient, bookingDetailCache.key(bid))) return;
        void queryClient.prefetchQuery(bookingDetailCache.options(bid));
      });
      fn(id);
    },
    [onHoverPrefetch, queryClient]
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm>(null);

  const filteredBookings = React.useMemo(() => {
    let list = bookings;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.guestName.toLowerCase().includes(q) ||
          b.reference.toLowerCase().includes(q) ||
          (b.roomNumber && b.roomNumber.toLowerCase().includes(q)) ||
          (b.roomType && b.roomType.toLowerCase().includes(q))
      );
    }
    return list;
  }, [bookings, searchQuery]);

  const visibleActivityIds = React.useMemo(() => filteredBookings.slice(0, CAPS.clientIdle).map((b) => b.id).join(","), [filteredBookings]);
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

  const requestCancel = (b: ActivityBooking) => setPendingConfirm({ kind: "cancel", booking: b });
  const requestNoShow = (b: ActivityBooking) => setPendingConfirm({ kind: "noshow", booking: b });

  const confirmPending = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === "cancel") onCancel?.(pendingConfirm.booking.id);
    else onNoShow?.(pendingConfirm.booking.id);
    setPendingConfirm(null);
  };

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  const rowProps = { onCheckIn, onCheckOut, onCancel: requestCancel, onNoShow: requestNoShow, onViewDetails, onTakePayment };

  return (
    <div className="space-y-0">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <h2 className="text-section text-foreground">Activity</h2>
        <div className="flex items-center gap-1.5">
          {searchOpen ? (
            <input
              type="text"
              placeholder="Filter guest, room, reference…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              onBlur={() => {
                if (!searchQuery) setSearchOpen(false);
              }}
              className="h-8 w-44 rounded-lg border border-border/60 bg-background px-3 text-xs outline-none transition-all focus:w-56 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-52"
            />
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search activity"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <MorphIcon icon={SEARCH_ICON} size={16} strokeWidth={2} />
            </button>
          )}
          {searchOpen && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchQuery("");
                setSearchOpen(false);
              }}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <MorphIcon icon={CLOSE_ICON} size={16} strokeWidth={2} />
            </button>
          )}

          {onRefresh && (
            <Button
              variant="ghost"
              isIconOnly
              onPress={onRefresh}
              aria-label="Refresh activity"
              className="size-8 min-w-8 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <RotateCw className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {filteredBookings.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No records found{searchQuery ? ` for “${searchQuery}”` : " for this view"}.
        </div>
      ) : isMobile ? (
        <div className="space-y-3 p-4">
          {filteredBookings.map((b) => (
            <div
              key={b.id}
              ref={attachActivityRef}
              data-booking-id={b.id}
              onMouseEnter={() => handleHoverPrefetch(b.id)}
              onFocusCapture={() => handleHoverPrefetch(b.id)}
            >
              <MobileBookingRow booking={b} {...rowProps} />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/40 bg-muted/[0.14] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3">Guest</th>
                <th className="px-4 py-3">Accommodation</th>
                <th className="px-4 py-3">Stay</th>
                <th className="whitespace-nowrap px-6 py-3">Status &amp; actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 text-sm">
              {filteredBookings.map((b) => (
                <DesktopBookingRow key={b.id} booking={b} {...rowProps} onHoverPrefetch={handleHoverPrefetch} attachRef={attachActivityRef} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Destructive confirmation — replaces brittle window.confirm */}
      <AlertDialog.Backdrop
        variant="opaque"
        isOpen={pendingConfirm !== null}
        onOpenChange={(isOpen) => !isOpen && setPendingConfirm(null)}
      >
        <AlertDialog.Container placement="auto" size="sm">
          <AlertDialog.Dialog className="rounded-2xl border border-border/70 bg-card p-6 shadow-2xl">
            <AlertDialog.Header>
              <AlertDialog.Icon status={pendingConfirm?.kind === "noshow" ? "warning" : "danger"} />
              <AlertDialog.Heading>
                {pendingConfirm?.kind === "noshow"
                  ? "Mark as no-show?"
                  : "Cancel this reservation?"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                {pendingConfirm?.booking.guestName}&rsquo;s stay{" "}
                <span className="font-mono text-[13px]">{pendingConfirm?.booking.reference}</span>{" "}
                will be marked as{" "}
                <strong className="font-semibold">
                  {pendingConfirm?.kind === "noshow" ? "no-show" : "cancelled"}
                </strong>
                .
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {pendingConfirm?.kind === "noshow"
                  ? "The room is released back to inventory. This is reported for the night audit."
                  : "The room is released and can be rebooked immediately."}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Keep
              </Button>
              <Button
                variant={pendingConfirm?.kind === "noshow" ? "primary" : "danger"}
                className={
                  pendingConfirm?.kind === "noshow"
                    ? "bg-amber-600 text-white hover:bg-amber-700"
                    : undefined
                }
                onPress={confirmPending}
              >
                {pendingConfirm?.kind === "noshow" ? "Mark no-show" : "Cancel reservation"}
              </Button>
            </AlertDialog.Footer>
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

function DesktopBookingRow({
  booking,
  onCheckIn,
  onCheckOut,
  onCancel,
  onNoShow,
  onViewDetails,
  onTakePayment,
  onHoverPrefetch,
  attachRef,
}: { booking: ActivityBooking; onHoverPrefetch?: (id: string) => void; attachRef?: (el: HTMLElement | null) => void } & RowHandlers) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const totalGuests = (booking.adults || 1) + (booking.children || 0);
  const room = roomLabel(booking.roomNumber, booking.roomType);

  return (
    <tr
      ref={attachRef as unknown as React.Ref<HTMLTableRowElement>}
      data-booking-id={booking.id}
      onClick={() => onViewDetails?.(booking)}
      onMouseEnter={() => onHoverPrefetch?.(booking.id)}
      onFocusCapture={() => onHoverPrefetch?.(booking.id)}
      className="group cursor-pointer transition-colors hover:bg-muted/25"
    >
      {/* Guest */}
      <td className="px-6 py-3.5 align-top">
        <div className="flex items-center gap-3">
          <GuestAvatar name={booking.guestName} />
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <span className="truncate">{booking.guestName}</span>
              {booking.hasNotes && (
                <MessageSquareText
                  className="size-3.5 shrink-0 text-amber-500"
                  aria-label="Booking has notes or special requests"
                />
              )}
            </span>
            <span className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
              {booking.reference}
            </span>
          </div>
        </div>
      </td>

      {/* Accommodation */}
      <td className="px-4 py-3.5 align-top">
        <span className="flex items-center gap-1 text-sm font-medium text-foreground">
          {room}
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground/60" />
        </span>
        {!booking.roomNumber && booking.roomType && (
          <span className="text-[11px] text-muted-foreground/60">Unassigned</span>
        )}
      </td>

      {/* Stay */}
      <td className="px-4 py-3.5 align-top">
        <div className="flex flex-col gap-1">
          <div className="font-mono text-xs font-medium tabular-nums text-foreground">
            {formatDate(booking.checkIn, "dd MMM")} – {formatDate(booking.checkOut, "dd MMM")}
          </div>
          <div className="flex items-center gap-3 font-mono text-xs tabular-nums text-muted-foreground">
            <span>{nights}n</span>
            <span>{totalGuests} {totalGuests === 1 ? "guest" : "guests"}</span>
          </div>
        </div>
      </td>

      {/* Status & actions */}
      <td className="whitespace-nowrap px-6 py-3.5 align-top">
        <div className="flex items-center justify-end gap-2.5 whitespace-nowrap">
          {booking.paymentStatus !== "paid" && booking.status !== "cancelled" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTakePayment?.(booking);
              }}
              className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
            >
              Take payment
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
            <StatusChip status={booking.status} />
          )}
        </div>
      </td>
    </tr>
  );
}

function MobileBookingRow({
  booking,
  onCheckIn,
  onCheckOut,
  onCancel,
  onNoShow,
  onViewDetails,
  onTakePayment,
}: { booking: ActivityBooking } & RowHandlers) {
  return (
    <div
      onClick={() => onViewDetails?.(booking)}
      className="cursor-pointer space-y-2.5 rounded-2xl border border-border/50 bg-card p-4 shadow-xs transition-colors active:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <GuestAvatar name={booking.guestName} />
          <div className="min-w-0">
            <span
              className={cn(
                "mb-0.5 block text-[10px] font-bold uppercase tracking-wide",
                statusTextTone(booking.status)
              )}
            >
              {getStatusLabel(booking.status ?? "")}
            </span>
            <span className="flex items-center gap-1.5 text-base font-semibold text-foreground">
              <span className="truncate">{booking.guestName}</span>
              {booking.hasNotes && (
                <MessageSquareText
                  className="size-3.5 shrink-0 text-amber-500"
                  aria-label="Booking has notes"
                />
              )}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{booking.reference}</span>
      </div>
      <div className="text-xs tabular-nums text-muted-foreground">
        {roomLabel(booking.roomNumber, booking.roomType)}
        {" · "}
        {formatDate(booking.checkIn, "dd MMM")} – {formatDate(booking.checkOut, "dd MMM")}
      </div>
      <div className="flex items-center gap-2 pt-1.5">
        {booking.paymentStatus !== "paid" && booking.status !== "cancelled" && (
          <Button
            size="sm"
            variant="tertiary"
            className="h-9 flex-1 rounded-xl border border-amber-500/40 text-xs font-semibold text-amber-700 hover:bg-muted/50"
            onPress={() => onTakePayment?.(booking)}
          >
            Pay
          </Button>
        )}
        {booking.status === "confirmed" && onCheckIn && (
          <>
            <Button
              size="sm"
              onPress={() => onCheckIn(booking.id)}
              className="h-9 flex-1 rounded-xl bg-primary text-xs font-semibold text-primary-foreground hover:bg-[var(--accent-hover)]"
            >
              Check-in
            </Button>
            <Dropdown>
              <Dropdown.Trigger
                aria-label="More actions"
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-border text-muted-foreground outline-none hover:bg-muted/50 transition-colors"
              >
                <MoreVertical className="size-4" />
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                  onAction={(key) => {
                    if (key === "cancel") onCancel?.(booking);
                    if (key === "noshow") onNoShow?.(booking);
                  }}
                >
                  <Dropdown.Item key="cancel">Cancel booking</Dropdown.Item>
                  <Dropdown.Item key="noshow">Mark no-show</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </>
        )}
        {booking.status === "checked_in" && onCheckOut && (
          <Button
            size="sm"
            onPress={() => onCheckOut(booking.id)}
            className="h-9 flex-1 rounded-xl bg-foreground text-xs font-semibold text-background hover:bg-foreground/90"
          >
            Check-out
          </Button>
        )}
        {!["confirmed", "checked_in"].includes(booking.status) && (
          <StatusChip status={booking.status} className="ml-auto" />
        )}
      </div>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────

/** "room 2"/"Room2"/"RM 2" → "Room 2", "204" → "Room 204"; never doubles "Room". */
function roomLabel(roomNumber?: string | null, roomType?: string | null): string {
  if (roomNumber) {
    const cleaned = roomNumber.replace(/^\s*(?:room|rm)\.?\s*/i, "").trim();
    return cleaned ? `Room ${cleaned}` : "Room";
  }
  return roomType || "Unassigned";
}

/** Neutral initials circle — matches the app-wide guest avatar pattern. */
function GuestAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
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
    primary: "border-primary bg-primary hover:bg-[var(--accent-hover)]",
    neutral: "border-foreground bg-foreground hover:bg-foreground/90",
  };
  return (
    <div
      className={cn(
        "inline-flex overflow-hidden rounded-lg border text-xs font-semibold text-white divide-x divide-white/20",
        tones[tone]
      )}
    >
      <button
        type="button"
        onClick={onMain}
        className="px-3 py-1.5 transition-colors active:brightness-95"
      >
        {mainLabel}
      </button>
      {items && items.length > 0 && (
        <Dropdown>
          <Dropdown.Trigger
            aria-label={`${mainLabel} options`}
            className="cursor-pointer px-1.5 py-1.5 outline-none active:brightness-95"
          >
            <ChevronDown className="size-3.5" />
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              onAction={(key) => {
                const item = items.find((i) => i.key === key);
                if (item) item.onSelect();
              }}
              className="w-40 text-xs"
            >
              {items.map((item) => (
                <Dropdown.Item key={item.key}>{item.label}</Dropdown.Item>
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
        "rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset",
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
    case "pending":
      return "bg-amber-500/10 text-amber-700 ring-amber-500/25";
    case "cancelled":
      return "bg-red-500/10 text-red-600 ring-red-500/25";
    case "confirmed":
    case "no_show":
    default:
      return "bg-muted text-muted-foreground ring-border";
  }
}

function statusTextTone(status: string): string {
  switch (status) {
    case "checked_in":
      return "text-emerald-600";
    case "pending":
      return "text-amber-600";
    case "cancelled":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}
