import { auth } from "@clerk/nextjs/server";
import { getNightAuditData } from "./actions";
import { NightAuditClient } from "./night-audit-client";
import { Moon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NightAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) return <NoAccessState />;

  const params = await searchParams;
  const summary = await getNightAuditData(params.date);

  return <NightAuditClient initialSummary={summary} />;
}

function NoAccessState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Moon className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-section text-foreground">Night Audit</h2>
      <p className="text-body text-muted-foreground mt-1 max-w-sm">
        Please sign in to access Night Audit & Daily Reconciliation.
      </p>
    </div>
  );
}
