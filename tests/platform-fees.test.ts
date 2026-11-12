import { describe, expect, it } from "vitest";
import {
  computePlatformFeeMinor,
  MAX_PLATFORM_FEE_PERCENT,
  MIN_PLATFORM_FEE_PERCENT,
  PAYSTACK_GHANA_FEE_BPS,
  ZERO_FEE,
} from "@/lib/platform/fees";

describe("computePlatformFeeMinor (BLK-02 split fee-bearer rules)", () => {
  it("returns 0 when platform fee is ZERO_FEE (0%)", () => {
    expect(computePlatformFeeMinor(ZERO_FEE, 100_000, "GHS")).toBe(0);
  });

  it("computes exact 4% split on GHS 1,000.00 (100,000p -> 4,000p RoomLine gross, 96,000p hotel net)", () => {
    const fee = computePlatformFeeMinor(
      {
        feeType: "percentage",
        feePercent: 4,
        feeFlatMinor: 0,
        feeFlatCurrency: "GHS",
      },
      100_000,
      "GHS"
    );
    expect(fee).toBe(4_000);
    // Verify Paystack's 1.95% fee (1,950p) fits comfortably inside RoomLine's 4,000p cut:
    const paystackFeeMinor = Math.ceil((100_000 * PAYSTACK_GHANA_FEE_BPS) / 10_000);
    expect(paystackFeeMinor).toBe(1_950);
    expect(fee).toBeGreaterThan(paystackFeeMinor);
    expect(fee - paystackFeeMinor).toBe(2_050); // RoomLine nets GHS 20.50
  });

  it("safely degrades to 0 when a flat or sub-threshold fee is smaller than Paystack's 1.95% charge", () => {
    // GHS 10.00 flat fee (1,000p) on a GHS 1,000.00 booking (100,000p, Paystack fee = 1,950p)
    // would fail Paystack initialize with 400 Bad Request under bearer: 'account'.
    expect(
      computePlatformFeeMinor(
        {
          feeType: "flat",
          feePercent: 0,
          feeFlatMinor: 1_000,
          feeFlatCurrency: "GHS",
        },
        100_000,
        "GHS"
      )
    ).toBe(0);

    // Defensive check even if an out-of-band DB edit stored 1.0%:
    expect(
      computePlatformFeeMinor(
        {
          feeType: "percentage",
          feePercent: 1,
          feeFlatMinor: 0,
          feeFlatCurrency: "GHS",
        },
        100_000,
        "GHS"
      )
    ).toBe(0);
  });

  it("keeps flat fee when it exceeds Paystack's 1.95% fee and caps at totalMinor - 100p", () => {
    // GHS 30.00 flat fee (3,000p) on GHS 1,000.00 (100,000p) -> 3,000p (> 1,950p)
    expect(
      computePlatformFeeMinor(
        {
          feeType: "flat",
          feePercent: 0,
          feeFlatMinor: 3_000,
          feeFlatCurrency: "GHS",
        },
        100_000,
        "GHS"
      )
    ).toBe(3_000);

    // Huge flat fee on GHS 50.00 (5,000p) -> capped at 4,900p so subaccount receives >= GHS 1.00 (100p)
    expect(
      computePlatformFeeMinor(
        {
          feeType: "flat",
          feePercent: 0,
          feeFlatMinor: 50_000,
          feeFlatCurrency: "GHS",
        },
        5_000,
        "GHS"
      )
    ).toBe(4_900);
  });

  it("returns 0 when flat fee currency mismatches charge currency", () => {
    expect(
      computePlatformFeeMinor(
        {
          feeType: "flat",
          feePercent: 0,
          feeFlatMinor: 5_000,
          feeFlatCurrency: "GHS",
        },
        100_000,
        "USD"
      )
    ).toBe(0);
  });

  it("exports locked-in guard constants", () => {
    expect(MIN_PLATFORM_FEE_PERCENT).toBe(2);
    expect(MAX_PLATFORM_FEE_PERCENT).toBe(95);
  });
});
