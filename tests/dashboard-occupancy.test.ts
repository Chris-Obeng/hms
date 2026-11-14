import { describe, expect, it } from "vitest";
import {
  buildHistoricalRoomsSold, buildRoomsSoldMetric, calculateRoomsSold, formatSoldPercent, wasInHouseOnNight,
  type OccupancyContext, type OccupancyCounts, type OccupancyReservation, type OccupancyRoom,
} from "@/lib/metrics/dashboard-occupancy";

const context: OccupancyContext = { date: "2026-10-21", businessToday: "2026-10-21", asOf: "2026-10-21T12:00:00Z" };
const counts: OccupancyCounts = { totalRooms: 10, outOfService: 0, blocked: 0, soldRooms: 0, heldRooms: 0 };
const rooms: OccupancyRoom[] = Array.from({ length: 10 }, (_, i) => ({ id: `room-${i}`, room_type_id: "standard", status: "available" }));
function reservation(overrides: Partial<OccupancyReservation> = {}): OccupancyReservation {
  return {
    id: "booking-1", room_id: null, room_type_id: "standard", rooms_count: 1,
    status: "confirmed", payment_status: "unpaid", payment_preference: "pay_now",
    source: "direct", created_at: "2026-10-21T11:45:00Z", ...overrides,
  };
}
function snapshot(reservations: OccupancyReservation[], available: number, inventory = rooms, blockedRoomIds: string[] = []) {
  return buildRoomsSoldMetric({ context, rooms: inventory, reservations, blockedRoomIds, availability: [{ room_type_id: "standard", available }] });
}

describe("rooms-sold denominator and count validation", () => {
  it("marks zero inventory unavailable instead of zero percent", () => {
    expect(calculateRoomsSold(context, { ...counts, totalRooms: 0 })).toMatchObject({ state: "empty", sellableRooms: 0, soldPercent: null });
  });
  it("marks all-excluded inventory unavailable", () => {
    expect(calculateRoomsSold(context, { ...counts, outOfService: 8, blocked: 2 })).toMatchObject({ state: "empty", soldPercent: null });
  });
  it("shows zero sales when sellable inventory exists", () => {
    expect(calculateRoomsSold(context, counts)).toMatchObject({ state: "ready", soldPercent: 0, availableRooms: 10 });
  });
  it("shows exactly full inventory", () => {
    expect(calculateRoomsSold(context, { ...counts, soldRooms: 10 })).toMatchObject({ state: "ready", soldPercent: 100, availableRooms: 0 });
  });
  it("uses one unrounded fraction and excludes only unsellable inventory", () => {
    const metric = calculateRoomsSold(context, { totalRooms: 8, soldRooms: 2, heldRooms: 1, outOfService: 1, blocked: 1 });
    expect(metric).toMatchObject({ state: "ready", sellableRooms: 6, availableRooms: 3 });
    expect(metric.soldPercent).toBeCloseTo(100 / 3, 10);
    expect(formatSoldPercent(metric.soldPercent!)).toBe("33.3");
    expect(metric.soldRooms! + metric.heldRooms! + metric.availableRooms!).toBe(metric.sellableRooms);
  });
  it("retains overselling and a negative availability balance without capping at 100", () => {
    const metric = calculateRoomsSold(context, { ...counts, soldRooms: 12 });
    expect(metric).toMatchObject({ state: "inconsistent", soldPercent: 120, availableRooms: -2 });
    expect(metric.issues.join(" ")).toContain("exceed sellable inventory by 2 rooms");
  });
  it("detects exclusions that exceed inventory", () => {
    expect(calculateRoomsSold(context, { ...counts, blocked: 11 })).toMatchObject({ state: "inconsistent", soldPercent: null });
  });
  it.each([NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid count %s instead of normalizing it", (soldRooms) => {
    expect(calculateRoomsSold(context, { ...counts, soldRooms })).toMatchObject({ state: "inconsistent", soldPercent: null, soldRooms: null });
  });
  it("does not reconstruct past facts from live status", () => {
    const past = { ...context, date: "2026-10-20" };
    const live = buildRoomsSoldMetric({ context: past, rooms, reservations: [reservation()], blockedRoomIds: [], availability: [{ room_type_id: "standard", available: 9 }] });
    expect(live).toMatchObject({ state: "unavailable", basis: "historical-unavailable", soldRooms: null, totalRooms: null });
  });
  it("labels recorded past counts as historical", () => {
    expect(calculateRoomsSold({ ...context, date: "2026-10-20" }, { ...counts, soldRooms: 4 })).toMatchObject({ state: "ready", basis: "historical", soldRooms: 4, soldPercent: 40 });
  });
  it("identifies future values as a projection", () => {
    expect(calculateRoomsSold({ ...context, date: "2026-10-22" }, counts).basis).toBe("projection");
  });
});

