"use server";

import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
      .select("role, is_active")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .single();

    if (userError || !currentUser || !currentUser.is_active || currentUser.role !== "super_admin") {
      return { success: false, error: "Only active super admins can invite staff" };
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

export async function validateInviteToken(
  token: string
): Promise<
  | { success: true; hotelName: string; role: string; clerkOrgId: string }
  | { success: false; error: string }
> {
  try {
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("staff_invitations")
      .select("*")
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      return { success: false, error: "Invitation not found or invalid" };
    }

    if (invite.is_used) {
      return { success: false, error: "Invitation link has already been used" };
    }

    if (new Date(invite.expires_at) < new Date()) {
      return { success: false, error: "Invitation link has expired" };
    }

    // Fetch hotel name
    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from("hotels")
      .select("name")
      .eq("clerk_org_id", invite.clerk_org_id)
      .single();

    if (hotelError || !hotel) {
      return { success: false, error: "Hotel not found" };
    }

    return {
      success: true,
      hotelName: hotel.name,
      role: invite.role,
      clerkOrgId: invite.clerk_org_id,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to validate invitation" };
  }
}
