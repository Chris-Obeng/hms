import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { getNightAuditData } from "./actions";
import { NightAuditClient } from "./night-audit-client";
import { Moon } from "lucide-react";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function NightAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { orgId, userId } = await auth();
  if (!orgId) return <NoAccessState />;

  const supabase = await createClient();
  const params = await searchParams;

  const [summary, staffResult] = await Promise.all([
    getNightAuditData(DATE_RE.test(params.date ?? "") ? params.date : undefined),
    userId
      ? supabase
          .from("staff_profiles")
          .select("role")
          .eq("clerk_user_id", userId)
          .eq("clerk_org_id", orgId)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const role = (staffResult.data?.role as string | null) ?? null;
  const canRunAudit = role === "manager" || role === "super_admin";

  return (
    <NightAuditClient initialSummary={summary} canRunAudit={canRunAudit} />
  );
}

function NoAccessState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Moon className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-section text-foreground">Night Audit</h2>
      <p className="text-body text-muted-foreground mt-1 max-w-sm">
        Please sign in to access Night Audit &amp; Daily Reconciliation.
      </p>
    </div>
  );
}
