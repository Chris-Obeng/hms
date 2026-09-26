"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { buildHotelPayoutOverview, type HotelPayoutOverview } from "@/lib/payouts";

/**
 * Payout overview for the caller's own hotel. Same authorization gate as the
 * payments settings page: an authenticated org member with `payments:configure`.
 * The hotel is resolved server-side from the Clerk org — never from the client —
 * and only that hotel's subaccount is ever queried. The optional date range is
 * validated and clamped inside buildHotelPayoutOverview (future dates rejected,
 * from<=to enforced, span capped) so a crafted range can't force a wide scan.
 */
export async function getMyHotelPayouts(
  range?: { from: string; to: string }
): Promise<{ success: true; data: HotelPayoutOverview } | { success: false; error: string }> {
  try {
    const { orgId, userId } = await auth();
    if (!orgId || !userId) return { success: false, error: "Not authenticated" };

    const supabase = await createClient();

    const { data: hotel } = await supabase
      .from("hotels")
      .select("id, currency, paystack_subaccount_code, paystack_settlement_schedule")
      .eq("clerk_org_id", orgId)
      .single();
    if (!hotel) return { success: false, error: "Hotel not found" };

    const { data: staff } = await supabase
      .from("staff_profiles")
      .select("role")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .single();
    if (!staff || !can(staff.role, "payments:configure")) {
      return { success: false, error: "Insufficient permissions" };
    }

    const data = await buildHotelPayoutOverview({
      hotelId: hotel.id,
      subaccountCode: hotel.paystack_subaccount_code,
      settlementSchedule: hotel.paystack_settlement_schedule,
      currency: hotel.currency ?? "GHS",
      supabase,
      window: range ?? { days: 30 },
    });

    return { success: true, data };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
