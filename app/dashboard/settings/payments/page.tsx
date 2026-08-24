import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PaymentsSettingsClient } from "./payments-client";
export const metadata = { title: "Payments · RoomLine" };

export default async function PaymentsSettingsPage() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) redirect("/sign-in");

  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  if (staff?.role !== "super_admin" && staff?.role !== "manager") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-6">
        <p className="text-sm font-medium text-foreground">Manager access required</p>
        <p className="text-xs text-muted-foreground mt-1">
          Only managers and super admins can manage payment settings.
        </p>
      </div>
    );
  }

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, email, paystack_subaccount_code, paystack_bank_code, paystack_account_number, paystack_business_name, paystack_settlement_schedule, settings, currency")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) redirect("/dashboard");

  const settings = (hotel.settings as Record<string, unknown>) ?? {};

  return (
    <PaymentsSettingsClient
      hotelName={hotel.name}
      initialData={{
        subaccountCode: hotel.paystack_subaccount_code,
        bankCode: hotel.paystack_bank_code,
        accountNumber: hotel.paystack_account_number,
        businessName: hotel.paystack_business_name ?? hotel.name,
        settlementSchedule: hotel.paystack_settlement_schedule ?? "auto",
        paymentPolicy: (settings.payment_policy as string) ?? "choice",
      }}
    />
  );
}
