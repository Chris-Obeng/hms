import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { format, subDays } from "date-fns";
import { ReportsClient } from "./reports-client";
import { BarChart3 } from "lucide-react";
export default async function ReportsPage() {
  const { orgId } = await auth();
  if (!orgId) return <NoAccessState />;

  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, currency")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) return <NoAccessState />;

  const today = new Date();
  const initialEndDate = format(today, "yyyy-MM-dd");
  const initialStartDate = format(subDays(today, 29), "yyyy-MM-dd");

  return (
    <ReportsClient
      currency={hotel.currency ?? "GHS"}
      initialStartDate={initialStartDate}
      initialEndDate={initialEndDate}
    />
  );
}

function NoAccessState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <BarChart3 className="size-6 text-muted-foreground/30" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">No access</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Sign in to view reports.
      </p>
    </div>
  );
}