describe("availability-compatible room-night inventory", () => {
  it("counts legacy multi-room reservations by quantity, even when unassigned", () => {
    expect(snapshot([reservation({ rooms_count: 3 })], 7)).toMatchObject({ state: "ready", soldRooms: 3, soldPercent: 30 });
  });
  it("shows live pending holds separately from confirmed sales", () => {
    const metric = snapshot([reservation({ rooms_count: 2 }), reservation({ id: "hold", status: "pending", rooms_count: 3 })], 5);
    expect(metric).toMatchObject({ state: "ready", soldRooms: 2, heldRooms: 3, availableRooms: 5, soldPercent: 20 });
  });
  it("expires only unpaid direct pay-now holds older than thirty minutes", () => {
    const metric = snapshot([
      reservation({ id: "expired", status: "pending", created_at: "2026-10-21T11:29:59Z" }),
      reservation({ id: "boundary", status: "pending", created_at: "2026-10-21T11:30:00Z" }),
      reservation({ id: "paid", status: "pending", payment_status: "partial", created_at: "2026-10-20T12:00:00Z" }),
      reservation({ id: "desk", status: "pending", source: "manual", created_at: "2026-10-20T12:00:00Z" }),
      reservation({ id: "later", status: "pending", payment_preference: "pay_later", created_at: "2026-10-20T12:00:00Z" }),
    ], 6);
    expect(metric).toMatchObject({ state: "ready", soldRooms: 0, heldRooms: 4, availableRooms: 6 });
  });
  it("excludes cancelled, checked-out and no-show reservations", () => {
    expect(snapshot(["cancelled", "checked_out", "no_show"].map((status) => reservation({ id: status, status })), 10).soldRooms).toBe(0);
  });
  it("deduplicates blocks and never counts a blocked out-of-service room twice", () => {
    const inventory = rooms.map((room, i) => ({ ...room, status: i < 2 ? "maintenance" : "available" }));
    const metric = snapshot([reservation({ rooms_count: 2 })], 5, inventory, ["room-0", "room-2", "room-2", "inactive-room"]);
    expect(metric).toMatchObject({ state: "ready", totalRooms: 10, outOfService: 2, blocked: 1, sellableRooms: 7, soldRooms: 2, availableRooms: 5 });
  });
  it("flags reservations assigned to blocked or out-of-service rooms", () => {
    expect(snapshot([reservation({ room_id: "room-0" })], 8, rooms, ["room-0"]).state).toBe("inconsistent");
  });
  it("flags double room assignments even with spare capacity", () => {
    const metric = snapshot([reservation({ room_id: "room-0" }), reservation({ id: "other", room_id: "room-0" })], 8);
    expect(metric.state).toBe("inconsistent");
    expect(metric.issues.join(" ")).toContain("same room");
  });
  it("never lets spare capacity in a different type conceal overbooking", () => {
    const metric = buildRoomsSoldMetric({ context,
      rooms: [...rooms.slice(0, 1), ...rooms.slice(1).map((room) => ({ ...room, room_type_id: "deluxe" }))],
      reservations: [reservation({ rooms_count: 2 })], blockedRoomIds: [],
      availability: [{ room_type_id: "standard", available: 0 }, { room_type_id: "deluxe", available: 9 }],
    });
    expect(metric.state).toBe("inconsistent");
    expect(metric.issues.join(" ")).toContain("room type is oversold");
  });
  it.each([NaN, -1, 1.5, 0])("does not invent rooms for invalid booking quantity %s", (rooms_count) => {
    expect(snapshot([reservation({ rooms_count })], 9)).toMatchObject({ state: "inconsistent", soldRooms: null });
  });
  it("flags a missing creation time for an expirable hold", () => {
    expect(snapshot([reservation({ status: "pending", created_at: null })], 9).state).toBe("inconsistent");
  });
  it.each([NaN, -1, 11, 8])("rejects malformed or unreconciled RPC availability %s", (available) => {
    expect(snapshot([reservation()], available).state).toBe("inconsistent");
  });
  it("requires every expected room type in the authoritative RPC response", () => {
    expect(buildRoomsSoldMetric({ context, rooms, reservations: [], blockedRoomIds: [], availability: [] }).state).toBe("inconsistent");
  });
});

