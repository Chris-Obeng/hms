/**
 * lib/bookings/reservation-rows.ts
 *
 * Collapses raw `bookings` rows into the rows the Reservations list renders.
 *
 * A multi-room reservation is N sibling `bookings` rows sharing one
 * `group_id` (see 20260925120000_bookings_reservation_group.sql). The list
 * shows one row per reservation, so every field on that row must speak for the
 * whole group — never for whichever sibling happens to be the anchor.
 */

import { deriveReservationStatus } from "@/lib/booking-status";

export interface BookingRow {
  id: string;
  reference: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  roomType: string | null;
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  nights: number | null;
  status: string;
  paymentStatus: string;
  source: string;
  totalAmount: number;
  amountPaid: number;
  outstandingBalance: number | null;
  // Total rooms across the reservation (summed over sibling rows).
  roomsCount: number;
  createdAt: string | null;
}

/** The subset of a raw `bookings` row the list needs, with its relations. */
export interface ReservationRowSource {
  id: string;
  reference: string;
  check_in: string;
  check_out: string;
  nights: number | null;
  status: string | null;
  payment_status: string | null;
  source: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  outstanding_balance: number | null;
  rooms_count: number | null;
  group_id: string | null;
  created_at: string | null;
  guests: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  rooms: { room_number?: string | null } | null;
  room_types: { name?: string | null } | null;
}

/**
 * One row per reservation (single-room rows stay their own reservation).
 *
 * Money is summed across siblings; a cancelled room is void revenue and is
 * left out (matching the detail panel's group totals), while a checked-out
 * room's balance still counts — the guest left owing it.
 */
export function collapseReservationGroups(rows: ReservationRowSource[]): BookingRow[] {
  const groupsMap = new Map<string, ReservationRowSource[]>();
  for (const b of rows) {
    const key = b.group_id ?? b.id;
    const arr = groupsMap.get(key);
    if (arr) arr.push(b);
    else groupsMap.set(key, [b]);
  }

  const bookings: BookingRow[] = [];
  for (const [key, members] of groupsMap) {
    const anchor = members.find((m) => m.id === key) ?? members[0];
    const isGroup = members.length > 1 || anchor.group_id != null;
    const roomsCount = members.reduce((n, m) => n + Math.max(1, m.rooms_count ?? 1), 0);

    // Cancelled lines are excluded from charge totals but still occupy their
    // lifecycle status, so a cancelled sibling cannot hide a live one.
    const billed = isGroup ? members.filter((m) => m.status !== "cancelled") : members;
    const totalAmount = isGroup
      ? billed.reduce((s, m) => s + (m.total_amount ?? 0), 0)
      : anchor.total_amount ?? 0;
    const amountPaid = isGroup
      ? billed.reduce((s, m) => s + (m.amount_paid ?? 0), 0)
      : anchor.amount_paid ?? 0;
    const outstandingBalance = isGroup
      ? billed.reduce((s, m) => s + (m.outstanding_balance ?? 0), 0)
      : anchor.outstanding_balance;

    bookings.push({
      id: anchor.id,
      reference: anchor.reference,
      guestName: anchor.guests?.full_name ?? "Unknown",
      guestEmail: anchor.guests?.email ?? null,
      guestPhone: anchor.guests?.phone ?? null,
      roomType: anchor.room_types?.name ?? null,
      roomNumber: anchor.rooms?.room_number ?? null,
      checkIn: anchor.check_in,
      checkOut: anchor.check_out,
      nights: anchor.nights,
      status: isGroup
        ? deriveReservationStatus(members.map((m) => m.status))
        : anchor.status ?? "pending",
      paymentStatus: isGroup
        ? deriveReservationPaymentStatus(billed, amountPaid, outstandingBalance ?? 0)
        : anchor.payment_status ?? "unpaid",
      source: anchor.source ?? "direct",
      totalAmount,
      amountPaid,
      outstandingBalance,
      roomsCount,
      createdAt: anchor.created_at,
    });
  }

  return bookings;
}

/**
 * Group payment posture from the summed money, not from whichever sibling is
 * the anchor: money collected against a balance still owed is Partial, never
 * the anchor's own Paid/Unpaid verdict. Fully refunded reservations keep their
 * refunded posture.
 */
function deriveReservationPaymentStatus(
  billed: ReservationRowSource[],
  amountPaid: number,
  outstanding: number,
): string {
  if (billed.length > 0 && billed.every((m) => m.payment_status === "refunded")) {
    return "refunded";
  }
  if (Math.round(outstanding * 100) <= 0) return "paid";
  return amountPaid > 0 ? "partial" : "unpaid";
}
