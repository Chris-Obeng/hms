import { afterEach, describe, expect, it, vi } from "vitest";
import { bookingToAvailabilityRange, isBeds24Configured } from "@/lib/beds24";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isBeds24Configured", () => {
  it("is true when either master credential is present", () => {
    vi.stubEnv("BEDS24_REFRESH_TOKEN", "refresh");
    vi.stubEnv("BEDS24_API_TOKEN", "");
    expect(isBeds24Configured()).toBe(true);

    vi.stubEnv("BEDS24_REFRESH_TOKEN", "");
    vi.stubEnv("BEDS24_API_TOKEN", "token");
    expect(isBeds24Configured()).toBe(true);
  });

  it("is false when neither credential is set", () => {
    vi.stubEnv("BEDS24_REFRESH_TOKEN", "");
    vi.stubEnv("BEDS24_API_TOKEN", "");
    expect(isBeds24Configured()).toBe(false);
  });
});

describe("bookingToAvailabilityRange", () => {
  it("makes the range inclusive of the last occupied night", () => {
    expect(bookingToAvailabilityRange("2026-03-02", "2026-03-05")).toEqual({
      from: "2026-03-02",
      to: "2026-03-04",
    });
  });

  it("handles single-night stays", () => {
    expect(bookingToAvailabilityRange("2026-03-02", "2026-03-03")).toEqual({
      from: "2026-03-02",
      to: "2026-03-02",
    });
  });

  it("rolls back across month and year boundaries", () => {
    expect(bookingToAvailabilityRange("2026-02-26", "2026-03-01").to).toBe("2026-02-28");
    expect(bookingToAvailabilityRange("2025-12-30", "2026-01-01").to).toBe("2025-12-31");
  });
});
