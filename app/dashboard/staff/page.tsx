import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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

  const isSuperAdmin = can(currentUser?.role, "staff:manage");

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-page-title text-foreground">
            Staff
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {staffList.length} team member{staffList.length !== 1 ? "s" : ""}{" "}
            · Manage roles and access
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Link href="/dashboard/staff/pending">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-sm rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  {pendingCount} Pending
                </span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      <StaffClient data={staffList} currentUserId={userId} isSuperAdmin={isSuperAdmin} />
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
