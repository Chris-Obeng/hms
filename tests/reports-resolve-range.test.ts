import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { resolveRange } from "@/lib/reports/resolve-range";

const day = (d: Date) => format(d, "yyyy-MM-dd");

describe("resolveRange — date-range clamping", () => {
  it("keeps a valid past range untouched", () => {
    const { start, end } = resolveRange("2026-01-01", "2026-01-31");
    expect(day(start)).toBe("2026-01-01");
    expect(day(end)).toBe("2026-01-31");
  });

  it("swaps reversed ranges", () => {
    const { start, end } = resolveRange("2026-03-10", "2026-03-01");
    expect(day(start)).toBe("2026-03-01");
    expect(day(end)).toBe("2026-03-10");
  });

  it("caps future end dates at today", () => {
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    const { end } = resolveRange(
      day(new Date(today.getTime() - 5 * 86400000)),
      day(future)
    );
    expect(day(end)).toBe(day(today));
  });

  it("clamps a start in the future to today (single-day range)", () => {
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 10);
    const { start, end } = resolveRange(day(future), day(future));
    expect(day(start)).toBe(day(today));
    expect(day(end)).toBe(day(today));
  });

  it("falls back to today for invalid input and collapses end to start", () => {
    const today = new Date();
    const { start, end } = resolveRange("not-a-date", "also-bad");
    expect(day(start)).toBe(day(today));
    expect(day(end)).toBe(day(today));
  });

  it("caps spans longer than 365 days at start + 365", () => {
    const { start, end } = resolveRange("2024-01-01", "2026-08-24");
    expect(day(start)).toBe("2024-01-01");
    expect(day(end)).toBe("2024-12-31"); // 2024 leap year: Jan 1 + 365d
  });
});
