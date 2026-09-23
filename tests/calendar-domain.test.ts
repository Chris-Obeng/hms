import { describe, expect, it } from "vitest";
import { findOverlappingBookingIds, includesDate, isCancelledOnDate, isCheckedInStayoverOnDate, isInHouseOnDate, isStayoverOnDate, staysOnDate, toStoredBlockRange } from "@/lib/calendar-domain";

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

  it("requires checked-in status for in-house guests", () => {
    const reservation = { id: "a", roomId: "101", checkIn: "2026-07-02", checkOut: "2026-07-05", status: "confirmed" };
    expect(isInHouseOnDate(reservation, "2026-07-02")).toBe(false);
    expect(isInHouseOnDate({ ...reservation, status: "checked_in" }, "2026-07-02")).toBe(true);
    expect(isInHouseOnDate({ ...reservation, status: "checked_out" }, "2026-07-03")).toBe(false);
    expect(isInHouseOnDate({ ...reservation, status: "checked_in" }, "2026-07-05")).toBe(true);
  });

  it("requires checked-in status and an overnight continuation for stayovers", () => {
    const reservation = { id: "a", roomId: "101", checkIn: "2026-07-02", checkOut: "2026-07-05", status: "confirmed" };
    expect(isCheckedInStayoverOnDate(reservation, "2026-07-03")).toBe(false);
    expect(isCheckedInStayoverOnDate({ ...reservation, status: "checked_in" }, "2026-07-02")).toBe(false);
    expect(isCheckedInStayoverOnDate({ ...reservation, status: "checked_in" }, "2026-07-03")).toBe(true);
    expect(isCheckedInStayoverOnDate({ ...reservation, status: "checked_in" }, "2026-07-05")).toBe(false);
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

describe("cancellation date semantics", () => {
  it("matches cancellations on the cancellation event date", () => {
    const booking = { status: "cancelled", cancelledAt: "2026-09-23T09:15:00.000+00:00" };
    expect(isCancelledOnDate(booking, "2026-09-23")).toBe(true);
    expect(isCancelledOnDate(booking, "2026-09-22")).toBe(false);
    expect(isCancelledOnDate(booking, "2026-09-24")).toBe(false);
  });

  it("does not resurrect old cancellations when the row is touched later", () => {
    // Regression: a backfill/settlement job bumps updated_at on 2026-09-23,
    // but the cancellation happened in August — it must not appear today.
    const booking = { status: "cancelled", cancelledAt: "2026-08-14T14:00:19.913+00:00" };
    expect(isCancelledOnDate(booking, "2026-09-23")).toBe(false);
    expect(isCancelledOnDate(booking, "2026-08-14")).toBe(true);
  });

  it("rejects non-cancelled statuses and missing cancellation timestamps", () => {
    expect(isCancelledOnDate({ status: "confirmed", cancelledAt: "2026-09-23T09:15:00.000+00:00" }, "2026-09-23")).toBe(false);
    expect(isCancelledOnDate({ status: "checked_out", cancelledAt: "2026-09-23T09:15:00.000+00:00" }, "2026-09-23")).toBe(false);
    expect(isCancelledOnDate({ status: "cancelled", cancelledAt: null }, "2026-09-23")).toBe(false);
    expect(isCancelledOnDate({ status: "cancelled", cancelledAt: undefined }, "2026-09-23")).toBe(false);
  });

  it("includes the day-start instant and excludes the next day's start", () => {
    // Boundary regression: half-open [start, end) day bounds must not drop a
    // cancellation stamped at exactly midnight, nor pull in the next day's.
    const dayStart = { status: "cancelled", cancelledAt: "2026-09-23T00:00:00.000+00:00" };
    const nextDayStart = { status: "cancelled", cancelledAt: "2026-09-24T00:00:00.000+00:00" };
    expect(isCancelledOnDate(dayStart, "2026-09-23")).toBe(true);
    expect(isCancelledOnDate(nextDayStart, "2026-09-23")).toBe(false);
    expect(isCancelledOnDate(nextDayStart, "2026-09-24")).toBe(true);
  });

  it("resolves the cancellation day in the property timezone, not UTC", () => {
    // 22:30Z on Sep 22 is already Sep 23 in Nairobi (UTC+3), but still
    // Sep 22 in New York (UTC-4) and in UTC.
    const booking = { status: "cancelled", cancelledAt: "2026-09-22T22:30:00.000+00:00" };
    expect(isCancelledOnDate(booking, "2026-09-23", "Africa/Nairobi")).toBe(true);
    expect(isCancelledOnDate(booking, "2026-09-22", "Africa/Nairobi")).toBe(false);
    expect(isCancelledOnDate(booking, "2026-09-22", "America/New_York")).toBe(true);
    expect(isCancelledOnDate(booking, "2026-09-22")).toBe(true); // default UTC
  });
});
