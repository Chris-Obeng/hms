import { describe, expect, it } from "vitest";
import { buildCartLines, countCartRooms, makeRoom, MAX_ROOMS_PER_RESERVATION, priceRoom, remainingRoomAllowance, sumRooms } from "@/lib/bookings/cart";
import { RESERVATION_ROOM_CAP } from "@/lib/bookings/expand-cart-lines";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";

describe("cart pricing", () => {
  it("prices and taxes each room on its own, like the server does", () => {
    const room = makeRoom("r1", 2, 0);
    expect(priceRoom(room, 1200, 5)).toEqual({
      key: "r1",
      adults: 2,
      children: 0,
      subtotal: 1200,
      tax: 60,
      total: 1260,
    });
  });

  it("rounds tax per room — the sum can differ from rounding the sum", () => {
    // 3 rooms at 333.33 × 10% = 33.333 → 33.33 each; rounding 999.99 once gives
    // 100.00, so a line-level calculation would overstate the charge by a pesewa.
    const rooms = ["a", "b", "c"].map((key) => priceRoom(makeRoom(key, 1, 0), 333.33, 10));
    expect(rooms.map((r) => r.tax)).toEqual([33.33, 33.33, 33.33]);
    const totals = sumRooms(rooms, "GHS");
    expect(totals.tax).toBe(99.99);
    expect(totals.subtotal).toBe(999.99);
    expect(totals.total).toBe(1099.98);
  });

  it("sums rooms in minor units without drift", () => {
    const rooms = Array.from({ length: 10 }, (_, i) => priceRoom(makeRoom(`r${i}`, 1, 0), 0.1, 0));
    expect(sumRooms(rooms, "GHS").subtotal).toBe(1);
    expect(toMinor(sumRooms(rooms, "GHS").subtotal, "GHS")).toBe(sumMinor(rooms.map((r) => toMinor(r.subtotal, "GHS"))));
    expect(fromMinor(toMinor(1, "GHS"), "GHS")).toBe(1);
  });

  it("carries a room's own occupancy through pricing", () => {
    const priced = priceRoom(makeRoom("r", 2, 1), 500, 0);
    expect(priced.adults).toBe(2);
    expect(priced.children).toBe(1);
    expect(priced.total).toBe(500);
  });
});

describe("buildCartLines", () => {
  it("posts one line per room so each room keeps its occupancy", () => {
    const lines = [
      {
        roomTypeId: "premium",
        rooms: [makeRoom("a", 2, 0), makeRoom("b", 1, 1)],
      },
      { roomTypeId: "deluxe", rooms: [makeRoom("c", 2, 0)] },
    ];
    expect(buildCartLines(lines, { checkIn: "2026-10-05", checkOut: "2026-10-07" })).toEqual([
      { room_type_id: "premium", check_in: "2026-10-05", check_out: "2026-10-07", adults: 2, children: 0, rooms_count: 1 },
      { room_type_id: "premium", check_in: "2026-10-05", check_out: "2026-10-07", adults: 1, children: 1, rooms_count: 1 },
      { room_type_id: "deluxe", check_in: "2026-10-05", check_out: "2026-10-07", adults: 2, children: 0, rooms_count: 1 },
    ]);
  });

  it("never sends rooms_count > 1, so the same-type case can't collapse", () => {
    const same = [{ roomTypeId: "standard", rooms: [makeRoom("a", 1, 0), makeRoom("b", 1, 0)] }];
    const payload = buildCartLines(same, { checkIn: "2026-10-05", checkOut: "2026-10-06" });
    expect(payload).toHaveLength(2);
    expect(payload.every((line) => line.rooms_count === 1)).toBe(true);
  });
});

describe("cart caps", () => {
  it("counts rooms across lines", () => {
    expect(countCartRooms([{ rooms: [makeRoom("a", 1, 0)] }, { rooms: [makeRoom("b", 1, 0), makeRoom("c", 1, 0)] }])).toBe(3);
  });

  it("reports the remaining allowance against the reservation ceiling", () => {
    const lines = [{ rooms: Array.from({ length: 7 }, (_, i) => makeRoom(`r${i}`, 1, 0)) }];
    expect(remainingRoomAllowance(lines)).toBe(MAX_ROOMS_PER_RESERVATION - 7);
    expect(remainingRoomAllowance([{ rooms: Array.from({ length: 12 }, (_, i) => makeRoom(`r${i}`, 1, 0)) }])).toBe(0);
  });

  it("uses the group writer's own ceiling, so the cart cannot outgrow the API", () => {
    expect(MAX_ROOMS_PER_RESERVATION).toBe(RESERVATION_ROOM_CAP);
  });
});

describe("priceRoom mirrors the server's integer tax arithmetic", () => {
  it("rounds a half-cent tie up, like round(subtotal_minor * bps / 10000)", () => {
    // Server: round(16170 * 500 / 10000) = 809. The float form of this sum
    // computed Math.round(161.7 * 0.05 * 100) = 808 and under-displayed the total.
    const room = priceRoom(makeRoom("r", 1, 0), 161.7, 5, "GHS");
    expect(room.tax).toBe(8.09);
    expect(room.total).toBe(169.79);
  });

  it("holds for other half-cent ties", () => {
    expect(priceRoom(makeRoom("r", 1, 0), 100.1, 15, "GHS").tax).toBe(15.02);
    expect(priceRoom(makeRoom("r", 1, 0), 20.7, 5, "GHS").tax).toBe(1.04);
    expect(priceRoom(makeRoom("r", 1, 0), 128.2, 12.5, "GHS").tax).toBe(16.03);
  });

  it("follows the currency exponent (UGX has no minor unit)", () => {
    const room = priceRoom(makeRoom("r", 1, 0), 12000, 18, "UGX");
    expect(room.tax).toBe(2160);
    expect(room.total).toBe(14160);
  });

  it("charges no tax when the hotel has none", () => {
    expect(priceRoom(makeRoom("r", 1, 0), 99.99, 0, "GHS").tax).toBe(0);
  });
});