describe("past nights from recorded history", () => {
  const past = { ...context, date: "2026-10-20" };
  const inventory = { effective_date: "2026-10-01", capacity_by_type: { standard: 6, suite: 2 }, time_zone: "UTC" };
  const history = (overrides: Partial<Parameters<typeof buildHistoricalRoomsSold>[0]> = {}) =>
    buildHistoricalRoomsSold({
      context: past, timeZone: "UTC", inventory,
      outOfServiceRoomIds: ["r1"], blockedRoomIds: ["r1", "r2"],
      stays: [{ id: "s1", rooms_count: 1 }, { id: "s2", rooms_count: 2 }],
      ...overrides,
    });
  it("uses recorded capacity, end-of-day exclusions and checked-in stays", () => {
    // r1 is both out of service and blocked: it counts once, as out of service.
    expect(history()).toMatchObject({
      state: "ready", basis: "historical", totalRooms: 8, outOfService: 1, blocked: 1,
      soldRooms: 3, heldRooms: 0, sellableRooms: 6, availableRooms: 3, soldPercent: 50,
    });
  });
  it("is unavailable before the first inventory record", () => {
    expect(history({ inventory: null })).toMatchObject({ state: "unavailable", basis: "historical-unavailable", totalRooms: null });
  });
  it("does not carry a record across a time-zone change", () => {
    expect(history({ inventory: { ...inventory, time_zone: "Africa/Accra" } })).toMatchObject({ state: "unavailable" });
  });
  it("shows a double-booked night instead of capping it", () => {
    const metric = history({ outOfServiceRoomIds: [], blockedRoomIds: [], stays: Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, rooms_count: 1 })) });
    expect(metric).toMatchObject({ state: "inconsistent", soldRooms: 9, availableRooms: -1 });
  });
  it("stops counting a guest from the day they checked out early", () => {
    // Room 8 on 2026-10-01 in production: booked 09-30 → 10-02, checked out
    // 10-01 07:10, and the room resold that day. One room, not two.
    const metric = history({
      context: { ...past, date: "2026-10-01" },
      outOfServiceRoomIds: [], blockedRoomIds: [],
      stays: [
        { id: "early", rooms_count: 1, room_id: "r8", status: "checked_out", check_out_at: "2026-10-01T07:10:00Z" },
        { id: "next", rooms_count: 1, room_id: "r8", status: "checked_out", check_out_at: "2026-10-16T13:51:00Z" },
      ],
    });
    expect(metric).toMatchObject({ state: "ready", soldRooms: 1 });
  });
  it("still counts the night before an early check-out, and keeps booked dates without a check-out time", () => {
    const stay = { id: "s", rooms_count: 1, status: "checked_out", check_out_at: "2026-10-01T07:10:00Z" };
    expect(wasInHouseOnNight(stay, "2026-09-30", "UTC")).toBe(true);
    expect(wasInHouseOnNight(stay, "2026-10-01", "UTC")).toBe(false);
    expect(wasInHouseOnNight({ ...stay, check_out_at: null }, "2026-10-01", "UTC")).toBe(true);
    expect(wasInHouseOnNight({ ...stay, status: "checked_in" }, "2026-10-01", "UTC")).toBe(true);
    // A guest who leaves on their arrival day still used that night.
    expect(wasInHouseOnNight({ ...stay, check_in: "2026-10-01" }, "2026-10-01", "UTC")).toBe(true);
    expect(wasInHouseOnNight({ ...stay, check_in: "2026-10-01" }, "2026-10-02", "UTC")).toBe(false);
    // The business day follows the property's time zone, not UTC.
    expect(wasInHouseOnNight({ ...stay, check_out_at: "2026-10-01T03:00:00Z" }, "2026-09-30", "America/New_York")).toBe(false);
  });
  it("flags a stay in a room recorded as out of service or blocked", () => {
    const metric = history({ stays: [{ id: "s1", rooms_count: 1, room_id: "r2", status: "checked_in" }] });
    expect(metric.state).toBe("inconsistent");
    expect(metric.issues.join(" ")).toContain("out of service or blocked");
  });
  it("flags two stays in the same room on one night", () => {
    const metric = history({
      outOfServiceRoomIds: [], blockedRoomIds: [],
      stays: [
        { id: "a", rooms_count: 1, room_id: "r5", status: "checked_in" },
        { id: "b", rooms_count: 1, room_id: "r5", status: "checked_in" },
      ],
    });
    expect(metric.state).toBe("inconsistent");
    expect(metric.issues.join(" ")).toContain("same room");
  });
  it("rejects invalid recorded capacity", () => {
    expect(history({ inventory: { ...inventory, capacity_by_type: { standard: -1 } } }).state).toBe("inconsistent");
  });
});
