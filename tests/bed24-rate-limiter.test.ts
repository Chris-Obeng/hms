import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPERATION_COSTS,
  RATE_LIMIT_CONFIG,
  bed24RateLimiter,
  canPerformOperation,
  getRateLimitSummary,
} from "@/lib/bed24-rate-limiter";

beforeEach(() => {
  bed24RateLimiter.reset();
});

afterEach(() => {
  vi.useRealTimers();
  bed24RateLimiter.reset();
});

describe("credit accounting", () => {
  it("starts with a full credit budget", () => {
    expect(bed24RateLimiter.getRemainingCredits()).toBe(RATE_LIMIT_CONFIG.MAX_CREDITS);
    const status = bed24RateLimiter.getStatus();
    expect(status.total).toBe(RATE_LIMIT_CONFIG.MAX_CREDITS);
    expect(status.requests).toEqual([]);
    expect(status.isNearLimit).toBe(false);
    expect(status.resetsIn).toBe(RATE_LIMIT_CONFIG.WINDOW_MS);
  });

  it("deducts credits for recorded requests", () => {
    bed24RateLimiter.recordRequest("custom", 30);
    expect(bed24RateLimiter.getRemainingCredits()).toBe(70);
    expect(bed24RateLimiter.getStatus().requests).toHaveLength(1);
  });

  it("applies the known operation cost table with a multiplier", () => {
    bed24RateLimiter.recordKnownOperation("AVAILABILITY_PUSH_PER_ROOM", 3);
    expect(bed24RateLimiter.getRemainingCredits()).toBe(
      RATE_LIMIT_CONFIG.MAX_CREDITS - OPERATION_COSTS.AVAILABILITY_PUSH_PER_ROOM * 3
    );
  });

  it("defaults the multiplier to 1", () => {
    bed24RateLimiter.recordKnownOperation("BOOKING_FETCH");
    expect(bed24RateLimiter.getRemainingCredits()).toBe(
      RATE_LIMIT_CONFIG.MAX_CREDITS - OPERATION_COSTS.BOOKING_FETCH
    );
  });

  it("returns a defensive copy of the request list", () => {
    bed24RateLimiter.recordRequest("custom", 1);
    const status = bed24RateLimiter.getStatus();
    status.requests.push({ timestamp: 0, cost: 999, operation: "spoof" });
    expect(bed24RateLimiter.getStatus().requests).toHaveLength(1);
  });
});

describe("limit enforcement", () => {
  it("reports whether an operation fits in the remaining budget", () => {
    bed24RateLimiter.recordRequest("bulk", 98);
    expect(bed24RateLimiter.canProceed(2)).toBe(true);
    expect(bed24RateLimiter.canProceed(3)).toBe(false);
    expect(canPerformOperation("TOKEN_REFRESH")).toBe(true);
    expect(canPerformOperation("AVAILABILITY_PUSH_PER_ROOM")).toBe(false);
  });

  it("throws when a request would exceed the limit", () => {
    bed24RateLimiter.recordRequest("bulk", 100);
    expect(() => bed24RateLimiter.recordRequest("extra", 1)).toThrow(/rate limit exceeded/i);
    expect(bed24RateLimiter.getRemainingCredits()).toBe(0);
  });

  it("flags the near-limit warning threshold", () => {
    bed24RateLimiter.recordRequest("bulk", RATE_LIMIT_CONFIG.WARNING_THRESHOLD - 1);
    expect(bed24RateLimiter.getStatus().isNearLimit).toBe(false);
    bed24RateLimiter.recordRequest("one-more", 1);
    expect(bed24RateLimiter.getStatus().isNearLimit).toBe(true);
  });
});

describe("rolling window", () => {
  it("frees credits once requests fall outside the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    bed24RateLimiter.recordRequest("old", 100);
    expect(bed24RateLimiter.getRemainingCredits()).toBe(0);

    vi.advanceTimersByTime(RATE_LIMIT_CONFIG.WINDOW_MS + 1);
    expect(bed24RateLimiter.getRemainingCredits()).toBe(RATE_LIMIT_CONFIG.MAX_CREDITS);
    expect(bed24RateLimiter.getStatus().requests).toEqual([]);
  });

  it("counts down resetsIn based on the oldest request", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    bed24RateLimiter.recordRequest("first", 5);
    vi.advanceTimersByTime(60_000);
    expect(bed24RateLimiter.getStatus().resetsIn).toBe(RATE_LIMIT_CONFIG.WINDOW_MS - 60_000);
  });
});

describe("waitForCredits", () => {
  it("resolves immediately when credits are available", async () => {
    await expect(bed24RateLimiter.waitForCredits(10)).resolves.toBeUndefined();
  });

  it("times out when credits never free up", async () => {
    bed24RateLimiter.recordRequest("bulk", 100);
    vi.useFakeTimers();
    const pending = bed24RateLimiter.waitForCredits(50, 2_000);
    const assertion = expect(pending).rejects.toThrow(/Timeout waiting for rate limit credits/);
    await vi.advanceTimersByTimeAsync(3_000);
    await assertion;
  });
});

describe("getRateLimitSummary", () => {
  it("returns an OK summary below the warning threshold", () => {
    expect(getRateLimitSummary()).toContain("Rate limit OK");
  });

  it("returns a warning summary at the threshold", () => {
    bed24RateLimiter.recordRequest("bulk", RATE_LIMIT_CONFIG.WARNING_THRESHOLD);
    const summary = getRateLimitSummary();
    expect(summary).toContain("Rate limit warning");
    expect(summary).toContain("20/100");
  });
});
