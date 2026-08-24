"use client";

import * as React from "react";
import {
  LogIn,
  LogOut,
  XCircle,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";

import { AlertDialog, Button } from "@heroui/react";
import { checkInBooking, checkOutBooking } from "@/app/dashboard/actions";
import { updateBookingStatus } from "@/app/actions/bookings";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingActionBarProps {
  booking: FullBookingDetail;
  actionLoading: string | null;
  onAction: (
    action: string,
    optimisticStatus: string,
    actionFn: () => Promise<{ success: boolean; error?: string }>
  ) => void;
}

export function BookingActionBar({
  booking,
  actionLoading,
  onAction,
}: BookingActionBarProps) {
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const handleCheckIn = () =>
    onAction("check_in", "checked_in", () => checkInBooking(booking.id));

  const handleCheckOut = () =>
    onAction("check_out", "checked_out", () => checkOutBooking(booking.id));

  const handleCancel = () =>
    onAction("cancel", "cancelled", () => updateBookingStatus(booking.id, "cancelled"));

  const handleReinstate = () =>
    onAction("reinstate", "confirmed", () => updateBookingStatus(booking.id, "confirmed"));

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-background px-4 py-2.5 sm:px-5">
      {booking.status === "pending" && (
        <Button
          size="sm"
          className="h-9 rounded-xl px-3.5 text-xs font-semibold"
          onPress={() =>
            onAction("confirm", "confirmed", () =>
              updateBookingStatus(booking.id, "confirmed")
            )
          }
          isPending={actionLoading === "confirm"}
        >
          <CheckCircle2 className="size-3 mr-1 shrink-0" />
          {actionLoading === "confirm" ? "Confirming..." : "Confirm"}
        </Button>
      )}
      {booking.status === "confirmed" && (
        <Button
          size="sm"
          className="h-9 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700"
          onPress={handleCheckIn}
          isPending={actionLoading === "check_in"}
        >
          <LogIn className="size-3 mr-1 shrink-0" />
          {actionLoading === "check_in" ? "Checking in..." : "Check In"}
        </Button>
      )}
      {booking.status === "checked_in" && (
        <Button
          size="sm"
          className="h-9 rounded-xl bg-foreground px-3.5 text-xs font-semibold text-background hover:bg-foreground/90"
          onPress={handleCheckOut}
          isPending={actionLoading === "check_out"}
        >
          <LogOut className="size-3 mr-1 shrink-0" />
          {actionLoading === "check_out" ? "Checking out..." : "Check Out"}
        </Button>
      )}
      {(booking.status === "confirmed" || booking.status === "pending") && (
        <AlertDialog>
          <Button
            slot="open"
            size="sm"
            variant="ghost"
            className="ml-auto h-9 rounded-xl px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            isPending={actionLoading === "cancel"}
          >
            <XCircle className="size-3 mr-1 shrink-0" />
            Cancel Booking
          </Button>
          <AlertDialog.Backdrop
            isOpen={confirmCancel}
            onOpenChange={setConfirmCancel}
          >
            <AlertDialog.Container>
              <AlertDialog.Dialog className="sm:max-w-[420px]">
                <AlertDialog.Header>
                  <AlertDialog.Icon status="danger" />
                  <AlertDialog.Heading>Cancel this reservation?</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <p>
                    {booking.guest?.fullName}&rsquo;s stay ({booking.reference}) will be
                    cancelled and the room released. You can reinstate it later if needed.
                  </p>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button
                    slot="close"
                    variant="tertiary"
                    isDisabled={actionLoading === "cancel"}
                  >
                    Keep reservation
                  </Button>
                  <Button
                    variant="danger"
                    isPending={actionLoading === "cancel"}
                    onPress={() => {
                      setConfirmCancel(false);
                      handleCancel();
                    }}
                  >
                    Cancel reservation
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      )}
      {booking.status === "cancelled" && (
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-9 rounded-xl border-border/60 px-3 text-xs"
          onPress={handleReinstate}
          isPending={actionLoading === "reinstate"}
        >
          <RotateCcw className="size-3 mr-1 shrink-0" />
          {actionLoading === "reinstate" ? "Reinstating..." : "Reinstate"}
        </Button>
      )}
    </div>
  );
}
