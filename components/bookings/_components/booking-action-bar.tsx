"use client";

import * as React from "react";
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
  /** Render inline inside a page header instead of as a full-width card strip. */
  inline?: boolean;
}

/**
 * Row-scoped lifecycle actions. Acts strictly on the opened booking row — never
 * on sibling rooms in a multi-room reservation (those live on each room row).
 */
export function BookingActionBar({
  booking,
  actionLoading,
  onAction,
  inline = false,
}: BookingActionBarProps) {
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const isGroupMember = !!booking.group;
  const roomTarget =
    formatRoomLabel(booking.room?.roomNumber) ?? booking.roomType?.name ?? null;
  const checkInLabel = isGroupMember && roomTarget ? `Check in ${roomTarget}` : "Check in guest";
  const checkOutLabel =
    isGroupMember && roomTarget ? `Check out ${roomTarget}` : "Check out guest";

  const canReinstateRow = booking.status === "cancelled" || booking.status === "no_show";
  const canCancelRow = canTransitionBooking(booking.status ?? "", "cancelled");

  const hasPrimary =
    booking.status === "pending" ||
    booking.status === "confirmed" ||
    booking.status === "checked_in" ||
    canReinstateRow;

  if (!hasPrimary && !canCancelRow) return null;

  const handleCheckIn = () =>
    onAction("check_in", "checked_in", () => checkInBooking(booking.id));

  const handleCheckOut = () =>
    onAction("check_out", "checked_out", () => checkOutBooking(booking.id));

  const handleConfirm = () =>
    onAction("confirm", "confirmed", () => updateBookingStatus(booking.id, "confirmed"));

  const handleCancel = () =>
    onAction("cancel", "cancelled", () => updateBookingStatus(booking.id, "cancelled"));

  const handleReinstate = () =>
    onAction("reinstate", "confirmed", () => updateBookingStatus(booking.id, "confirmed"));

  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          !inline && "shrink-0 border-t border-border/50 bg-muted/20 px-4 py-3 sm:px-6"
        )}
      >
        {canCancelRow && (
          <Button
            variant="tertiary"
            className={cn("rounded-xl font-medium max-md:h-11", !inline && "order-2 ml-auto")}
            isPending={actionLoading === "cancel"}
            onPress={() => setConfirmCancel(true)}
          >
            Cancel
          </Button>
        )}

        {booking.status === "pending" && (
          <ActionButton
            label={actionLoading === "confirm" ? "Confirming…" : "Confirm booking"}
            loadingLabel="Confirming…"
            isLoading={actionLoading === "confirm"}
            onPress={handleConfirm}
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
            variant="secondary"
          />
        )}
        {canReinstateRow && (
          <ActionButton
            label="Reinstate reservation"
            loadingLabel="Reinstating…"
            isLoading={actionLoading === "reinstate"}
            onPress={handleReinstate}
            variant="secondary"
          />
        )}
      </div>

      <AlertDialog.Backdrop
        isOpen={confirmCancel}
        onOpenChange={(isOpen) => setConfirmCancel(isOpen)}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="rounded-3xl sm:max-w-[400px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading className="text-base font-semibold text-foreground">
                {isGroupMember ? `Cancel ${roomTarget ?? "this room"}?` : "Cancel this reservation?"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="text-sm leading-relaxed text-muted-foreground">
              {isGroupMember ? (
                <p>
                  {roomTarget ?? booking.roomType?.name ?? "This room"} on{" "}
                  <span className="font-mono text-xs text-foreground">{booking.reference}</span>{" "}
                  will be cancelled and released.{" "}
                  <strong className="font-semibold text-foreground">
                    Other rooms in the reservation are not affected.
                  </strong>
                </p>
              ) : (
                <p>
                  {booking.guest?.fullName ?? "This guest"}&rsquo;s stay{" "}
                  <span className="font-mono text-xs text-foreground">{booking.reference}</span>{" "}
                  will be cancelled and the room released immediately.
                </p>
              )}
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row">
              <Button
                slot="close"
                variant="tertiary"
                autoFocus
                isDisabled={actionLoading === "cancel"}
                className="rounded-xl max-md:h-11"
              >
                {isGroupMember ? "Keep room" : "Keep reservation"}
              </Button>
              <Button
                variant="danger"
                isPending={actionLoading === "cancel"}
                className="rounded-xl font-semibold max-md:h-11"
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
  variant = "primary",
}: {
  label: string;
  loadingLabel: string;
  isLoading: boolean;
  isDisabled?: boolean;
  onPress: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <Button
      variant={variant}
      onPress={onPress}
      isPending={isLoading}
      isDisabled={isDisabled}
      className="rounded-xl font-semibold max-md:h-11"
    >
      {isLoading ? loadingLabel : label}
    </Button>
  );
}
