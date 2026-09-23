"use client";

import * as React from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  LogIn,
  LogOut,
  MapPin,
  Moon,
  Users,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDateFull, formatDateTime, getNights } from "@/lib/format";
import { getSourceLabel } from "@/lib/booking-status";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingOverviewPanelProps {
  booking: FullBookingDetail;
}

export function BookingOverviewPanel({ booking }: BookingOverviewPanelProps) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const guestsLabel = `${booking.adults || 1} ${
    (booking.adults || 1) === 1 ? "adult" : "adults"
  }${booking.children ? `, ${booking.children} ${booking.children === 1 ? "child" : "children"}` : ""}`;

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5">
      {/* ── Stay window ─────────────────────────────────────────── */}
      <section
        aria-label="Stay"
        className="rounded-2xl border border-border/60 bg-card p-4"
      >
        <div className="flex items-center justify-between gap-2 pb-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarDays className="size-3.5" />
            Stay
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
            <Moon className="size-3" />
            {nights} {nights === 1 ? "night" : "nights"}
          </span>
        </div>

        <div className="flex items-stretch gap-3">
          <StayEndpoint
            label="Check-in"
            value={formatDateFull(booking.checkIn)}
            tone="emerald"
            icon={<LogIn className="size-3.5" />}
          />
          <StayConnector />
          <StayEndpoint
            label="Check-out"
            value={formatDateFull(booking.checkOut)}
            tone="indigo"
            icon={<LogOut className="size-3.5" />}
          />
        </div>

        {(booking.checkInAt || booking.checkOutAt || (booking.status === "cancelled" && booking.cancelledAt)) && (
          <div className="mt-3 space-y-1 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
            {booking.checkInAt && (
              <p className="flex items-center gap-1.5">
                <LogIn className="size-3 text-emerald-500" />
                Checked in {formatDateTime(booking.checkInAt)}
              </p>
            )}
            {booking.checkOutAt && (
              <p className="flex items-center gap-1.5">
                <LogOut className="size-3 text-indigo-400" />
                Checked out {formatDateTime(booking.checkOutAt)}
              </p>
            )}
            {booking.status === "cancelled" && booking.cancelledAt && (
              <p className="flex items-center gap-1.5">
                <XCircle className="size-3 text-red-500" />
                Cancelled {formatDateTime(booking.cancelledAt)}
                {booking.cancellationReason ? ` — ${booking.cancellationReason}` : ""}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Room & guests ───────────────────────────────────────── */}
      <section
        aria-label="Room and guests"
        className="grid grid-cols-2 gap-3"
      >
        <InfoTile icon={MapPin} label="Room" className="col-span-2 sm:col-span-1">
          {booking.room?.roomNumber ? (
            <span className="font-semibold">
              Room {booking.room.roomNumber}
              {booking.room.floor && (
                <span className="font-normal text-muted-foreground"> · Flr {booking.room.floor}</span>
              )}
            </span>
          ) : (
            <span className="font-medium text-amber-600 dark:text-amber-400">Not assigned yet</span>
          )}
          <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">
            {booking.roomType?.name ?? "—"}
          </span>
        </InfoTile>

        <InfoTile icon={Users} label="Guests" className="col-span-2 sm:col-span-1">
          <span className="font-semibold">{guestsLabel}</span>
          <span className="mt-0.5 block truncate text-[11px] font-normal capitalize text-muted-foreground">
            via {getSourceLabel(booking.source)} ·{" "}
            {booking.paymentPreference === "pay_now" ? "Pay now" : "Pay at check-in"}
          </span>
        </InfoTile>
      </section>

      {/* ── Meta ────────────────────────────────────────────────── */}
      {(booking.createdBy?.fullName || booking.createdAt) && (
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground/70">
          <Clock3 className="size-3" />
          Booked {formatDateTime(booking.createdAt)}
          {booking.createdBy?.fullName ? ` by ${booking.createdBy.fullName}` : ""}
        </p>
      )}
    </div>
  );
}

function StayEndpoint({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "emerald" | "indigo";
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p
        className={cn(
          "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
          tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-indigo-500 dark:text-indigo-300"
        )}
      >
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-[13px] font-semibold leading-snug text-foreground">
        {value}
      </p>
    </div>
  );
}

function StayConnector() {
  return (
    <div aria-hidden className="relative my-4 w-6 shrink-0 self-stretch">
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 border-l border-dashed border-border" />
      <ArrowRight className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background p-px text-muted-foreground" />
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border border-border/60 bg-card px-4 py-3",
        className
      )}
    >
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
        <Icon className="size-3" />
        {label}
      </p>
      <div className="text-sm leading-snug">{children}</div>
    </div>
  );
}
