"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { can, canAdministerStaff, canAssignRole } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";

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

  const { data: currentUser } = await supabase
    .from("staff_profiles")
    .select("id, role, full_name")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  const isSuperAdmin = can(currentUser?.role, "staff:manage");
  const currentStaffId = currentUser?.id ?? null;
  const currentStaffName = currentUser?.full_name ?? null;

  return { supabase, hotelId: hotel.id, hotel, orgId, userId, isSuperAdmin, role: currentUser?.role ?? null, currentStaffId, currentStaffName };
}

// ── Types ────────────────────────────────────────────────────────────

export interface PendingStaffRequest {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string | null;
}

// ── Get Pending Staff Requests ───────────────────────────────────────

export async function getPendingStaff(): Promise<
  | { success: true; data: PendingStaffRequest[] }
  | { success: false; error: string }
> {
  try {
    const { supabase, orgId } = await getHotelScopedClient();

    const { data, error } = await supabase
      .from("staff_profiles")
      .select("id, clerk_user_id, email, full_name, avatar_url, role, created_at")
      .eq("clerk_org_id", orgId)
      .eq("role", "pending")
      .eq("is_active", false)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data || []).map((s) => ({
        id: s.id,
        clerkUserId: s.clerk_user_id,
        email: s.email,
        fullName: s.full_name,
        avatarUrl: s.avatar_url,
        role: s.role || "pending",
        createdAt: s.created_at,
      })),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to fetch pending staff" };
  }
}

// ── Approve Staff Member ─────────────────────────────────────────────

export async function approveStaff(
  staffId: string,
  role: "front_desk" | "manager" | "read_only"
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, orgId, currentStaffId, currentStaffName, hotelId, isSuperAdmin } =
      await getHotelScopedClient();

    if (!isSuperAdmin) return { success: false, error: "Only super admins can approve staff" };

    // Fetch target staff before update for audit + notification
    const { data: target } = await supabase
      .from("staff_profiles")
      .select("clerk_user_id, full_name, email")
      .eq("id", staffId)
      .eq("clerk_org_id", orgId)
      .single();

    const { error } = await supabase
      .from("staff_profiles")
      .update({ role, is_active: true, granted_at: new Date().toISOString(), granted_by: currentStaffId })
      .eq("id", staffId)
      .eq("clerk_org_id", orgId);

    if (error) return { success: false, error: error.message };

    // Audit log
    await writeAuditLog(supabase, {
      hotelId,
      staffId: currentStaffId ?? undefined,
      staffName: currentStaffName,
      action: "staff.approved",
      entityType: "staff_profile",
      entityId: staffId,
      afterState: { role, is_active: true, staff_name: target?.full_name, staff_email: target?.email },
    });

    revalidatePath("/dashboard/staff");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to approve staff" };
  }
}

// ── Reject Staff Member ──────────────────────────────────────────────

export async function rejectStaff(
  staffId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, orgId, isSuperAdmin, hotelId, currentStaffId, currentStaffName } =
      await getHotelScopedClient();

    if (!isSuperAdmin) return { success: false, error: "Only super admins can reject staff" };

    const { data: target } = await supabase
      .from("staff_profiles")
      .select("full_name, email")
      .eq("id", staffId)
      .eq("clerk_org_id", orgId)
      .single();

    const { error } = await supabase
      .from("staff_profiles")
      .delete()
      .eq("id", staffId)
      .eq("clerk_org_id", orgId);

    if (error) return { success: false, error: error.message };

    await writeAuditLog(supabase, {
      hotelId,
      staffId: currentStaffId ?? undefined,
      staffName: currentStaffName,
      action: "staff.rejected",
      entityType: "staff_profile",
      entityId: staffId,
      beforeState: { staff_name: target?.full_name, staff_email: target?.email },
    });

    revalidatePath("/dashboard/staff");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to reject staff" };
  }
}

// ── Toggle Staff Active (with Clerk session revocation) ──────────────

