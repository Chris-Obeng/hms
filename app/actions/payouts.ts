"use server";

import { createClient } from "@/lib/supabase/server";
import { requireMinRole } from "@/lib/auth";
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
    const ctx = await requireMinRole("read_only", "view payouts");
    if (ctx.hotel.status !== "active") return { success: false, error: "Active hotel access is required." };

    const supabase = await createClient();

    const { data: hotel, error: hotelError } = await supabase
      .from("hotels")
      .select("id, timezone, currency, paystack_subaccount_code, paystack_settlement_schedule, paystack_bank_code, paystack_account_number")
      .eq("id", ctx.hotelId)
      .eq("clerk_org_id", ctx.orgId)
      .single();
    if (hotelError || !hotel) return { success: false, error: "Hotel not found" };
    if (!hotel.timezone) return { success: false, error: "Payment payouts require a configured property timezone." };

    const data = await buildHotelPayoutOverview({
      hotelId: hotel.id,
      timeZone: hotel.timezone,
      subaccountCode: hotel.paystack_subaccount_code,
      settlementSchedule: hotel.paystack_settlement_schedule,
      payoutBankCode: hotel.paystack_bank_code,
      payoutAccountNumber: hotel.paystack_account_number,
      currency: hotel.currency ?? "GHS",
      supabase,
      window: range ?? { days: 30 },
    });

    return { success: true, data };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
