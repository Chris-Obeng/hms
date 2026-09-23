import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AuditLogClient } from "./audit-log-client";
import { SettingsSubHeader } from "../_components/settings-sub-header";
import { fetchAuditLogPage } from "@/lib/audit-feed";

export default async function AuditLogPage() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) redirect("/sign-in");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) redirect("/dashboard");

  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  if (!can(staff?.role, "audit:read")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <ShieldCheck className="size-10 text-muted-foreground/30 mb-3" />
        <h2 className="text-sm font-semibold">Super Admin Only</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Only the hotel Super Admin can view the audit log.
        </p>
      </div>
    );
  }

  // First day-window only — older days stream in on scroll via the
  // fetchAuditLogDays server action. The exact count feeds the subtitle.
  const [initialPage, countResult] = await Promise.all([
    fetchAuditLogPage(hotel.id, null),
    supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotel.id),
  ]);

  const total = countResult.count ?? 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <SettingsSubHeader
        icon="audit"
        title="Audit log"
        subtitle={`Append-only record of all staff actions — ${total.toLocaleString()} ${total === 1 ? "entry" : "entries"}`}
      />

      <AuditLogClient
        initialDays={initialPage.days}
        initialCursor={initialPage.nextCursor}
        initialHasMore={initialPage.hasMore}
      />
    </div>
  );
}
