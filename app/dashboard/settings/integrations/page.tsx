import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { IntegrationsClient } from "./integrations-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations · HotelOS" };

export default async function IntegrationsPage() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) redirect("/sign-in");

  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  if (staff?.role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-6">
        <p className="text-sm font-medium">Super Admin only</p>
        <p className="text-xs text-muted-foreground mt-1">Only the hotel Super Admin can manage integrations.</p>
      </div>
    );
  }

  const { data: hotel } = await supabase
    .from("hotels")
    .select("beds24_property_id, beds24_api_key, arkesel_api_key, arkesel_sender_name, paystack_subaccount_code")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) redirect("/dashboard");

  return (
    <IntegrationsClient
      initialData={{
        beds24PropertyId: hotel.beds24_property_id ?? "",
        beds24ApiKey: hotel.beds24_api_key ?? "",
        arkeselApiKey: hotel.arkesel_api_key ?? "",
        arkeselSenderName: hotel.arkesel_sender_name ?? "",
        paystackSubaccountCode: hotel.paystack_subaccount_code ?? null,
      }}
    />
  );
}
