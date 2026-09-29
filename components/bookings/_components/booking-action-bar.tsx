"use client";

import * as React from "react";
import { LogIn, LogOut, XCircle, RotateCcw, BadgeCheck } from "lucide-react";

import { AlertDialog, Button } from "@heroui/react";
import { cn } from "@/lib/utils";
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

  const handleConfirm = () =>
    onAction("confirm", "confirmed", () =>
      updateBookingStatus(booking.id, "confirmed")
    );

  const handleCancel = () =>
    onAction("cancel", "cancelled", () =>
      updateBookingStatus(booking.id, "cancelled")
    );

  const handleReinstate = () =>
    onAction("reinstate", "confirmed", () =>
      updateBookingStatus(booking.id, "confirmed")
    );

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/[0.15] px-4 py-3 sm:px-5">
        {booking.status === "pending" && (
          <ActionButton
            label={actionLoading === "confirm" ? "Confirming…" : "Confirm booking"}
            loadingLabel="Confirming…"
            isLoading={actionLoading === "confirm"}
            onPress={handleConfirm}
            icon={<BadgeCheck className="size-4" />}
          />
        )}
        {booking.status === "confirmed" && (
          <ActionButton
            label="Check in guest"
            loadingLabel="Checking in…"
            isLoading={actionLoading === "check_in"}
            onPress={handleCheckIn}
            icon={<LogIn className="size-4" />}
          />
        )}
        {booking.status === "checked_in" && (
          <ActionButton
            label="Check out guest"
            loadingLabel="Checking out…"
            isLoading={actionLoading === "check_out"}
            onPress={handleCheckOut}
            icon={<LogOut className="size-4" />}
          />
        )}
        {(booking.status === "cancelled" || booking.status === "no_show") && (
          <ActionButton
            label="Reinstate reservation"
            loadingLabel="Reinstating…"
            isLoading={actionLoading === "reinstate"}
            onPress={handleReinstate}
            icon={<RotateCcw className="size-4" />}
            variant="outline"
          />
        )}

        {(booking.status === "confirmed" || booking.status === "pending") && (
          <Button
            variant="ghost"
            className="ml-auto h-9 rounded-xl px-3 text-xs font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            isPending={actionLoading === "cancel"}
            onPress={() => setConfirmCancel(true)}
          >
            <XCircle className="size-3.5 shrink-0" />
            Cancel
          </Button>
        )}
      </div>

      <AlertDialog.Backdrop
        isOpen={confirmCancel}
        onOpenChange={(isOpen) => setConfirmCancel(isOpen)}
        variant="opaque"
      >
        <AlertDialog.Container placement="auto" size="sm">
          <AlertDialog.Dialog className="rounded-2xl border border-border/70 bg-card p-6 shadow-2xl">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Cancel this reservation?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                {booking.guest?.fullName ?? "This guest"}&rsquo;s stay{" "}
                <span className="font-mono text-[13px]">{booking.reference}</span> will be
                cancelled and the room released for other bookings.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                You can reinstate it later while the dates remain free.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" isDisabled={actionLoading === "cancel"}>
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
    </>
  );
}

function ActionButton({
  label,
  loadingLabel,
  isLoading,
  onPress,
  icon,
  variant = "primary",
}: {
  label: string;
  loadingLabel: string;
  isLoading: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  variant?: "primary" | "outline";
}) {
  return (
    <Button
      variant={variant}
      onPress={onPress}
      isPending={isLoading}
      className={cn(
        "h-10 rounded-xl px-4 text-[13px] font-semibold transition-colors active:scale-[0.98]",
        variant === "outline" &&
          "border-border/70 bg-background text-foreground hover:bg-muted/60"
      )}
    >
      {isLoading ? loadingLabel : (
        <>
          {icon}
          {label}
        </>
      )}
    </Button>
  );
}
