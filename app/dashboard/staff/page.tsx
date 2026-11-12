import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { asStaffRole } from "@/lib/roles";
import { Users } from "lucide-react";
import { StaffClient } from "./staff-client";
export default async function StaffPage() {
  const { orgId, userId } = await auth();

  if (!orgId || !userId) {
    return <NoAccessState />;
  }

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) {
    return <NoAccessState />;
  }

  // Get current user role
  const { data: currentUser } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  // Fetch all staff for this hotel
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select(
      "id, clerk_user_id, email, full_name, avatar_url, role, is_active, granted_at, last_login_at, created_at"
    )
    .eq("clerk_org_id", orgId)
    .order("created_at", { ascending: true });

  // Count pending
  const pendingCount =
    staff?.filter((s) => s.role === "pending" && !s.is_active).length || 0;

  const staffList = (staff || []).map((s) => ({
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

  // Last-login comes from Clerk's lastSignInAt (Unix ms), not the DB column.
  // Best-effort: on any Clerk failure, rows fall back to null → "Never".
  const clerkUserIds = staffList.map((s) => s.clerkUserId).filter(Boolean);
  const lastSignInById = new Map<string, number>();
  try {
    const client = await clerkClient();
    for (let i = 0; i < clerkUserIds.length; i += 100) {
      const chunk = clerkUserIds.slice(i, i + 100);
      const { data: users } = await client.users.getUserList({ userId: chunk, limit: chunk.length });
      for (const u of users) if (u.lastSignInAt) lastSignInById.set(u.id, u.lastSignInAt);
    }
  } catch (err) {
    console.error("[staff] clerk last-login fetch failed:", err);
  }

  const enrichedStaff = staffList.map((s) => ({
    ...s,
    lastLoginAt: lastSignInById.has(s.clerkUserId)
      ? new Date(lastSignInById.get(s.clerkUserId)!).toISOString()
      : null,
  }));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 pt-1 md:space-y-5">
      <StaffClient
        data={enrichedStaff}
        pendingCount={pendingCount}
        currentUserId={userId}
        currentUserRole={asStaffRole(currentUser?.role)}
      />
    </div>
  );
}

function NoAccessState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Users className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        You do not have permission to manage staff.
      </p>
    </div>
  );
}
