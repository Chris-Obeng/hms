"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Helpers ──────────────────────────────────────────────────────────

async function getHotelScopedClient() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) throw new Error("Hotel not found");

  // Get current user's role
  const { data: currentUser } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  const isSuperAdmin = currentUser?.role === "super_admin";
  return { supabase, hotelId: hotel.id, hotel, userId, isSuperAdmin };
}

// ── Types ────────────────────────────────────────────────────────────

export interface StaffMember {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  grantedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface PendingStaffRequest {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string | null;
}

// ── Get Staff List ───────────────────────────────────────────────────

export async function getStaffList(): Promise<
  | { success: true; data: StaffMember[] }
  | { success: false; error: string }
> {
  try {
    const { supabase, hotelId } = await getHotelScopedClient();

    const { data, error } = await supabase
      .from("staff_profiles")
      .select(
        "id, clerk_user_id, email, full_name, avatar_url, role, is_active, granted_at, last_login_at, created_at"
      )
      .eq("clerk_org_id", hotelId)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };

    const staff: StaffMember[] = (data || []).map((s) => ({
      id: s.id,
      clerkUserId: s.clerk_user_id,
      email: s.email,
      fullName: s.full_name,
      avatarUrl: s.avatar_url,
      role: s.role || "pending",
      isActive: s.is_active || false,
      grantedAt: s.granted_at,
      lastLoginAt: s.last_login_at,
      createdAt: s.created_at,
    }));

    return { success: true, data: staff };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch staff",
    };
  }
}

// ── Get Pending Staff Requests ───────────────────────────────────────

export async function getPendingStaff(): Promise<
  | { success: true; data: PendingStaffRequest[] }
  | { success: false; error: string }
> {
  try {
    const { supabase, hotelId } = await getHotelScopedClient();

    const { data, error } = await supabase
      .from("staff_profiles")
      .select(
        "id, clerk_user_id, email, full_name, avatar_url, role, created_at"
      )
      .eq("clerk_org_id", hotelId)
      .eq("role", "pending")
      .eq("is_active", false)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };

    const pending: PendingStaffRequest[] = (data || []).map((s) => ({
      id: s.id,
      clerkUserId: s.clerk_user_id,
      email: s.email,
      fullName: s.full_name,
      avatarUrl: s.avatar_url,
      role: s.role || "pending",
      createdAt: s.created_at,
    }));

    return { success: true, data: pending };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch pending staff",
    };
  }
}

// ── Approve Staff Member ─────────────────────────────────────────────

export async function approveStaff(
  staffId: string,
  role: "front_desk" | "manager" | "read_only"
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, hotelId, userId, isSuperAdmin } =
      await getHotelScopedClient();

    if (!isSuperAdmin) {
      return { success: false, error: "Only super admins can approve staff" };
    }

    const { error } = await supabase
      .from("staff_profiles")
      .update({
        role,
        is_active: true,
        granted_at: new Date().toISOString(),
        granted_by: userId,
      })
      .eq("id", staffId)
      .eq("clerk_org_id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/staff");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to approve staff",
    };
  }
}

// ── Reject Staff Member ──────────────────────────────────────────────

export async function rejectStaff(
  staffId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, hotelId, isSuperAdmin } =
      await getHotelScopedClient();

    if (!isSuperAdmin) {
      return { success: false, error: "Only super admins can reject staff" };
    }

    const { error } = await supabase
      .from("staff_profiles")
      .delete()
      .eq("id", staffId)
      .eq("clerk_org_id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/staff");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reject staff",
    };
  }
}

// ── Toggle Staff Active ──────────────────────────────────────────────

export async function toggleStaffActive(
  staffId: string,
  isActive: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, hotelId, isSuperAdmin } =
      await getHotelScopedClient();

    if (!isSuperAdmin) {
      return { success: false, error: "Only super admins can manage staff" };
    }

    const { error } = await supabase
      .from("staff_profiles")
      .update({ is_active: isActive })
      .eq("id", staffId)
      .eq("clerk_org_id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/staff");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update staff",
    };
  }
}

// ── Change Staff Role ────────────────────────────────────────────────

export async function changeStaffRole(
  staffId: string,
  role: "super_admin" | "manager" | "front_desk" | "read_only"
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, hotelId, isSuperAdmin } =
      await getHotelScopedClient();

    if (!isSuperAdmin) {
      return { success: false, error: "Only super admins can change roles" };
    }

    const { error } = await supabase
      .from("staff_profiles")
      .update({ role })
      .eq("id", staffId)
      .eq("clerk_org_id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/staff");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to change role",
    };
  }
}

// ── Get Pending Count ────────────────────────────────────────────────

export async function getPendingStaffCount(): Promise<number> {
  try {
    const { orgId } = await auth();
    if (!orgId) return 0;

    const supabase = await createClient();

    const { data: hotel } = await supabase
      .from("hotels")
      .select("id")
      .eq("clerk_org_id", orgId)
      .single();

    if (!hotel) return 0;

    const { count } = await supabase
      .from("staff_profiles")
      .select("*", { count: "exact", head: true })
      .eq("clerk_org_id", hotel.id)
      .eq("role", "pending")
      .eq("is_active", false);

    return count || 0;
  } catch {
    return 0;
  }
}
