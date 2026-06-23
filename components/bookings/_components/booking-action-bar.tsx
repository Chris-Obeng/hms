"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  LogIn,
  LogOut,
  XCircle,
  RotateCcw,
  BedDouble,
  CheckCircle2,
  Receipt,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { checkInBooking, checkOutBooking } from "@/app/dashboard/actions";
import { updateBookingStatus } from "@/app/actions/bookings";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingActionBarProps {
  booking: FullBookingDetail;
  actionLoading: string | null;
  onAction: (action: string, actionFn: () => Promise<any>) => void;
  onOpenPaymentForm: () => void;
}

export function BookingActionBar({
  booking,
  actionLoading,
  onAction,
  onOpenPaymentForm,
}: BookingActionBarProps) {
  const handleCheckIn = () =>
    onAction("check_in", () => checkInBooking(booking.id));

  const handleCheckOut = () =>
    onAction("check_out", () => checkOutBooking(booking.id));

  const handleCancel = () =>
    onAction("cancel", () => updateBookingStatus(booking.id, "cancelled"));

  const handleReinstate = () =>
    onAction("reinstate", () => updateBookingStatus(booking.id, "confirmed"));

  return (
    <div className="flex items-center gap-1.5 px-5 py-3 border-b border-border/20 bg-muted/10 overflow-x-auto">
      {booking.status === "pending" && (
        <Button
          size="sm"
          className="rounded-lg text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() =>
            onAction("confirm", () =>
              updateBookingStatus(booking.id, "confirmed")
            )
          }
          disabled={actionLoading === "confirm"}
        >
          <CheckCircle2 className="size-3 mr-1 shrink-0" />
          {actionLoading === "confirm" ? "Confirming..." : "Confirm"}
        </Button>
      )}
      {booking.status === "confirmed" && (
        <Button
          size="sm"
          className="rounded-lg text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleCheckIn}
          disabled={actionLoading === "check_in"}
        >
          <LogIn className="size-3 mr-1 shrink-0" />
          {actionLoading === "check_in" ? "Checking in..." : "Check In"}
        </Button>
      )}
      {booking.status === "checked_in" && (
        <Button
          size="sm"
          className="rounded-lg text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={handleCheckOut}
          disabled={actionLoading === "check_out"}
        >
          <LogOut className="size-3 mr-1 shrink-0" />
          {actionLoading === "check_out" ? "Checking out..." : "Check Out"}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="rounded-lg text-xs h-8 border-border/60"
        onClick={onOpenPaymentForm}
      >
        <Receipt className="size-3 mr-1 shrink-0" />
        Record Payment
      </Button>
      {!booking.room && (
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg text-xs h-8 border-border/60"
          onClick={() => {
            toast.info("Room assignment via calendar", {
              description: "Use the calendar view to assign a room to this booking.",
            });
          }}
        >
          <BedDouble className="size-3 mr-1 shrink-0" />
          Assign Room
        </Button>
      )}
      {(booking.status === "confirmed" || booking.status === "checked_in") && (
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/5 shrink-0"
          onClick={handleCancel}
          disabled={actionLoading === "cancel"}
        >
          <XCircle className="size-3 mr-1 shrink-0" />
          {actionLoading === "cancel" ? "Cancelling..." : "Cancel"}
        </Button>
      )}
      {booking.status === "cancelled" && (
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg text-xs h-8 shrink-0"
          onClick={handleReinstate}
          disabled={actionLoading === "reinstate"}
        >
          <RotateCcw className="size-3 mr-1 shrink-0" />
          {actionLoading === "reinstate" ? "Reinstating..." : "Reinstate"}
        </Button>
      )}
    </div>
  );
}
