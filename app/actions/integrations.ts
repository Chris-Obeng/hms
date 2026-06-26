"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getSuperAdmin() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, beds24_property_id, beds24_api_key, arkesel_api_key, arkesel_sender_name, paystack_subaccount_code")
    .eq("clerk_org_id", orgId)
    .single();
  if (!hotel) throw new Error("Hotel not found");
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();
  if (staff?.role !== "super_admin") throw new Error("Super Admin only");
  return { supabase, hotel };
}

export async function getIntegrationsData() {
  try {
    const { hotel } = await getSuperAdmin();
    return {
      success: true as const,
      data: {
        beds24PropertyId: hotel.beds24_property_id ?? "",
        beds24ApiKey: hotel.beds24_api_key ?? "",
        arkeselApiKey: hotel.arkesel_api_key ?? "",
        arkeselSenderName: hotel.arkesel_sender_name ?? "",
        paystackSubaccountCode: hotel.paystack_subaccount_code ?? null,
      },
    };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

export async function saveBeds24Config(propertyId: string, apiKey: string) {
  try {
    const { supabase, hotel } = await getSuperAdmin();
    await supabase
      .from("hotels")
      .update({ beds24_property_id: propertyId || null, beds24_api_key: apiKey || null })
      .eq("id", hotel.id);
    revalidatePath("/dashboard/settings/integrations");
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

export async function saveArkeselConfig(apiKey: string, senderName: string) {
  try {
    const { supabase, hotel } = await getSuperAdmin();
    await supabase
      .from("hotels")
      .update({ arkesel_api_key: apiKey || null, arkesel_sender_name: senderName || null })
      .eq("id", hotel.id);
    revalidatePath("/dashboard/settings/integrations");
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}
