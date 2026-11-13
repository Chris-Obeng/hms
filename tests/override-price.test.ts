import { describe, expect, it } from "vitest";
import { MAX_OVERRIDE_PRICE, overridePriceProblem } from "@/lib/pricing/override-price";

describe("one-night price limits", () => {
  it("accepts prices from 0.01 up to the column limit with at most two decimals", () => {
    for (const price of [0.01, 1, 450.5, 1234.56, MAX_OVERRIDE_PRICE]) expect(overridePriceProblem(price)).toBeNull();
  });
  it("rejects zero, negative and non-finite prices", () => {
    for (const price of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(overridePriceProblem(price)).toBe("Enter a price above 0");
  });
  it("rejects prices the numeric(10,2) column cannot hold", () => {
    expect(overridePriceProblem(100_000_000)).toBe("Enter a price below 100,000,000");
  });
  it("rejects more than two decimals instead of letting the database round them", () => {
    expect(overridePriceProblem(10.005)).toBe("Use at most 2 decimal places");
  });
});
