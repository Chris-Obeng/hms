/**
 * lib/platform/fees.ts
 *
 * Platform fee: the cut RoomLine takes from each online booking payment.
 *
 * Single global config stored in the `platform_settings` singleton (id = 1),
 * editable by platform admins. Realised per transaction as Paystack's
 * `transaction_charge` (a flat amount, in the charge currency's smallest unit,
 * routed to the main account) computed at initialize time. A zero fee omits
 * `transaction_charge` entirely, so the subaccount's own split is unchanged —
 * this is what keeps the pre-fee behaviour byte-for-byte.
 */

export type PlatformFeeType = "percentage" | "flat";

export interface PlatformFeeConfig {
  feeType: PlatformFeeType;
  /** Percentage of the booking total, 0–100. Used when feeType = 'percentage'. */
  feePercent: number;
  /** Flat fee in feeFlatCurrency's smallest unit. Used when feeType = 'flat'. */
  feeFlatMinor: number;
  /** ISO 4217 code the flat fee is denominated in. */
  feeFlatCurrency: string;
}

/** Paystack Ghana local processing fee in basis points (1.95% = 195 bps). */
export const PAYSTACK_GHANA_FEE_BPS = 195;

/**
 * Minimum non-zero percentage platform fee (2.0%).
 * RoomLine bears Paystack's 1.95% processing fee out of `transaction_charge`
 * (`bearer: "account"`), and Paystack rejects `POST /transaction/initialize`
 * with HTTP 400 whenever `transaction_charge` is smaller than its 1.95% fee.
 */
export const MIN_PLATFORM_FEE_PERCENT = 2;

/** Maximum percentage platform fee so the hotel subaccount always receives a positive share. */
export const MAX_PLATFORM_FEE_PERCENT = 95;

/** Minimum net subaccount share in minor units (GHS 1.00 = 100 pesewas). */
export const MIN_SUBACCOUNT_SHARE_MINOR = 100;

/** No cut. transaction_charge is omitted at initialize, so nothing changes. */
export const ZERO_FEE: PlatformFeeConfig = {
  feeType: "percentage",
  feePercent: 0,
  feeFlatMinor: 0,
  feeFlatCurrency: "GHS",
};

/**
 * Reads the current fee config. Falls back to ZERO_FEE when the row is missing
 * or unreadable — a booking must never be blocked because the fee lookup failed,
 * and a zero fee is the safe default (charge the guest, take no cut).
 */
export async function getPlatformFeeConfig(): Promise<PlatformFeeConfig> {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("fee_type, fee_percent, fee_flat_minor, fee_flat_currency")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) return ZERO_FEE;

  return {
    feeType: data.fee_type === "flat" ? "flat" : "percentage",
    feePercent: Number(data.fee_percent) || 0,
    feeFlatMinor: Number(data.fee_flat_minor) || 0,
    feeFlatCurrency: (data.fee_flat_currency || "GHS").toUpperCase(),
  };
}

/**
 * The platform fee for one charge, in the charge currency's smallest unit.
 *
 * - Percentage: round(totalMinor × pct / 100) — integer math, currency-agnostic.
 * - Flat: the configured amount, but only when it is denominated in the charge
 *   currency (a GHS flat fee against a USD charge is meaningless, so a mismatch
 *   yields no fee rather than a wrong one).
 * - Under `bearer: "account"`, Paystack rejects splits where `transaction_charge`
 *   is less than Paystack's 1.95% fee. Any computed non-zero fee below
 *   `ceil(totalMinor * 195 / 10_000) + 1` safely degrades to `0` (omitting both
 *   `transaction_charge` and `bearer` on that transaction) so guest checkout
 *   always succeeds.
 * - Capped at `totalMinor - 100` so the hotel subaccount always receives at
 *   least GHS 1.00 (`100` pesewas).
 */
export function computePlatformFeeMinor(
  config: PlatformFeeConfig,
  totalMinor: number,
  currency: string
): number {
  if (!Number.isFinite(totalMinor) || totalMinor <= 0) return 0;

  let fee: number;
  if (config.feeType === "flat") {
    if (config.feeFlatCurrency.toUpperCase() !== currency.toUpperCase()) return 0;
    fee = config.feeFlatMinor;
  } else {
    if (config.feePercent <= 0) return 0;
    fee = Math.round((totalMinor * config.feePercent) / 100);
  }

  if (!Number.isFinite(fee) || fee <= 0) return 0;

  const minViableFeeMinor = Math.ceil((totalMinor * PAYSTACK_GHANA_FEE_BPS) / 10_000) + 1;
  const maxViableFeeMinor = totalMinor - MIN_SUBACCOUNT_SHARE_MINOR;

  if (maxViableFeeMinor < minViableFeeMinor) return 0;
  if (fee < minViableFeeMinor) return 0;

  return Math.min(fee, maxViableFeeMinor);
}
