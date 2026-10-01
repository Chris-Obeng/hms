"use client";

import * as React from "react";
import { ArrowRight, Moon, BedDouble } from "lucide-react";
import { Button } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDateFull, formatDateTime, formatRoomLabel, getNights } from "@/lib/format";
import { occupancyText } from "@/lib/bookings/cart";
import { canTransitionBooking, getSourceLabel, getStatusLabel } from "@/lib/booking-status";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingOverviewPanelProps {
  booking: FullBookingDetail;
  actionLoading?: string | null;
  /**
   * Group-wide only ("check in all"). Per-room lifecycle work belongs to the
   * header bar, which acts on the single opened row.
   */
  onBulkAction?: (
    ids: string[],
    targetStatus: string,
    kind: "check_in" | "check_out"
  ) => void;
}

// Per-room occupancy phrasing is shared with the booking engine and the
// confirmation email — `occupancyText` in lib/bookings/cart.ts is the source.

export function BookingOverviewPanel({ booking, actionLoading, onBulkAction }: BookingOverviewPanelProps) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const guestsLabel = occupancyText(booking.adults ?? 1, booking.children ?? 0);
  const group = booking.group;
  const currency = booking.currency ?? "GHS";

  const roomValue = booking.room?.roomNumber
    ? `${formatRoomLabel(booking.room.roomNumber)}${booking.room.floor ? ` · Floor ${booking.room.floor}` : ""}`
    : null;

  return (
    <div className="space-y-5 px-4 py-4 sm:px-5">
      {/* ── Stay ─────────────────────────────────────────────────── */}
      <section aria-label="Stay" className="rounded-2xl bg-muted/40 p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">Check-in</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
              {formatDateFull(booking.checkIn)}
            </p>
          </div>

          <div className="flex flex-col items-center gap-1 px-1 text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground/80 shadow-xs">
              <Moon className="size-3" />
              {nights} {nights === 1 ? "night" : "nights"}
            </span>
            <ArrowRight className="size-3.5" />
          </div>

          <div className="min-w-0 text-right">
            <p className="text-[11px] font-medium text-muted-foreground">Check-out</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
              {formatDateFull(booking.checkOut)}
            </p>
          </div>
        </div>

        {(booking.checkInAt ||
          booking.checkOutAt ||
          (booking.status === "cancelled" && booking.cancelledAt)) && (
          <div className="mt-3.5 space-y-1 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
            {booking.checkInAt && (
              <p>Checked in · {formatDateTime(booking.checkInAt)}</p>
            )}
            {booking.checkOutAt && (
              <p>Checked out · {formatDateTime(booking.checkOutAt)}</p>
            )}
            {booking.status === "cancelled" && booking.cancelledAt && (
              <p className="text-red-600">
                Cancelled · {formatDateTime(booking.cancelledAt)}
                {booking.cancellationReason ? ` — ${booking.cancellationReason}` : ""}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Rooms ────────────────────────────────────────────────── */}
      {group ? (
        <section aria-label="Rooms">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Rooms
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
              <BedDouble className="size-3" />
              {group.totalRooms} {group.totalRooms === 1 ? "room" : "rooms"}
            </span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40">
            <div className="divide-y divide-border/40 px-3">
              {group.lines.map((l) => (
                <GroupLineRow key={l.id} line={l} currency={currency} />
              ))}
            </div>
          </div>
          <GroupBulkBar group={group} actionLoading={actionLoading ?? null} onBulkAction={onBulkAction} />
          <dl className="mt-1 divide-y divide-border/50">
            <Fact label="Source" className="capitalize">
              {getSourceLabel(booking.source)}
            </Fact>
            <Fact label="Payment">
              {booking.paymentPreference === "pay_now" ? "Pay now" : "Pay at check-in"}
            </Fact>
          </dl>
        </section>
      ) : (
        <dl className="divide-y divide-border/50">
          <Fact label="Room">
            {roomValue ? (
              <span className="font-medium text-foreground">{roomValue}</span>
            ) : (
              <span className="font-medium text-amber-600">Not assigned</span>
            )}
          </Fact>
          <Fact label="Room type">{booking.roomType?.name ?? "—"}</Fact>
          {(booking.roomsCount ?? 0) > 1 && (
            <Fact label="Rooms">×{booking.roomsCount}</Fact>
          )}
          <Fact label="Guests">{guestsLabel}</Fact>
          <Fact label="Source" className="capitalize">
            {getSourceLabel(booking.source)}
          </Fact>
          <Fact label="Payment">
            {booking.paymentPreference === "pay_now" ? "Pay now" : "Pay at check-in"}
          </Fact>
        </dl>
      )}

      {(booking.createdBy?.fullName || booking.createdAt) && (
        <p className="text-[11px] text-muted-foreground/70">
          Booked {formatDateTime(booking.createdAt)}
          {booking.createdBy?.fullName ? ` by ${booking.createdBy.fullName}` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * One room of a grouped reservation. Read-only on purpose: per-room lifecycle
 * work lives in the header bar (the one opened row) and the group-wide
 * controls live in the bulk bar below this list, so the list stays a list.
 */
function GroupLineRow({
  line,
  currency,
}: {
  line: import("@/app/actions/bookings-detail").GroupLineItem;
  currency: string;
}) {
  const label = getStatusLabel(line.status ?? "");
  const dot: Record<string, string> = {
    confirmed: "bg-blue-500",
    checked_in: "bg-emerald-500",
    checked_out: "bg-muted-foreground/50",
    cancelled: "bg-red-500",
    no_show: "bg-rose-500",
    pending: "bg-amber-500",
  };
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">
          {line.roomTypeName ?? "Room"}
          {line.roomNumber ? (
            <span className="font-normal text-muted-foreground"> · {formatRoomLabel(line.roomNumber)}</span>
          ) : (
            <span className="font-normal text-amber-600"> · Unassigned</span>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          <span className={cn("size-1.5 shrink-0 rounded-full", dot[line.status ?? ""] ?? "bg-muted-foreground/50")} />
          {label} · {occupancyText(line.adults ?? 1, line.children ?? 0)}
        </p>
      </div>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
        {formatCurrency(line.totalAmount, currency)}
      </span>
    </div>
  );
}

function GroupBulkBar({
  group,
  actionLoading,
  onBulkAction,
}: {
  group: import("@/app/actions/bookings-detail").BookingGroupSummary;
  actionLoading: string | null;
  onBulkAction: BookingOverviewPanelProps["onBulkAction"];
}) {
  if (!onBulkAction) return null;
  const checkInIds = group.lines.filter((l) => canTransitionBooking(l.status ?? "", "checked_in")).map((l) => l.id);
  const checkOutIds = group.lines.filter((l) => canTransitionBooking(l.status ?? "", "checked_out")).map((l) => l.id);
  const bulkBusy = actionLoading?.startsWith("bulk:") ?? false;
  // The only group-wide control on this surface: the header bar acts on the one
  // opened row, so this bar must cover every room that still needs an action —
  // including when only one room does.
  if (checkInIds.length === 0 && checkOutIds.length === 0) return null;
  return (
    <div className="mt-2 flex gap-2">
      {checkInIds.length > 0 && (
        <Button
          variant="primary"
          size="sm"
          isPending={actionLoading === "bulk:check_in" || actionLoading?.startsWith("bulk:check_in") === true}
          isDisabled={bulkBusy}
          onPress={() => onBulkAction(checkInIds, "checked_in", "check_in")}
          className="h-8 rounded-xl px-3 text-xs font-semibold"
        >
          Check in all ({checkInIds.length})
        </Button>
      )}
      {checkOutIds.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          isPending={actionLoading === "bulk:check_out" || actionLoading?.startsWith("bulk:check_out") === true}
          isDisabled={bulkBusy}
          onPress={() => onBulkAction(checkOutIds, "checked_out", "check_out")}
          className="h-8 rounded-xl px-3 text-xs font-semibold"
        >
          Check out all ({checkOutIds.length})
        </Button>
      )}
    </div>
  );
}

function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right text-[13px] text-foreground", className)}>
        {children}
      </dd>
    </div>
  );
}
