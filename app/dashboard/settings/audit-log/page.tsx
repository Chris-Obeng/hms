import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { fetchAuditLogPage } from "@/lib/audit-feed";
import { AuditLogClient } from "./audit-log-client";

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
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Super admins only</h2>
      </div>
    );
  }

  // First page of the trail — older pages stream in through the
  // fetchAuditLogEntries server action. The exact total feeds the header.
  const initialPage = await fetchAuditLogPage(hotel.id, { page: 1 });
  const total = initialPage.total;

  return <AuditLogClient initialRows={initialPage.rows} initialTotal={total} />;
}
