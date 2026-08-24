import { describe, expect, it } from "vitest";
import {
  canTransitionBooking,
  getStatusLabel,
  getPaymentLabel,
} from "@/lib/booking-status";

describe("booking status transition guards", () => {
  it("allows the normal front-desk workflow", () => {
    expect(canTransitionBooking("pending", "confirmed")).toBe(true);
    expect(canTransitionBooking("confirmed", "checked_in")).toBe(true);
    expect(canTransitionBooking("checked_in", "checked_out")).toBe(true);
  });

  it("allows cancellation from pending and confirmed only", () => {
    expect(canTransitionBooking("pending", "cancelled")).toBe(true);
    expect(canTransitionBooking("confirmed", "cancelled")).toBe(true);
    expect(canTransitionBooking("checked_in", "cancelled")).toBe(false);
    expect(canTransitionBooking("checked_out", "cancelled")).toBe(false);
  });

  it("allows manager reinstatement of cancelled bookings to confirmed", () => {
    expect(canTransitionBooking("cancelled", "confirmed")).toBe(true);
    expect(canTransitionBooking("cancelled", "pending")).toBe(false);
    expect(canTransitionBooking("cancelled", "checked_in")).toBe(false);
  });

  it("terminal statuses allow nothing", () => {
    for (const next of ["confirmed", "checked_in", "checked_out", "cancelled", "no_show", "pending"]) {
      expect(canTransitionBooking("checked_out", next)).toBe(false);
      expect(canTransitionBooking("no_show", next)).toBe(false);
    }
  });

  it("rejects same-status and unknown transitions", () => {
    expect(canTransitionBooking("confirmed", "confirmed")).toBe(false);
    expect(canTransitionBooking(null, "confirmed")).toBe(false);
    expect(canTransitionBooking("", "confirmed")).toBe(false);
    expect(canTransitionBooking("bogus_status", "confirmed")).toBe(false);
    expect(canTransitionBooking("pending", "bogus_target")).toBe(false);
  });

  it("labels stay total — every transitionable status has a label", () => {
    for (const status of ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"]) {
      expect(getStatusLabel(status)).not.toBe(status);
    }
    for (const payment of ["paid", "partial", "unpaid", "refunded"]) {
      expect(getPaymentLabel(payment)).not.toBe(payment);
    }
  });
});
