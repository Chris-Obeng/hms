import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <ShieldCheck className="size-10 text-muted-foreground/30 mb-3" />
        <h2 className="text-sm font-semibold">Super Admin Only</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Only the hotel Super Admin can view the audit log.
        </p>
      </div>
    );
  }

  // First page of the trail — older pages stream in through the
  // fetchAuditLogEntries server action. The exact total feeds the header.
  const initialPage = await fetchAuditLogPage(hotel.id, { page: 1 });
  const total = initialPage.total;

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Mobile header — back row, title, two-line caption (per design) */}
      <div className="mb-4 lg:hidden">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/settings"
            className="tap-target -m-2 rounded-xl text-[13px] font-medium text-foreground"
          >
            <ChevronLeft className="size-[16px]" aria-hidden />
            Settings
          </Link>
          <span className="font-mono text-[11px] font-medium text-muted-foreground">
            {total} entries
          </span>
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-[-0.012em] text-foreground">
          Audit log
        </h1>
        <div className="mt-1 text-[11px] leading-[1.45] text-muted-foreground">
          <p>Append-only record of staff actions.</p>
          <p>Entries cannot be edited or removed.</p>
        </div>
      </div>

      {/* Desktop header — title block + mono count on the right (per design) */}
      <div className="hidden items-center justify-between lg:flex">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.012em] text-foreground">
            Audit log
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Append-only record of staff actions. Entries cannot be edited or removed.
          </p>
        </div>
        <span className="font-mono text-[13px] font-medium text-muted-foreground">
          {total} entries
        </span>
      </div>

      <div className="mt-6">
        <AuditLogClient initialRows={initialPage.rows} initialTotal={total} />
      </div>
    </div>
  );
}
