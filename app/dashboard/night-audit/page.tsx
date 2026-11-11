import { requireMinRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getNightAuditData } from "./actions";
import { NightAuditClient } from "./night-audit-client";
import Link from "next/link";

export default async function NightAuditPage({ searchParams }: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await requireMinRole("read_only", "view Night Audit");
    const view = await getNightAuditData(params.date);
    data = { view, canRunAudit: can(ctx.role, "night_audit:run") };
  } catch (error) {
    return (
      <section className="card-default mx-auto max-w-3xl space-y-3 p-6" role="alert">
        <h1 className="text-page-title">Night audit unavailable</h1>
        <p className="text-body text-muted-foreground">{error instanceof Error ? error.message : "The business-date review could not be loaded."}</p>
        <p className="text-caption text-muted-foreground">No figures or successful close are assumed when a required read fails.</p>
        <Link className="inline-flex min-h-11 items-center font-medium underline" href="/dashboard/night-audit">Last completed property day</Link>
      </section>
    );
  }
  return <NightAuditClient key={data.view.summary.auditDate} initialSummary={data.view.summary}
    roomRevenueInclTax={data.view.roomRevenueInclTax} canRunAudit={data.canRunAudit} />;
}
