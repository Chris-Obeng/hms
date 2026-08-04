"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";

// ── Auth guard ────────────────────────────────────────────────────

async function getHotelScopedClient() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, paystack_subaccount_code, settings")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) throw new Error("Hotel not found");

  return { hotel };
}

// ── Read-only status queries ──────────────────────────────────────

/**
 * Get integration status overview for the hotel.
 * READ-ONLY — available to all authenticated hotel staff.
 */
export async function getIntegrationStatus() {
  try {
    const { hotel } = await getHotelScopedClient();
    return {
      success: true as const,
      data: {
        paystackSubaccountCode: hotel.paystack_subaccount_code ?? null,
      },
    };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}
