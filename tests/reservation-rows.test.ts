import { describe, expect, it } from "vitest";
import {
  collapseReservationGroups,
  type ReservationRowSource,
} from "@/lib/bookings/reservation-rows";

/**
 * Fixtures are the real rows of a two-room reservation (group c235bf9e…,
 * Elizabeth Nkrumah, "room 6" + "room 8", 2026-09-30 → 2026-10-02) as they
 * stood after the front desk checked one room out: the anchor row (room 8) is
 * checked_out, its sibling (room 6) is still checked_in. That split is the
 * reported bug — the list claimed the whole reservation had checked out.
 */
const ANCHOR_ID = "c235bf9e-c372-403c-8563-5dbe0dbb28bd";
const SIBLING_ID = "839a7aaf-695e-4b37-a23e-f24ae5d035f8";

function roomRow(overrides: Partial<ReservationRowSource>): ReservationRowSource {
  return {
    id: ANCHOR_ID,
    reference: "8600790185330",
    check_in: "2026-09-30",
    check_out: "2026-10-02",
    nights: 2,
    status: "checked_out",
    payment_status: "unpaid",
    source: "direct",
    total_amount: 4199.98,
    amount_paid: 0,
    outstanding_balance: 4199.98,
    rooms_count: 1,
    group_id: ANCHOR_ID,
    created_at: "2026-09-30T07:52:08.48913+00:00",
    guests: { full_name: "Elizabeth Nkrumah", email: "elizabeth@example.com", phone: "+233200000000" },
    rooms: { room_number: "room 8" },
    room_types: { name: "Middle-Room" },
    ...overrides,
  };
}

const anchorRow = roomRow({});
const siblingRow = roomRow({
  id: SIBLING_ID,
  reference: "3133888972154",
  status: "checked_in",
  payment_status: "paid",
  total_amount: 6300,
  amount_paid: 6300,
  outstanding_balance: 0,
  rooms: { room_number: "room 6" },
  room_types: { name: "Premium Room" },
});

describe("collapseReservationGroups", () => {
  it("keeps the reservation in-house while any room is still checked in", () => {
    // Anchor first, and sibling first: sibling order is query-order, never
    // a signal — the anchor must not speak for the rooms that stayed.
    for (const rows of [
      [anchorRow, siblingRow],
      [siblingRow, anchorRow],
    ]) {
      const [reservation] = collapseReservationGroups(rows);
      expect(reservation.status).toBe("checked_in");
    }
  });

  it("reports checked_out only once every room has left", () => {
    const [reservation] = collapseReservationGroups([
      anchorRow,
      { ...siblingRow, status: "checked_out" },
    ]);
    expect(reservation.status).toBe("checked_out");
  });

  it("keeps a reservation actionable while a room is still expected", () => {
    const [reservation] = collapseReservationGroups([
      { ...anchorRow, status: "cancelled" },
      { ...siblingRow, status: "confirmed" },
    ]);
    expect(reservation.status).toBe("confirmed");
  });

  it("reports cancelled only when every room is cancelled", () => {
    const [reservation] = collapseReservationGroups([
      { ...anchorRow, status: "cancelled" },
      { ...siblingRow, status: "cancelled" },
    ]);
    expect(reservation.status).toBe("cancelled");
  });

  it("sums money across sibling rooms and derives the group payment posture", () => {
    const [reservation] = collapseReservationGroups([anchorRow, siblingRow]);
    expect(reservation.roomsCount).toBe(2);
    expect(reservation.totalAmount).toBeCloseTo(10499.98, 2);
    expect(reservation.amountPaid).toBeCloseTo(6300, 2);
    expect(reservation.outstandingBalance).toBeCloseTo(4199.98, 2);
    // 6300 collected against a 10499.98 reservation: Partial, never the
    // anchor's own "Paid"/"Unpaid" verdict.
    expect(reservation.paymentStatus).toBe("partial");
  });

  it("voids a cancelled room's money instead of charging it to the group", () => {
    const [reservation] = collapseReservationGroups([
      { ...anchorRow, status: "cancelled" },
      siblingRow,
    ]);
    expect(reservation.totalAmount).toBeCloseTo(6300, 2);
    expect(reservation.outstandingBalance).toBeCloseTo(0, 2);
    expect(reservation.paymentStatus).toBe("paid");
  });

  it("leaves a single-room booking on its own stored status", () => {
    const solo = roomRow({ group_id: null, status: "confirmed", payment_status: "partial" });
    const [reservation] = collapseReservationGroups([solo]);
    expect(reservation.status).toBe("confirmed");
    expect(reservation.paymentStatus).toBe("partial");
    expect(reservation.roomsCount).toBe(1);
  });

  it("emits one row per reservation", () => {
    const solo = roomRow({ id: "11111111-1111-4111-8111-111111111111", group_id: null });
    const rows = collapseReservationGroups([anchorRow, siblingRow, solo]);
    expect(rows).toHaveLength(2);
  });
});

describe("collapseReservationGroups — a refund owed on one room", () => {
  it("does not cancel out what another room still owes", () => {
    const refunded = roomRow({ total_amount: 297, amount_paid: 1485, outstanding_balance: -1188, payment_status: "paid" });
    const owing = roomRow({
      id: SIBLING_ID,
      reference: "3133888972154",
      status: "checked_in",
      total_amount: 1188,
      amount_paid: 0,
      outstanding_balance: 1188,
    });
    const [row] = collapseReservationGroups([refunded, owing]);
    expect(row.outstandingBalance).toBe(1188);
    expect(row.paymentStatus).toBe("partial");
  });
});
