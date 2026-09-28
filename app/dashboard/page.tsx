import { auth } from "@clerk/nextjs/server";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/server";
import { qk } from "@/lib/query-keys";
import { businessToday } from "@/lib/business-date";
import { fetchDashboardData } from "@/lib/dashboard/fetch-dashboard-data";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardHomePage() {
  const { orgId, getToken } = await auth();
  const supabase = await createClient();

  if (!orgId) {
    return <NoHotelState />;
  }

  const { data: hotel, error: hotelError } = await supabase
    .from("hotels")
    .select("id, name, currency, logo_url, timezone")
    .eq("clerk_org_id", orgId)
    .limit(1)
    .maybeSingle();

  if (hotelError || !hotel) {
    return <NoHotelState />;
  }

  const timezone = hotel.timezone || "UTC";
  const dateStr = businessToday(timezone);

  // Prefetch today's board on the server so the client hydrates with data on
  // first paint — no skeleton, no client fetch waterfall. Failure is non-fatal.
  const queryClient = new QueryClient();
  // Prefetch only with a valid Supabase RLS token; without it the server client
  // is anon and would dehydrate an empty board the client won't refetch.
  const rlsToken = getToken ? await getToken({ template: "supabase" }).catch(() => null) : null;
  if (rlsToken) {
    await queryClient
      .prefetchQuery({
        queryKey: qk.dashboard(orgId, hotel.id, dateStr),
        queryFn: () => fetchDashboardData(supabase, hotel.id, dateStr, timezone),
      })
      .catch(() => {});
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient
        orgId={orgId}
        hotelId={hotel.id}
        hotelName={hotel.name}
        currency={hotel.currency || "GHS"}
        hotelTimezone={timezone}
        initialDate={dateStr}
      />
    </HydrationBoundary>
  );
}

function NoHotelState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <svg className="size-6 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-foreground">Hotel not found</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        No hotel is associated with this account. Please contact support.
      </p>
    </div>
  );
}
