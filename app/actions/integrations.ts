"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { testBeds24Connection, getMasterToken, isBeds24Configured } from "@/lib/beds24";

// ── Auth guard ────────────────────────────────────────────────────

/**
 * Get hotel-scoped Supabase client with role verification.
 * This ensures only authenticated staff with proper roles can access integrations data.
 * 
 * @returns Supabase client, hotel ID, and staff role
 * @throws Error if not authenticated or no hotel found
 */
async function getHotelScopedClient() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) throw new Error("Not authenticated");
  
  const supabase = await createClient();
  
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, beds24_property_id, paystack_subaccount_code, settings")
    .eq("clerk_org_id", orgId)
    .single();
    
  if (!hotel) throw new Error("Hotel not found");
  
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();
    
  return { supabase, hotel, staffRole: staff?.role ?? null };
}

/**
 * Verify that the current user has admin or super_admin role.
 * Hotel staff cannot access integration management - only read status.
 * 
 * @throws Error if user is not admin or super_admin
 */
async function requireAdminRole() {
  const { staffRole } = await getHotelScopedClient();
  
  if (staffRole !== "super_admin" && staffRole !== "admin") {
    throw new Error("Admin access required. Integration configuration is managed by platform administrators.");
  }
  
  return await getHotelScopedClient();
}

// ── Read-only status queries (available to all authenticated hotel staff) ─────

/**
 * Get integration status overview for the hotel.
 * This is a READ-ONLY operation available to all hotel staff.
 */
