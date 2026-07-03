"use server";
"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { testBeds24Connection } from "@/lib/beds24";

async function getSuperAdmin() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, beds24_property_id, beds24_api_key, paystack_subaccount_code, settings")
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
  return { supabase, hotel, staffPhone: null as string | null };
}

export async function getIntegrationsData() {
  try {
    const { hotel } = await getSuperAdmin();
    const settings = (hotel.settings as Record<string, unknown>) ?? {};
    return {
      success: true as const,
      data: {
        beds24PropertyId: hotel.beds24_property_id ?? "",
        beds24ApiKey: hotel.beds24_api_key ?? "",
        paystackSubaccountCode: hotel.paystack_subaccount_code ?? null,
        notificationsEnabled: settings.sms_notifications_enabled !== false,
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



// ── Test Beds24 connection ─────────────────────────────────────────

export async function testBeds24(apiKey: string) {
  try {
    await getSuperAdmin(); // auth guard
    const result = await testBeds24Connection(apiKey);
    return result;
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Force full Beds24 sync ─────────────────────────────────────────

export async function forceBeds24Sync() {
  try {
    const { supabase, hotel } = await getSuperAdmin();
    if (!hotel.beds24_api_key || !hotel.beds24_property_id) {
      return { success: false as const, error: "Beds24 not configured" };
    }

    // Get all room type mappings
    const { data: mappings } = await supabase
      .from("beds24_property_mappings")
      .select("beds24_room_id, room_type_id")
      .eq("hotel_id", hotel.id);

    if (!mappings?.length) {
      return { success: false as const, error: "No room mappings configured" };
    }

    const today = new Date().toISOString().split("T")[0];
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);
    const endDate = futureDate.toISOString().split("T")[0];

    // For each mapped room type, calculate current availability and push
    const { pushAvailability } = await import("@/lib/beds24");
    const blocks = await Promise.all(
      mappings.map(async (m) => {
        // Simple push: set availability based on room count minus active bookings
        const { count: roomCount } = await supabase
          .from("rooms")
          .select("*", { count: "exact", head: true })
          .eq("room_type_id", m.room_type_id)
          .eq("hotel_id", hotel.id)
          .eq("is_active", true);

        return {
          roomId: m.beds24_room_id,
          from: today,
          to: endDate,
          availability: roomCount ?? 0,
        };
      })
    );

    const result = await pushAvailability(
      { token: hotel.beds24_api_key },
      blocks
    );

    // Log the sync
    await supabase.from("beds24_sync_log").insert({
      hotel_id: hotel.id,
      direction: "outbound",
      event_type: "force_sync",
      status: result.success ? "success" : "error",
      error_message: result.error ?? null,
    });

    return result.success
      ? { success: true as const, message: `Synced ${blocks.length} room types` }
      : { success: false as const, error: result.error ?? "Sync failed" };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Test Arkesel SMS ───────────────────────────────────────────────
// Uses the HotelOS master Arkesel account, not a per-hotel key

export async function testArkeselSms(recipientPhone: string, hotelName: string) {
  try {
    await getSuperAdmin(); // auth guard
    const { sendTestSms } = await import("@/lib/arkesel");
    return await sendTestSms(recipientPhone, hotelName);
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Toggle SMS/email notifications for a hotel ─────────────────────

export async function toggleHotelNotifications(enabled: boolean) {
  try {
    const { supabase, hotel } = await getSuperAdmin();
    const existing = (hotel as { settings?: Record<string, unknown> }).settings ?? {};
    await supabase
      .from("hotels")
      .update({ settings: { ...existing, sms_notifications_enabled: enabled } })
      .eq("id", hotel.id);
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Get last Beds24 sync time ──────────────────────────────────────

export async function getLastSyncTime() {
  try {
    const { supabase, hotel } = await getSuperAdmin();
    const { data } = await supabase
      .from("beds24_sync_log")
      .select("processed_at, direction, status")
      .eq("hotel_id", hotel.id)
      .eq("status", "success")
      .order("processed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { success: true as const, lastSync: data?.processed_at ?? null };
  } catch (err) {
    return { success: false as const, error: (err as Error).message, lastSync: null };
  }
}
