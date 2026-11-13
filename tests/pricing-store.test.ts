import { beforeEach, describe, expect, it } from "vitest";
import { usePricingStore } from "@/lib/store/pricing-store";

const initialState = usePricingStore.getState();

beforeEach(() => {
  usePricingStore.setState(initialState, true);
});

describe("pricing store defaults", () => {
  it("defaults to a two-week viewport of YYYY-MM-DD dates", () => {
    const { startDateStr, endDateStr, rangeInitialized } = usePricingStore.getState();
    expect(startDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rangeInitialized).toBe(false);

    const days = Math.round(
      (Date.parse(endDateStr) - Date.parse(startDateStr)) / 86_400_000
    );
    expect(days).toBe(13);
  });
});

describe("viewport", () => {
  it("stores the date range and marks it initialized", () => {
    usePricingStore.getState().setDateRange("2026-04-01", "2026-04-30");

    const s = usePricingStore.getState();
    expect(s.startDateStr).toBe("2026-04-01");
    expect(s.endDateStr).toBe("2026-04-30");
    expect(s.rangeInitialized).toBe(true);
  });
});