export async function getIntegrationStatus() {
  try {
    const { hotel } = await getHotelScopedClient();
    const settings = (hotel.settings as Record<string, unknown>) ?? {};
    
    return {
      success: true as const,
      data: {
        beds24PropertyId: hotel.beds24_property_id ?? "",
        beds24Configured: !!hotel.beds24_property_id && isBeds24Configured(),
        paystackSubaccountCode: hotel.paystack_subaccount_code ?? null,
        notificationsEnabled: settings.sms_notifications_enabled !== false,
      },
    };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

/**
 * Get last successful sync time for the hotel.
 * READ-ONLY operation available to all hotel staff.
 */
export async function getLastSyncTime() {
  try {
    const { supabase, hotel } = await getHotelScopedClient();
    
    const { data } = await supabase
      .from("beds24_sync_log")
      .select("processed_at")
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

/**
 * Get integration health metrics for the hotel.
 * READ-ONLY operation available to all hotel staff.
 */
export async function getIntegrationHealth() {
  try {
    const { supabase, hotel } = await getHotelScopedClient();
    
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const [totalRes, successRes, errorRes] = await Promise.all([
      supabase
        .from("beds24_sync_log")
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotel.id)
        .gte("processed_at", cutoff24h),
      supabase
        .from("beds24_sync_log")
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotel.id)
        .eq("status", "success")
        .gte("processed_at", cutoff24h),
      supabase
        .from("beds24_sync_log")
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotel.id)
        .eq("status", "error")
        .gte("processed_at", cutoff24h),
    ]);
    
    const total = totalRes.count ?? 0;
    const success = successRes.count ?? 0;
    const errors = errorRes.count ?? 0;
    const successRate = total > 0 ? Math.round((success / total) * 100) : 100;
    
    return {
      success: true as const,
      health: {
        total,
        success,
        errors,
        successRate,
        status: errors > 0 ? ("warning" as const) : ("healthy" as const),
      },
    };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Technical operations (RESTRICTED to platform admins only) ─────────────────

/**
 * Save Bed24 configuration for the hotel.
 * 
 * ⚠️ DEPRECATED: This operation is now restricted to platform admins only.
 * Hotel staff should contact platform support to configure integrations.
 * 
 * @deprecated Use platform admin dashboard at /platform/dashboard/integrations
 */
export async function saveBeds24Config(propertyId: string) {
  try {
    // This is now a platform-admin-only operation
    // Hotel staff should not have access to this
    throw new Error(
      "Integration configuration is managed by platform administrators. " +
      "Please contact support at support@hotelosprp.com to update your Bed24 configuration."
    );
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

/**
 * Test Bed24 connection.
 * 
 * ⚠️ DEPRECATED: This operation is now restricted to platform admins only.
 * 
 * @deprecated Use platform admin dashboard at /platform/dashboard/integrations
 */
export async function testBeds24() {
  try {
    throw new Error(
      "Connection testing is managed by platform administrators. " +
      "Please contact support if you're experiencing integration issues."
    );
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

/**
 * Force full Bed24 availability sync.
 * 
 * ⚠️ DEPRECATED: This operation is now restricted to platform admins only.
 * 
 * @deprecated Use platform admin dashboard at /platform/dashboard/integrations
 */
export async function forceBeds24Sync() {
  try {
    throw new Error(
      "Manual sync operations are managed by platform administrators. " +
      "Automatic syncs occur every few hours. For immediate sync, contact support."
    );
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

/**
 * Test Arkesel SMS notification.
 * 
 * ⚠️ DEPRECATED: This operation is now restricted to platform admins only.
 * 
 * @deprecated Use platform admin dashboard
 */
export async function testArkeselSms(recipientPhone: string, hotelName: string) {
  try {
    throw new Error(
      "SMS testing is managed by platform administrators. " +
      "Please contact support to test notifications."
    );
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

/**
 * Toggle hotel guest notifications (SMS/Email).
 * This is allowed for hotel admins to control guest communications.
 */
export async function toggleHotelNotifications(enabled: boolean) {
  try {
    const { supabase, hotel } = await requireAdminRole();
    
    const existing = (hotel as { settings?: Record<string, unknown> }).settings ?? {};
    
    await supabase
      .from("hotels")
      .update({ settings: { ...existing, sms_notifications_enabled: enabled } })
      .eq("id", hotel.id);
      
    revalidatePath("/dashboard/settings/integrations");
    revalidatePath("/dashboard/settings/notifications");
    
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

/**
 * Get sync logs for the hotel.
 * 
 * ⚠️ RESTRICTED: Detailed sync logs are only available to platform admins.
 * Hotel staff can see summary status in the integrations page.
 * 
 * @deprecated Use platform admin dashboard for detailed logs
 */
export async function getSyncLogs(limit = 50) {
  try {
    throw new Error(
      "Detailed sync logs are only available to platform administrators. " +
      "View your integration status at /dashboard/settings/integrations"
    );
  } catch (err) {
    return { success: false as const, error: (err as Error).message, logs: [] };
  }
}

/**
 * Get room mappings for the hotel.
 * 
 * ⚠️ RESTRICTED: Room mappings are managed by platform admins only.
 * 
 * @deprecated Use platform admin dashboard
 */
export async function getRoomMappings() {
  try {
    throw new Error(
      "Room mappings are managed by platform administrators during onboarding. " +
      "Contact support to update your room channel mappings."
    );
  } catch (err) {
    return { success: false as const, error: (err as Error).message, mappings: [] };
  }
}

/**
 * Get channel statistics for the hotel.
 * 
 * ⚠️ RESTRICTED: Detailed statistics are only available to platform admins.
 * Use getIntegrationHealth() for hotel-level health metrics.
 * 
 * @deprecated Use platform admin dashboard
 */
export async function getChannelStats() {
  try {
    throw new Error(
      "Detailed channel statistics are only available to platform administrators. " +
      "View your integration health at /dashboard/settings/integrations"
    );
  } catch (err) {
    return {
      success: false as const,
      error: (err as Error).message,
      stats: null,
    };
  }
}

/**
 * Refresh Bed24 access token.
 * 
 * ⚠️ RESTRICTED: Token management is handled automatically by platform admins.
 * 
 * @deprecated Platform admins manage tokens
 */
export async function refreshBeds24Token() {
  try {
    throw new Error(
      "Token management is handled automatically by platform administrators. " +
      "No action required from hotel staff."
    );
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}
