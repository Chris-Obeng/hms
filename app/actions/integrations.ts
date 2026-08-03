"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  return { supabase, hotel, staffRole: staff?.role ?? null };
}

async function requireAdminRole() {
  const result = await getHotelScopedClient();

  if (result.staffRole !== "super_admin" && result.staffRole !== "manager") {
    throw new Error("Admin access required.");
  }

  return result;
}

// ── Read-only status queries ──────────────────────────────────────

/**
 * Get integration status overview for the hotel.
 * READ-ONLY — available to all authenticated hotel staff.
 */
export async function getIntegrationStatus() {
  try {
    const { hotel } = await getHotelScopedClient();
    const settings = (hotel.settings as Record<string, unknown>) ?? {};

    return {
      success: true as const,
      data: {
        paystackSubaccountCode: hotel.paystack_subaccount_code ?? null,
        notificationsEnabled: settings.sms_notifications_enabled !== false,
      },
    };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Notification toggle ───────────────────────────────────────────

/**
 * Toggle hotel guest notifications (SMS/Email).
 * Admin and super_admin only.
 */
export async function toggleHotelNotifications(enabled: boolean) {
  try {
    const { supabase, hotel } = await requireAdminRole();

    const existing = (hotel as { settings?: Record<string, unknown> }).settings ?? {};

    await supabase
      .from("hotels")
      .update({ settings: { ...existing, sms_notifications_enabled: enabled } })
      .eq("id", hotel.id);

    revalidatePath("/dashboard/settings/notifications");

    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}
