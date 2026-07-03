"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPlatformClient } from "@/lib/supabase/platform-server";
import { revalidatePath } from "next/cache";

/**
 * Platform admin actions — uses supabaseAdmin (service role) for cross-hotel access.
 * Auth is verified via Supabase Auth getClaims(), then checked against platform_admins table.
 */

async function assertPlatformAdmin() {
  const supabase = await createPlatformClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) throw new Error("Not authenticated");

  const { data: admin } = await supabaseAdmin
    .from("platform_admins")
    .select("id, role, is_active")
    .eq("supabase_user_id", data.claims.sub)
    .single();

  if (!admin || !admin.is_active) throw new Error("Platform admin access required");
  return { adminId: admin.id, role: admin.role };
}

// ── Hotel approval ──────────────────────────────────────────────

export async function approveHotel(
  hotelId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertPlatformAdmin();

    const { error } = await supabaseAdmin
      .from("hotels")
      .update({ status: "active" })
      .eq("id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/platform/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Hotel suspension ────────────────────────────────────────────

export async function suspendHotel(
  hotelId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertPlatformAdmin();

    const { error } = await supabaseAdmin
      .from("hotels")
      .update({ status: "suspended" })
      .eq("id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/platform/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Hotel reactivation ──────────────────────────────────────────

export async function reactivateHotel(
  hotelId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertPlatformAdmin();

    const { error } = await supabaseAdmin
      .from("hotels")
      .update({ status: "active" })
      .eq("id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/platform/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Change hotel plan ───────────────────────────────────────────

export async function changeHotelPlan(
  hotelId: string,
  plan: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { role } = await assertPlatformAdmin();
    if (role !== "super_admin" && role !== "admin") {
      return { success: false, error: "Insufficient permissions" };
    }

    const validPlans = ["starter", "growth", "professional"];
    if (!validPlans.includes(plan)) {
      return { success: false, error: "Invalid plan" };
    }

    const { error } = await supabaseAdmin
      .from("hotels")
      .update({ plan })
      .eq("id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/platform/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Get hotel detail for support view ──────────────────────────

export async function getHotelSupportView(hotelId: string) {
  try {
    await assertPlatformAdmin();

    const [hotelResult, bookingsResult] = await Promise.all([
      supabaseAdmin
        .from("hotels")
        .select("*")
        .eq("id", hotelId)
        .single(),
      supabaseAdmin
        .from("bookings")
        .select("id, reference, status, check_in, check_out, total_amount, created_at, guests(full_name)")
        .eq("hotel_id", hotelId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // staff_profiles uses clerk_org_id (not hotel_id) — get clerk_org_id from hotel first
    const clerkOrgId = hotelResult.data?.clerk_org_id ?? null;
    const { data: staffData } = clerkOrgId
      ? await supabaseAdmin
          .from("staff_profiles")
          .select("id, email, full_name, role, is_active, last_login_at")
          .eq("clerk_org_id", clerkOrgId)
          .order("created_at", { ascending: true })
      : { data: [] };

    return {
      success: true as const,
      hotel: hotelResult.data,
      recentBookings: bookingsResult.data ?? [],
      staff: staffData ?? [],
    };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}
