"use server";

import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { can, canAssignRole } from "@/lib/roles";
import { headers } from "next/headers";
import crypto from "crypto";

export async function createShareableInvite(
  role: "super_admin" | "manager" | "front_desk" | "read_only"
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    const { orgId, userId } = await auth();
    if (!orgId || !userId) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify current user is an active super_admin of this hotel
    const { data: currentUser, error: userError } = await supabaseAdmin
      .from("staff_profiles")
      .select("id, role, is_active")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .single();

    if (userError || !currentUser || !currentUser.is_active || !can(currentUser.role, "staff:invite")) {
      return { success: false, error: "You do not have permission to invite staff" };
    }
    if (!canAssignRole(currentUser.role, role)) {
      return { success: false, error: "You cannot invite a staff member with that role" };
    }

    // Generate secure random token
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // Expires in 48 hours

    // Insert invitation
    const { error: insertError } = await supabaseAdmin
      .from("staff_invitations")
      .insert({
        clerk_org_id: orgId,
        role,
        token,
        expires_at: expiresAt.toISOString(),
        invited_by_staff_id: currentUser.id,
      });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const protocol = headersList.get("x-forwarded-proto") ?? "http";
    const url = `${protocol}://${host}/join?token=${token}`;

    return { success: true, url };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to create invitation" };
  }
}

/** Why an invite link cannot be used. The invite page has one screen per reason. */
export type InviteProblem = "not_found" | "used" | "expired" | "unavailable";

export type ValidInvite = {
  success: true;
  hotelName: string;
  role: string;
  clerkOrgId: string;
  /** Full name of the staff member who sent it; null for older invites. */
  inviterName: string | null;
  expiresAt: string;
};

export async function validateInviteToken(
  token: string
): Promise<
  | ValidInvite
  | { success: false; reason: InviteProblem; error: string; hotelName?: string; clerkOrgId?: string }
> {
  try {
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("staff_invitations")
      .select("clerk_org_id, role, is_used, expires_at, invited_by_staff_id")
      .eq("token", token)
      .maybeSingle();

    if (inviteError) {
      return { success: false, reason: "unavailable", error: "Failed to look up invitation" };
    }
    if (!invite) {
      return { success: false, reason: "not_found", error: "Invitation not found or invalid" };
    }

    // The inviter's name is a nicety; the hotel is required.
    const [{ data: hotel, error: hotelError }, { data: inviter }] = await Promise.all([
      supabaseAdmin.from("hotels").select("name").eq("clerk_org_id", invite.clerk_org_id).maybeSingle(),
      invite.invited_by_staff_id
        ? supabaseAdmin
            .from("staff_profiles")
            .select("full_name")
            .eq("id", invite.invited_by_staff_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (hotelError) {
      return { success: false, reason: "unavailable", error: "Failed to look up the hotel" };
    }

    if (invite.is_used) {
      return {
        success: false,
        reason: "used",
        error: "Invitation link has already been used",
        hotelName: hotel?.name,
        clerkOrgId: invite.clerk_org_id,
      };
    }

    if (new Date(invite.expires_at) < new Date()) {
      return {
        success: false,
        reason: "expired",
        error: "Invitation link has expired",
        hotelName: hotel?.name,
      };
    }

    if (!hotel) {
      return { success: false, reason: "not_found", error: "Hotel not found" };
    }

    return {
      success: true,
      hotelName: hotel.name,
      role: invite.role,
      clerkOrgId: invite.clerk_org_id,
      inviterName: inviter?.full_name?.trim() || null,
      expiresAt: invite.expires_at,
    };
  } catch (err) {
    return {
      success: false,
      reason: "unavailable",
      error: err instanceof Error ? err.message : "Failed to validate invitation",
    };
  }
}
