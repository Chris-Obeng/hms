import { describe, expect, it } from "vitest";
import {
  countCartUnits,
  expandCartLines,
  RESERVATION_ROOM_CAP,
} from "@/lib/bookings/expand-cart-lines";

/**
 * The guest funnel posts one cart line per room type with a quantity, so a
 * guest booking two rooms of the SAME type arrives as one line with
 * `rooms_count: 2`. Left unexpanded it becomes a single booking row holding two
 * units: one dashboard entry, one calendar strip, and no way to check the rooms
 * out independently.
 */
describe("expandCartLines", () => {
  it("fans a same-type cart line out into one line per room", () => {
    const lines = [
      { room_type_id: "premium", rooms_count: 2, adults: 1, children: 0 },
    ];
    expect(expandCartLines(lines)).toEqual([
      { room_type_id: "premium", rooms_count: 1, adults: 1, children: 0 },
      { room_type_id: "premium", rooms_count: 1, adults: 1, children: 0 },
    ]);
  });

  it("keeps mixed-type carts and per-line occupancy intact", () => {
    const lines = [
      { room_type_id: "premium", rooms_count: 2, adults: 1, children: 0 },
      { room_type_id: "deluxe", rooms_count: 1, adults: 2, children: 1 },
    ];
    expect(expandCartLines(lines)).toEqual([
      { room_type_id: "premium", rooms_count: 1, adults: 1, children: 0 },
      { room_type_id: "premium", rooms_count: 1, adults: 1, children: 0 },
      { room_type_id: "deluxe", rooms_count: 1, adults: 2, children: 1 },
    ]);
  });

  it("leaves single-room carts byte-for-byte alone", () => {
    const lines = [{ room_type_id: "standard", rooms_count: 1, adults: 1, children: 0 }];
    expect(expandCartLines(lines)).toEqual(lines);
  });

  it("does not mutate the input", () => {
    const lines = [{ room_type_id: "premium", rooms_count: 2, adults: 1, children: 0 }];
    expandCartLines(lines);
    expect(lines).toEqual([{ room_type_id: "premium", rooms_count: 2, adults: 1, children: 0 }]);
  });

  it("counts units the same before and after expansion", () => {
    const cart = [
      { rooms_count: 2 },
      { rooms_count: 3 },
    ];
    expect(countCartUnits(cart)).toBe(5);
    expect(expandCartLines(cart)).toHaveLength(5);
    expect(countCartUnits(expandCartLines(cart))).toBe(5);
  });

  it("treats a zero or missing count as one room, never zero", () => {
    expect(expandCartLines([{ rooms_count: 0 }])).toEqual([{ rooms_count: 1 }]);
  });

  it("caps at the same ceiling the group writer enforces", () => {
    // 4 types × 5 rooms = 20 units; the RPC accepts at most 10 lines, so the
    // route must reject the oversized cart before expanding into the writer.
    const cart = Array.from({ length: 4 }, () => ({ rooms_count: 5 }));
    expect(countCartUnits(cart)).toBe(20);
    expect(expandCartLines(cart)).toHaveLength(20);
    expect(expandCartLines(cart).length).toBeGreaterThan(RESERVATION_ROOM_CAP);
  });
});
