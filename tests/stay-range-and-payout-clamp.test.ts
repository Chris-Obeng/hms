import { describe, expect, it } from "vitest";
import {
  validateStayRange,
  MAX_STAY_NIGHTS,
  MAX_LEAD_DAYS,
} from "@/lib/validation/params";
import { resolveRange } from "@/lib/payouts";

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fromToday = (days: number) => iso(new Date(Date.now() + days * DAY_MS));

describe("validateStayRange — server-side DoS guard for date-series RPCs", () => {
  it("accepts a normal short stay", () => {
    expect(validateStayRange(fromToday(1), fromToday(3)).ok).toBe(true);
  });

  it("rejects an inverted range (check-out before check-in)", () => {
    const r = validateStayRange(fromToday(5), fromToday(2));
    expect(r.ok).toBe(false);
  });

  it("rejects a zero-night range (same day)", () => {
    const r = validateStayRange(fromToday(2), fromToday(2));
    expect(r.ok).toBe(false);
  });

  it(`accepts a span of exactly ${MAX_STAY_NIGHTS} nights`, () => {
    expect(
      validateStayRange(fromToday(1), fromToday(1 + MAX_STAY_NIGHTS)).ok
    ).toBe(true);
  });

  it(`rejects a span of ${MAX_STAY_NIGHTS + 1} nights`, () => {
    const r = validateStayRange(fromToday(1), fromToday(2 + MAX_STAY_NIGHTS));
    expect(r.ok).toBe(false);
  });

  it("rejects the 1100-year DoS range outright", () => {
    const r = validateStayRange("1900-01-01", "2999-12-31");
    expect(r.ok).toBe(false);
  });

  it(`rejects a check-in more than ${MAX_LEAD_DAYS} days out`, () => {
    const r = validateStayRange(fromToday(MAX_LEAD_DAYS + 5), fromToday(MAX_LEAD_DAYS + 7));
    expect(r.ok).toBe(false);
  });

  it("rejects malformed dates before any range math", () => {
    expect(validateStayRange("not-a-date", fromToday(2)).ok).toBe(false);
    expect(validateStayRange(fromToday(1), "2026-13-40").ok).toBe(false);
  });
});

describe("payouts resolveRange — days branch honours the 366-day cap", () => {
  const spanDays = (from: string, to: string) =>
    (Date.parse(to) - Date.parse(from)) / DAY_MS;

  it("clamps an absurd days value to a 366-day span", () => {
    const { fromISO, toISO } = resolveRange({ days: 100000 });
    expect(spanDays(fromISO, toISO)).toBeLessThanOrEqual(366);
  });

  it("keeps the default 30-day window", () => {
    const { fromISO, toISO } = resolveRange({ days: 30 });
    expect(spanDays(fromISO, toISO)).toBeCloseTo(30, 0);
  });

  it("floors a sub-1 days value to at least 1 day", () => {
    const { fromISO, toISO } = resolveRange({ days: 0 });
    expect(spanDays(fromISO, toISO)).toBeCloseTo(1, 0);
  });

  it("caps an oversized explicit from/to span at 366 days", () => {
    const { fromISO, toISO } = resolveRange({ from: "1900-01-01", to: "2100-01-01" });
    expect(spanDays(fromISO, toISO)).toBeLessThanOrEqual(366);
  });
});
