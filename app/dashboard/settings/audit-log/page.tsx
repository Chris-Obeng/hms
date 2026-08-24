import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShieldCheck, FileClock } from "lucide-react";
import { AuditLogClient } from "./audit-log-client";
import { SettingsSubHeader } from "../_components/settings-sub-header";

export const dynamic = "force-dynamic";

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

  if (staff?.role !== "super_admin") {
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

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, staff_name, before_state, after_state, created_at")
    .eq("hotel_id", hotel.id)
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <div className="space-y-6 max-w-4xl">
      <SettingsSubHeader icon={FileClock} title="Audit log" subtitle={`Append-only record of all staff actions — ${logs?.length ?? 0} entries`} />

      <AuditLogClient logs={logs ?? []} />
    </div>
  );
}
