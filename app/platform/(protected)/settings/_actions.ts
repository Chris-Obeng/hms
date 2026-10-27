"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toMinor } from "@/lib/money";
import { type PlatformFeeType } from "@/lib/platform/fees";
import { assertPlatformAdmin } from "../_guard";

/**
 * Platform admin server action — edit the per-transaction fee RoomLine charges
 * hotels. Delegates to update_platform_fee_atomic, which writes the singleton
 * public.platform_settings row (id = 1) and its audit row in one transaction, so
 * a fee change can never persist without its audit trail. Realised as Paystack
 * `transaction_charge` on the *next* payment; no Paystack round-trip here, no
 * change to any subaccount's percentage_charge.
 *
 * Auth mirrors the other platform actions: assertPlatformAdmin() then supabaseAdmin
 * (service role) — platform settings are not covered by tenant RLS.
 */

/** Sane upper bound on the flat fee (major units); settlement caps it to the charge. */
const MAX_FLAT_FEE_MAJOR = 1_000_000;

export interface PlatformFeeInput {
  feeType: PlatformFeeType;
  /** Percentage of the booking total, 0–100. Used when feeType = 'percentage'. */
  feePercent: number;
  /** Flat fee in MAJOR units (converted to minor server-side). Used when feeType = 'flat'. */
  feeFlatMajor: number;
  /** ISO 4217 code the flat fee is denominated in. */
  feeFlatCurrency: string;
}

export async function updatePlatformFeeSettings(
  input: PlatformFeeInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const { adminId, adminEmail } = await assertPlatformAdmin();

    // ── Validate — never trust client params ──
    if (input.feeType !== "percentage" && input.feeType !== "flat") {
      return { success: false, error: "Invalid fee type" };
    }

    // This version is sold in Ghana: the platform fee is always denominated in GHS.
    const currency = String(input.feeFlatCurrency ?? "GHS").toUpperCase();
    if (currency !== "GHS") {
      return { success: false, error: "The platform fee is charged in Ghana cedis only." };
    }

    if (!Number.isFinite(input.feePercent) || input.feePercent < 0 || input.feePercent > 100) {
      return { success: false, error: "Percentage must be between 0 and 100" };
    }
    if (
      !Number.isFinite(input.feeFlatMajor) ||
      input.feeFlatMajor < 0 ||
      input.feeFlatMajor > MAX_FLAT_FEE_MAJOR
    ) {
      return {
        success: false,
        error: `Flat fee must be between 0 and ${MAX_FLAT_FEE_MAJOR.toLocaleString()}`,
      };
    }

    // Round the percentage to the column's scale (numeric(5,2)) so the stored and
    // audited values never disagree by a hidden digit (the RPC rounds again).
    const feePercent = Math.round(input.feePercent * 100) / 100;
    const feeFlatMinor = toMinor(input.feeFlatMajor, currency);

    // One atomic RPC: capture before-state under lock, update the row, and write
    // the audit row in the same transaction — no swallowed audit failure, and no
    // zero-fee fallback poisoning the before-state.
    const { error } = await supabaseAdmin.rpc("update_platform_fee_atomic", {
      p_admin_id: adminId,
      p_admin_email: adminEmail,
      p_fee_type: input.feeType,
      p_fee_percent: feePercent,
      p_fee_flat_minor: feeFlatMinor,
      p_fee_flat_currency: currency,
    });

    if (error) {
      // Detail server-side only; the client sees a generic message.
      console.error("update_platform_fee_atomic failed:", error.message);
      return { success: false, error: "Could not update fee settings. Please try again." };
    }

    revalidatePath("/platform/settings");
    return { success: true };
  } catch (err) {
    // assertPlatformAdmin throws curated, safe auth messages; surface those.
    return { success: false, error: (err as Error).message };
  }
}
