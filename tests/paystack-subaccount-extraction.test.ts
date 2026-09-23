import { describe, expect, it } from "vitest";
import { extractSubaccountCode } from "@/lib/paystack";

/**
 * Contract test for the settlement-identity extraction used by both the
 * Paystack webhook and the guest-facing verify route.
 *
 * Regression guard: the settle RPC enforces that the payload's subaccount
 * matches the booking's expected subaccount, and classifies a mismatch (or an
 * absent code) as a PERMANENT failure — money captured, booking unconfirmed,
 * no Paystack redelivery. Reading the wrong key here therefore breaks 100% of
 * online settlements silently. The realistic payload below mirrors what
 * Paystack sends for a subaccount-split charge.success.
 */
describe("extractSubaccountCode", () => {
  it("reads subaccount_code from a realistic charge.success payload", () => {
    // Shape mirrors Paystack's `data` object for a split transaction.
    const payload = {
      id: 5542139761,
      status: "success",
      reference: "RM-2026-TEST-0001",
      amount: 45000,
      currency: "GHS",
      channel: "card",
      paid_at: "2026-09-12T10:14:03.000Z",
      customer: { email: "guest@example.com" },
      subaccount: {
        id: 123456,
        subaccount_code: "ACCT_8f4s1eq7ml6rlzj",
        business_name: "Sunrise Hotel",
        currency: "GHS",
        percentage_charge: 2.5,
        is_active: true,
      },
      metadata: { booking_reference: "RM-2026-TEST-0001" },
    };

    expect(extractSubaccountCode(payload)).toBe("ACCT_8f4s1eq7ml6rlzj");
  });

  it("reads subaccount_code from a verify-response style object", () => {
    expect(
      extractSubaccountCode({ subaccount: { subaccount_code: "ACCT_verify_1" } })
    ).toBe("ACCT_verify_1");
  });

  it("returns null for the empty subaccount object Paystack sends on unsplit charges", () => {
    expect(extractSubaccountCode({ subaccount: {} })).toBeNull();
  });

  it("returns null when the subaccount key is absent or null", () => {
    expect(extractSubaccountCode({})).toBeNull();
    expect(extractSubaccountCode({ subaccount: null })).toBeNull();
  });

  it("returns null for non-string or blank codes", () => {
    expect(extractSubaccountCode({ subaccount: { subaccount_code: 42 } })).toBeNull();
    expect(extractSubaccountCode({ subaccount: { subaccount_code: "" } })).toBeNull();
    expect(extractSubaccountCode({ subaccount: { subaccount_code: "   " } })).toBeNull();
  });

  it("tolerates the legacy account_code key seen on some account configurations", () => {
    expect(
      extractSubaccountCode({ subaccount: { account_code: "ACCT_legacy_9" } })
    ).toBe("ACCT_legacy_9");
  });

  it("prefers subaccount_code when both keys are present", () => {
    expect(
      extractSubaccountCode({
        subaccount: {
          subaccount_code: "ACCT_canonical",
          account_code: "ACCT_legacy",
        },
      })
    ).toBe("ACCT_canonical");
  });
});
