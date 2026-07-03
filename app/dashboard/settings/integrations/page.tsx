import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { IntegrationsClient } from "./integrations-client";
import { getLastSyncTime } from "@/app/actions/integrations";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) redirect("/sign-in");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("name, beds24_property_id, beds24_api_key, paystack_subaccount_code, settings")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) redirect("/dashboard");

  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  if (staff?.role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <p className="text-sm text-muted-foreground">Super Admin access required.</p>
      </div>
    );
  }

  const settings = (hotel.settings as Record<string, unknown>) ?? {};
  const syncResult = await getLastSyncTime();

  return (
    <IntegrationsClient
      initialData={{
        beds24PropertyId: hotel.beds24_property_id ?? "",
        beds24ApiKey: hotel.beds24_api_key ?? "",
        paystackSubaccountCode: hotel.paystack_subaccount_code ?? null,
        lastSyncAt: syncResult.lastSync ?? null,
        notificationsEnabled: settings.sms_notifications_enabled !== false,
      }}
      staffPhone={null}
      hotelName={hotel.name}
    />
  );
}
