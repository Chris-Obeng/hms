export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSuspensionReason, type SuspensionReason } from "@/lib/platform/suspension";
import { SuspendedView } from "./suspended-view";

export const metadata: Metadata = {
  title: "Access paused",
  robots: { index: false, follow: false },
};

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@roomline.pro";

export default async function SuspendedPage() {
  const { orgId, userId } = await auth();

  if (!userId || !orgId) {
    redirect("/sign-in");
  }

  // Hotel status scoped strictly to the verified Clerk orgId.
  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, name, status")
    .eq("clerk_org_id", orgId)
    .single();

  // Self-heal: an active or pending hotel goes back through the dashboard gate.
  if (hotel && hotel.status !== "suspended" && hotel.status !== "cancelled") {
    redirect("/dashboard");
  }

  const [staffResult, ownerResult, reasonResult, user] = await Promise.all([
    supabaseAdmin
      .from("staff_profiles")
      .select("role")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .maybeSingle(),
    supabaseAdmin
      .from("staff_profiles")
      .select("full_name, email")
      .eq("clerk_org_id", orgId)
      .eq("role", "super_admin")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    hotel
      ? supabaseAdmin
          .from("platform_admin_audit_logs")
          .select("after_state")
          .eq("hotel_id", hotel.id)
          .eq("action", "hotel.suspend")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    currentUser(),
  ]);

  const afterState = reasonResult.data?.after_state as { reason?: unknown } | null | undefined;
  const reason: SuspensionReason | null = isSuspensionReason(afterState?.reason) ? afterState.reason : null;

  return (
    <SuspendedView
      hotelName={hotel?.name || "Your hotel"}
      status={hotel?.status === "cancelled" ? "cancelled" : "suspended"}
      isOwner={staffResult.data?.role === "super_admin"}
      reason={reason}
      owner={ownerResult.data ? { name: ownerResult.data.full_name, email: ownerResult.data.email } : null}
      supportEmail={SUPPORT_EMAIL}
      userEmail={user?.primaryEmailAddress?.emailAddress ?? null}
    />
  );
}
