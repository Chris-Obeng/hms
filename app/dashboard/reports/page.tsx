import { AuthError, requireMinRole } from "@/lib/auth";
import { businessToday } from "@/lib/business-date";
import { createClient } from "@/lib/supabase/server";
import { ReportsClient } from "./reports-client";
import { shiftReportDate } from "./_components/report-utils";

export default async function ReportsPage() {
  let context;
  try { context = await requireMinRole("read_only", "view reports"); }
  catch (error) {
    if (!(error instanceof AuthError)) throw error;
    return <div className="space-y-2 py-12"><h1 className="text-page-title">Reports</h1><p>Sign in with an active hotel staff account to view reports.</p></div>;
  }

  const supabase = await createClient();
  const { data: hotel, error } = await supabase.from("hotels").select("timezone, status")
    .eq("id", context.hotelId).eq("clerk_org_id", context.orgId).single();
  if (error) throw new Error("Could not load reporting settings. Try again.");
  if (!hotel?.timezone || hotel.status !== "active") {
    return <div className="space-y-2 py-12"><h1 className="text-page-title">Reports</h1><p>Reports require an active property with a configured timezone. Ask your hotel administrator to check the property settings.</p></div>;
  }
  // A property date, never the browser or server's local calendar day.
  new Intl.DateTimeFormat("en", { timeZone: hotel.timezone }).format(new Date());
  const today = businessToday(hotel.timezone);
  return <ReportsClient orgId={context.orgId} hotelId={context.hotelId} timeZone={hotel.timezone} today={today}
    initialStartDate={shiftReportDate(today, -29)} initialEndDate={today} />;
}
