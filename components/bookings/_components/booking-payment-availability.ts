import type { FullBookingDetail } from "./booking-detail-types";

/** Balance and payability for a booking (or its whole reservation group). Pure, no server imports. */
export function getBookingPaymentAvailability(booking: FullBookingDetail) {
  const group = booking.group;
  const totalDue = group ? group.total : booking.totalAmount;
  const amountPaid = group ? group.amountPaid : booking?.amountPaid || 0;
  const outstandingBalance = group
    ? Math.max(0, group.outstanding)
    : Math.max(0, booking.outstandingBalance ?? booking.totalAmount - amountPaid);
  const isFullyPaid = outstandingBalance <= 0 && totalDue > 0;
  const payableLines = group
    ? group.lines.filter(
        (l) => l.outstanding > 0 && !["cancelled", "checked_out"].includes(l.status ?? "")
      )
    : [];
  const canTakePayment = group
    ? payableLines.length > 0
    : !["cancelled", "checked_out"].includes(booking.status ?? "");

  return {
    group,
    totalDue,
    amountPaid,
    outstandingBalance,
    isFullyPaid,
    payableLines,
    canTakePayment,
  };
}
