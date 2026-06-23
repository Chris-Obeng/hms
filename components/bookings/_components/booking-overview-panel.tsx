"use client";

import * as React from "react";
import {
  CalendarDays,
  Moon,
  Users,
  MapPin,
  LogIn,
  LogOut,
  XCircle,
  AlertCircle,
  Building2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DetailCard } from "./booking-detail-card";
import {
  formatDateFull,
  formatDateTime,
  getNights,
  getSourceLabel,
  type FullBookingDetail,
} from "./booking-detail-types";

interface BookingOverviewPanelProps {
  booking: FullBookingDetail;
  currency: string;
}

export function BookingOverviewPanel({ booking, currency: _currency }: BookingOverviewPanelProps) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);

  return (
    <div className="px-5 py-4 space-y-5">
      {/* Stay Details */}
      <div className="grid grid-cols-2 gap-3">
        <DetailCard
          icon={CalendarDays}
          label="Check-in"
          value={formatDateFull(booking.checkIn)}
        />
        <DetailCard
          icon={CalendarDays}
          label="Check-out"
          value={formatDateFull(booking.checkOut)}
        />
        <DetailCard
          icon={Moon}
          label="Nights"
          value={`${nights} ${nights === 1 ? "night" : "nights"}`}
        />
        <DetailCard
          icon={Users}
          label="Guests"
          value={`${booking.adults || 0} adult${booking.adults !== 1 ? "s" : ""}${booking.children ? `, ${booking.children} child${booking.children !== 1 ? "ren" : ""}` : ""}`}
        />
      </div>

      <Separator className="opacity-40" />

      {/* Timestamps */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Activity Log
        </p>
        <div className="space-y-1.5 text-sm">
          {booking.checkInAt && (
            <div className="flex items-center gap-2">
              <LogIn className="size-3 text-emerald-500 shrink-0" />
              <span className="text-foreground">
                Checked in at {formatDateTime(booking.checkInAt)}
              </span>
            </div>
          )}
          {booking.checkOutAt && (
            <div className="flex items-center gap-2">
              <LogOut className="size-3 text-amber-500 shrink-0" />
              <span className="text-foreground">
                Checked out at {formatDateTime(booking.checkOutAt)}
              </span>
            </div>
          )}
          {booking.cancelledAt && (
            <div className="flex items-center gap-2">
              <XCircle className="size-3 text-red-500 shrink-0" />
              <span className="text-foreground">
                Cancelled at {formatDateTime(booking.cancelledAt)}
                {booking.cancellationReason && (
                  <> — {booking.cancellationReason}</>
                )}
              </span>
            </div>
          )}
          {!booking.checkInAt &&
            !booking.checkOutAt &&
            !booking.cancelledAt && (
              <p className="text-xs text-muted-foreground/50 italic">
                No activity recorded yet.
              </p>
            )}
        </div>
      </div>

      <Separator className="opacity-40" />

      {/* Accommodation */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Accommodation
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 text-sm">
            <MapPin className="size-3.5 text-muted-foreground/50 shrink-0" />
            {booking.room?.roomNumber ? (
              <span className="font-semibold text-foreground">
                Room {booking.room.roomNumber}
                {booking.room.floor && <> · Floor {booking.room.floor}</>}
              </span>
            ) : (
              <span className="font-medium text-amber-600 flex items-center gap-1.5">
                <AlertCircle className="size-3" />
                Not yet assigned
              </span>
            )}
          </div>
          {booking.roomType?.name && (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Building2 className="size-3.5 text-muted-foreground/50 shrink-0" />
              <span>{booking.roomType.name}</span>
            </div>
          )}
        </div>
      </div>

      <Separator className="opacity-40" />

      {/* Source & Preference */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Booking Source
          </p>
          <Badge variant="outline" className="text-xs font-medium">
            {getSourceLabel(booking.source)}
          </Badge>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Payment Preference
          </p>
          <Badge variant="outline" className="text-xs font-medium capitalize">
            {booking.paymentPreference === "pay_now"
              ? "Pay Now"
              : "Pay at Check-in"}
          </Badge>
        </div>
      </div>
    </div>
  );
}
