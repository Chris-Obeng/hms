import { describe, expect, it } from "vitest";
import {
  isEarlyDeparture,
  parseEarlyDeparturePreview,
  parseEarlyDepartureResult,
  readEarlyDeparturePolicy,
} from "@/lib/bookings/early-departure";

const outcome = {
  booking_id: "b1",
  currency: "GHS",
  check_out_before: "2026-11-17",
  check_out_after: "2026-11-14",
  nights_released: 3,
  released_amount: "1188.00",
  early_departure_fee: 1188,
  total_before: 1485,
  total_after: 1485,
  amount_paid: 500,
  overpaid: 0,
  payment_status: "partial",
};

describe("early departures", () => {
  it("is early only when the stay would end before its booked departure", () => {
    expect(isEarlyDeparture("2026-11-12", "2026-11-17", "2026-11-14")).toBe(true);
    expect(isEarlyDeparture("2026-11-12", "2026-11-14", "2026-11-14")).toBe(false);
    // Leaving on arrival day keeps one night, so a one-night stay is never early.
    expect(isEarlyDeparture("2026-11-14", "2026-11-15", "2026-11-14")).toBe(false);
    expect(isEarlyDeparture("2026-11-14", "2026-11-17", "2026-11-14")).toBe(true);
  });

  it("defaults to keeping the bill when the hotel never chose", () => {
    expect(readEarlyDeparturePolicy(null)).toBe("charge");
    expect(readEarlyDeparturePolicy({ early_departure_policy: "release" })).toBe("release");
    expect(readEarlyDeparturePolicy({ early_departure_policy: "refund" })).toBe("charge");
  });

  it("reads the SQL result, including numeric strings", () => {
    expect(parseEarlyDepartureResult({ ...outcome, policy: "charge", departure_date: "2026-11-14" })).toMatchObject({
      policy: "charge",
      nightsReleased: 3,
      releasedAmount: 1188,
      earlyDepartureFee: 1188,
      totalAfter: 1485,
    });
    expect(() => parseEarlyDepartureResult({ ...outcome, policy: "refund", departure_date: "2026-11-14" })).toThrow();
    expect(() => parseEarlyDepartureResult({ ...outcome, total_after: "n/a", policy: "charge", departure_date: "x" })).toThrow();
  });

  it("reads a preview, or null when the guest is not leaving early", () => {
    expect(parseEarlyDeparturePreview({ early: false })).toBeNull();
    const preview = parseEarlyDeparturePreview({
      early: true,
      policy: "release",
      departure_date: "2026-11-14",
      charge: outcome,
      release: { ...outcome, early_departure_fee: 0, total_after: 297, overpaid: 203 },
    });
    expect(preview).toMatchObject({ policy: "release", release: { totalAfter: 297, overpaid: 203 } });
  });
});
