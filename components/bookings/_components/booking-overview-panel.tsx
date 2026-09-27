"use client";

import * as React from "react";
import { ArrowRight, Moon, BedDouble } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDateFull, formatDateTime, getNights } from "@/lib/format";
import { getSourceLabel } from "@/lib/booking-status";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingOverviewPanelProps {
  booking: FullBookingDetail;
}

/** "2 adults" / "2 adults, 1 child". */
function occupancyLabel(adults: number | null, children: number | null) {
  const a = adults || 1;
  const c = children || 0;
  const base = `${a} ${a === 1 ? "adult" : "adults"}`;
  return c > 0 ? `${base}, ${c} ${c === 1 ? "child" : "children"}` : base;
}

export function BookingOverviewPanel({ booking }: BookingOverviewPanelProps) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const guestsLabel = occupancyLabel(booking.adults, booking.children);
  const group = booking.group;
  const currency = booking.currency ?? "GHS";

  const roomValue = booking.room?.roomNumber
    ? `Room ${booking.room.roomNumber}${booking.room.floor ? ` · Floor ${booking.room.floor}` : ""}`
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
              {group.lines.map((l) => {
                const qty = Math.max(1, l.roomsCount ?? 1);
                return (
                  <div key={l.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {qty > 1 ? `${qty} × ` : ""}
                        {l.roomTypeName ?? "Room"}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {occupancyLabel(l.adults, l.children)}
                        {l.roomNumber ? ` · Room ${l.roomNumber}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
                      {formatCurrency(l.totalAmount, currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
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
