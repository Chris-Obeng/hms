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
  // Paid above the bill (after an early check-out took nights off it): the
  // hotel hands this back in person and records it as a refund.
  const lineCredit = (paid: number, total: number) => Math.max(0, Math.round((paid - total) * 100) / 100);
  const refundableLines = group
    ? group.lines.filter((l) => l.status !== "cancelled" && lineCredit(l.amountPaid, l.totalAmount) > 0)
    : [];
  const credit = group
    ? Math.round(refundableLines.reduce((s, l) => s + lineCredit(l.amountPaid, l.totalAmount), 0) * 100) / 100
    : lineCredit(amountPaid, booking.totalAmount);
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
    credit,
    refundableLines,
    lineCredit,
  };
}
