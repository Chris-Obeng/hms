import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { resolveRange } from "@/lib/reports/resolve-range";
import { businessDayBounds } from "@/lib/business-date";

const now = new Date("2026-10-21T00:30:00Z");
const range = (a: string, b: string, zone = "UTC") => resolveRange(a, b, zone, now);
describe("report range validation — labels always match effective dates", () => {
  it("preserves valid input and accepts exactly 366 days", () => {
    const { start, end } = range("2024-01-01", "2024-12-31");
    expect(format(start, "yyyy-MM-dd")).toBe("2024-01-01");
    expect(format(end, "yyyy-MM-dd")).toBe("2024-12-31");
  });
  it.each([["2026-03-10", "2026-03-01"], ["2024-01-01", "2025-01-01"], ["2026-10-22", "2026-10-22"], ["not-a-date", "2026-01-01"], ["2026-02-30", "2026-03-01"], ["2026-01-01T00:00:00Z", "2026-01-02"]])("rejects invalid range %s to %s instead of silently changing it", (start, end) => {
    expect(() => range(start, end)).toThrow();
  });
  it("uses the property's current day, not the server day", () => {
    expect(() => range("2026-10-21", "2026-10-21", "America/Los_Angeles")).toThrow("current date");
    expect(() => range("2026-10-21", "2026-10-21", "Asia/Tokyo")).not.toThrow();
    expect(() => range("2026-10-20", "2026-10-20", "Invalid/Zone")).toThrow();
  });
  it("constructs half-open property timestamp bounds across DST", () => {
    expect(businessDayBounds("2026-03-08", "America/New_York")).toEqual({ startISO: "2026-03-08T05:00:00.000Z", endISO: "2026-03-09T04:00:00.000Z" });
    expect(businessDayBounds("2026-11-01", "America/New_York")).toEqual({ startISO: "2026-11-01T04:00:00.000Z", endISO: "2026-11-02T05:00:00.000Z" });
  });
});
