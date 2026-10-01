"use client";

import * as React from "react";
import { XCircle, RotateCcw, BadgeCheck } from "lucide-react";

import { AlertDialog, Button } from "@heroui/react";
import { cn } from "@/lib/utils";
import { formatRoomLabel } from "@/lib/format";
import { canTransitionBooking } from "@/lib/booking-status";
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

/**
 * The header action bar. Every button here acts on the ONE row the surface was
 * opened on — never on a reservation group. Group-wide work ("check in all")
 * lives with the group itself, in the bulk bar under the rooms list in the
 * overview tab, so a single click here can never move a sibling room.
 */
export function BookingActionBar({
  booking,
  actionLoading,
  onAction,
}: BookingActionBarProps) {
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  // A grouped reservation names the room this bar will act on, so "check in"
  // cannot be mistaken for the whole reservation; a single-room booking keeps
  // the guest-facing wording.
  const isGroupMember = !!booking.group;
  const roomTarget =
    formatRoomLabel(booking.room?.roomNumber) ?? booking.roomType?.name ?? null;
  const checkInLabel = isGroupMember && roomTarget ? `Check in ${roomTarget}` : "Check in guest";
  const checkOutLabel =
    isGroupMember && roomTarget ? `Check out ${roomTarget}` : "Check out guest";

  // Row-level transitions stay available for the room the panel is open on
  // (cancel/reinstate are per-room operations in this product).
  const canReinstateRow = booking.status === "cancelled" || booking.status === "no_show";
  const canCancelRow = canTransitionBooking(booking.status ?? "", "cancelled");

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
            label={checkInLabel}
            loadingLabel="Checking in…"
            isLoading={actionLoading === "check_in"}
            onPress={handleCheckIn}
          />
        )}
        {booking.status === "checked_in" && (
          <ActionButton
            label={checkOutLabel}
            loadingLabel="Checking out…"
            isLoading={actionLoading === "check_out"}
            onPress={handleCheckOut}
          />
        )}
        {canReinstateRow && (
          <ActionButton
            label="Reinstate reservation"
            loadingLabel="Reinstating…"
            isLoading={actionLoading === "reinstate"}
            onPress={handleReinstate}
            icon={<RotateCcw className="size-4" />}
            variant="outline"
          />
        )}

        {canCancelRow && (
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
              <AlertDialog.Heading>
                {isGroupMember ? `Cancel ${roomTarget ?? "this room"}?` : "Cancel this reservation?"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              {isGroupMember ? (
                <>
                  <p>
                    {roomTarget ?? booking.roomType?.name ?? "This room"} on{" "}
                    <span className="font-mono text-[13px]">{booking.reference}</span> will be
                    cancelled and released. <strong>Other rooms in the reservation are not affected.</strong>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You can reinstate it later while the dates remain free.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    {booking.guest?.fullName ?? "This guest"}&rsquo;s stay{" "}
                    <span className="font-mono text-[13px]">{booking.reference}</span> will be
                    cancelled and the room released for other bookings.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You can reinstate it later while the dates remain free.
                  </p>
                </>
              )}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" isDisabled={actionLoading === "cancel"}>
                {isGroupMember ? "Keep room" : "Keep reservation"}
              </Button>
              <Button
                variant="danger"
                isPending={actionLoading === "cancel"}
                onPress={() => {
                  setConfirmCancel(false);
                  handleCancel();
                }}
              >
                {isGroupMember ? "Cancel room" : "Cancel reservation"}
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
  isDisabled = false,
  onPress,
  icon,
  variant = "primary",
}: {
  label: string;
  loadingLabel: string;
  isLoading: boolean;
  isDisabled?: boolean;
  onPress: () => void;
  /** Optional leading glyph — labeled actions carry their meaning in the label. */
  icon?: React.ReactNode;
  variant?: "primary" | "outline";
}) {
  return (
    <Button
      variant={variant}
      onPress={onPress}
      isPending={isLoading}
      isDisabled={isDisabled}
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