export async function toggleStaffActive(
  staffId: string,
  isActive: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, orgId, role, currentStaffId, currentStaffName, hotelId } =
      await getHotelScopedClient();

    if (!can(role, "staff:setActive"))
      return { success: false, error: "You do not have permission to change staff status" };
    if (currentStaffId === staffId)
      return { success: false, error: "You cannot change your own status" };

    // Target role gates the manager check AND the last-admin check — load it up front.
    const { data: target } = await supabase
      .from("staff_profiles")
      .select("role, clerk_user_id, full_name")
      .eq("id", staffId)
      .eq("clerk_org_id", orgId)
      .single();
    if (!target) return { success: false, error: "Staff member not found" };
    if (!canAdministerStaff(role, target.role))
      return { success: false, error: "You cannot manage this staff member" };

    // Prevent deactivating the last active super admin, then revoke sessions.
    if (!isActive) {
      if (target.role === "super_admin") {
        const { count } = await supabase
          .from("staff_profiles")
          .select("*", { count: "exact", head: true })
          .eq("clerk_org_id", orgId)
          .eq("role", "super_admin")
          .eq("is_active", true);

        if ((count ?? 0) <= 1) {
          return { success: false, error: "Cannot deactivate the last active super admin" };
        }
      }

      // Revoke all active Clerk sessions for this user immediately
      if (target.clerk_user_id) {
        try {
          const clerk = await clerkClient();
          const sessions = await clerk.sessions.getSessionList({ userId: target.clerk_user_id, status: "active" });
          await Promise.all(
            sessions.data.map((s) => clerk.sessions.revokeSession(s.id))
          );
        } catch (clerkErr) {
          // Log but don't block — DB deactivation is the authoritative guard
          console.error("[clerk] session revocation failed:", clerkErr);
        }
      }
    }

    const { error } = await supabase
      .from("staff_profiles")
      .update({ is_active: isActive })
      .eq("id", staffId)
      .eq("clerk_org_id", orgId);

    if (error) return { success: false, error: error.message };

    await writeAuditLog(supabase, {
      hotelId,
      staffId: currentStaffId ?? undefined,
      staffName: currentStaffName,
      action: isActive ? "staff.reactivated" : "staff.deactivated",
      entityType: "staff_profile",
      entityId: staffId,
      afterState: { is_active: isActive },
    });

    revalidatePath("/dashboard/staff");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to update staff" };
  }
}

// ── Change Staff Role ────────────────────────────────────────────────

export async function changeStaffRole(
  staffId: string,
  newRole: "super_admin" | "manager" | "front_desk" | "read_only"
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, orgId, role, currentStaffId, currentStaffName, hotelId } =
      await getHotelScopedClient();

    if (!can(role, "staff:setRole"))
      return { success: false, error: "You do not have permission to change roles" };
    if (currentStaffId === staffId)
      return { success: false, error: "You cannot change your own role" };

    const { data: target } = await supabase
      .from("staff_profiles")
      .select("role")
      .eq("id", staffId)
      .eq("clerk_org_id", orgId)
      .single();
    if (!target) return { success: false, error: "Staff member not found" };
    if (!canAdministerStaff(role, target.role))
      return { success: false, error: "You cannot manage this staff member" };
    if (!canAssignRole(role, newRole))
      return { success: false, error: "You cannot assign that role" };

    // Prevent demoting the last active super admin
    if (newRole !== "super_admin" && target.role === "super_admin") {
      const { count } = await supabase
        .from("staff_profiles")
        .select("*", { count: "exact", head: true })
        .eq("clerk_org_id", orgId)
        .eq("role", "super_admin")
        .eq("is_active", true);

      if ((count ?? 0) <= 1) {
        return { success: false, error: "Cannot demote the last active super admin" };
      }
    }

    const { error } = await supabase
      .from("staff_profiles")
      .update({ role: newRole })
      .eq("id", staffId)
      .eq("clerk_org_id", orgId);

    if (error) return { success: false, error: error.message };

    await writeAuditLog(supabase, {
      hotelId,
      staffId: currentStaffId ?? undefined,
      staffName: currentStaffName,
      action: "staff.role_changed",
      entityType: "staff_profile",
      entityId: staffId,
      beforeState: { role: target.role },
      afterState: { role: newRole },
    });

    revalidatePath("/dashboard/staff");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to change role" };
  }
}

// ── Get Pending Count ────────────────────────────────────────────────

export async function getPendingStaffCount(): Promise<number> {
  try {
    const { orgId } = await auth();
    if (!orgId) return 0;
    const supabase = await createClient();
    const { count } = await supabase
      .from("staff_profiles")
      .select("*", { count: "exact", head: true })
      .eq("clerk_org_id", orgId)
      .eq("role", "pending")
      .eq("is_active", false);
    return count || 0;
  } catch {
    return 0;
  }
}
