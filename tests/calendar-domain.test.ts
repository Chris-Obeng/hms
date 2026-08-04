import { describe, expect, it } from "vitest";
import { findOverlappingBookingIds, includesDate, isStayoverOnDate, staysOnDate, toStoredBlockRange } from "@/lib/calendar-domain";

describe("calendar date semantics", () => {
  it("stores a one-day room block as a bounded half-open range", () => {
    const range = toStoredBlockRange("2026-07-02", "2026-07-02");
    expect(range).toEqual({ startDate: "2026-07-02", endDate: "2026-07-03" });
    expect(includesDate(range, "2026-07-02")).toBe(true);
    expect(includesDate(range, "2026-07-03")).toBe(false);
    expect(includesDate(range, "2027-01-01")).toBe(false);
  });

  it("treats checkout date as available", () => {
    const stay = { id: "a", roomId: "101", checkIn: "2026-07-02", checkOut: "2026-07-04" };
    expect(staysOnDate(stay, "2026-07-03")).toBe(true);
    expect(staysOnDate(stay, "2026-07-04")).toBe(false);
  });

  it("counts stayovers only between arrival and checkout", () => {
    const stay = { id: "a", roomId: "101", checkIn: "2026-07-02", checkOut: "2026-07-05" };
    expect(isStayoverOnDate(stay, "2026-07-02")).toBe(false);
    expect(isStayoverOnDate(stay, "2026-07-03")).toBe(true);
    expect(isStayoverOnDate(stay, "2026-07-05")).toBe(false);
  });

  it("flags both bookings in same-room overlap only", () => {
    const conflicts = findOverlappingBookingIds([
      { id: "a", roomId: "101", checkIn: "2026-07-02", checkOut: "2026-07-05" },
      { id: "b", roomId: "101", checkIn: "2026-07-04", checkOut: "2026-07-06" },
      { id: "c", roomId: "102", checkIn: "2026-07-04", checkOut: "2026-07-06" },
      { id: "d", roomId: "101", checkIn: "2026-07-06", checkOut: "2026-07-07" },
    ]);
    expect([...conflicts].sort()).toEqual(["a", "b"]);
  });
});
