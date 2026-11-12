import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { Users, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PendingStaffClient } from "./pending-client";

export default async function PendingStaffPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch {
    return <NoAccessState />;
  }

  const isSuperAdmin = can(ctx.role, "staff:manage");
  const supabase = await createClient();

  // Only load pending staff PII when caller is an active super_admin (`HIGH-08`).
  const { data: pending } = isSuperAdmin
    ? await supabase
        .from("staff_profiles")
        .select(
          "id, clerk_user_id, email, full_name, avatar_url, role, created_at"
        )
        .eq("clerk_org_id", ctx.orgId)
        .eq("role", "pending")
        .eq("is_active", false)
        .order("created_at", { ascending: true })
    : { data: [] };

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
    <div className="mx-auto w-full max-w-7xl space-y-5 pt-1">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/staff"
          aria-label="Back to staff"
          className="ui-press inline-flex size-11 items-center justify-center rounded-xl text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-9 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[24px]">
            Pending requests
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
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
