import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { Users, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PendingStaffClient } from "./pending-client";
export default async function PendingStaffPage() {
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

  // Check if user is super admin
  const { data: currentUser } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  const isSuperAdmin = can(currentUser?.role, "staff:manage");

  // Fetch pending staff
  const { data: pending } = await supabase
    .from("staff_profiles")
    .select(
      "id, clerk_user_id, email, full_name, avatar_url, role, created_at"
    )
    .eq("clerk_org_id", hotel.id)
    .eq("role", "pending")
    .eq("is_active", false)
    .order("created_at", { ascending: true });

  const pendingList = (pending || []).map((s) => ({
    id: s.id,
    clerkUserId: s.clerk_user_id,
    email: s.email,
    fullName: s.full_name,
    avatarUrl: s.avatar_url,
    role: s.role || "pending",
    createdAt: s.created_at,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/staff"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
            Pending Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pendingList.length} staff member{pendingList.length !== 1 ? "s" : ""} awaiting approval
          </p>
        </div>
      </div>

      {!isSuperAdmin ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-6">
          <Users className="size-10 text-muted-foreground/30 mb-3" />
          <h2 className="text-sm font-semibold text-foreground">Super Admin Only</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Only Super Admin role can approve staff access requests.
          </p>
          <Link href="/dashboard/staff">
            <Button variant="outline" size="sm" className="mt-4 rounded-lg text-xs">
              Back to Staff
            </Button>
          </Link>
        </div>
      ) : (
        <PendingStaffClient data={pendingList} />
      )}
    </div>
  );
}

function NoAccessState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Users className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        You do not have permission to view this page.
      </p>
    </div>
  );
}
