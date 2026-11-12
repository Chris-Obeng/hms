"use server";

import { createClient } from "@/lib/supabase/server";
import { requireMinRole } from "@/lib/auth";
import { isUsableSubaccount } from "@/lib/paystack";

// ── Read-only status queries ──────────────────────────────────────

/**
 * Get integration status overview for the hotel.
 * READ-ONLY — available to active non-pending hotel staff (`read_only+`).
 */
export async function getIntegrationStatus() {
  try {
    const ctx = await requireMinRole("read_only", "view integration status");
    const supabase = await createClient();

    const { data: hotel } = await supabase
      .from("hotels")
      .select("id, paystack_subaccount_code, paystack_domain, settings")
      .eq("id", ctx.hotelId)
      .eq("clerk_org_id", ctx.orgId)
      .single();

    if (!hotel) throw new Error("Hotel not found");

    return {
      success: true as const,
      data: {
        paystackSubaccountCode: isUsableSubaccount(hotel)
          ? hotel.paystack_subaccount_code
          : null,
      },
    };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}
