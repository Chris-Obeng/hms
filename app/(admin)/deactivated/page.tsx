import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { buttonVariants } from "@heroui/react";
import { Clock3, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AuthShell } from "@/components/brand/auth-shell";

export const dynamic = "force-dynamic";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@roomline.pro";

export default async function DeactivatedPage() {
  const { orgId, userId } = await auth();
  if (!userId || !orgId) {
    redirect("/sign-in");
  }

  const supabase = await createClient();

  // Hotel status via supabaseAdmin scoped strictly to orgId, because
  // deactivated/pending staff are excluded from get_user_hotel_ids().
  const [hotelResult, staffResult] = await Promise.all([
    supabaseAdmin.from("hotels").select("id, name, status").eq("clerk_org_id", orgId).single(),
    supabase
      .from("staff_profiles")
      .select("id, is_active, role")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .single(),
  ]);

  const hotel = hotelResult.data;
  const staff = staffResult.data;

  // Self-heal: active hotel and active, assigned staff go back to the dashboard.
  if (hotel && hotel.status === "active" && staff && staff.is_active && staff.role && staff.role !== "pending") {
    redirect("/dashboard");
  }

  if (hotel && (hotel.status === "suspended" || hotel.status === "cancelled")) {
    redirect("/suspended");
  }

  const hotelName = hotel?.name || "your property";
  const isHotelPending = hotel?.status === "pending";

  const copy = isHotelPending
    ? {
        icon: <Clock3 size={20} aria-hidden="true" />,
        title: `We're verifying ${hotelName}`,
        body: "Your workspace is set up. We check every new property before its booking page goes live, usually within a day.",
      }
    : {
        icon: <UserRound size={20} aria-hidden="true" />,
        title: "Your access is waiting for approval",
        body: `Your account at ${hotelName} isn't active yet. Ask your manager to approve you from the staff list, then sign in again.`,
      };

  return (
    <AuthShell width="status">
      <span className="rl-status-mark" data-tone="sun">
        {copy.icon}
      </span>
      <div className="rl-screen-head">
        <h1 className="rl-title">{copy.title}</h1>
        <p className="rl-sub">{copy.body}</p>
      </div>
      <div className="rl-screen-actions">
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Access for ${hotelName}`)}`}
          className={buttonVariants({ size: "lg" })}
        >
          Contact support
        </a>
        <SignOutButton redirectUrl="/sign-in">
          <button type="button" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Sign out
          </button>
        </SignOutButton>
      </div>
    </AuthShell>
  );
}
