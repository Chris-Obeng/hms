import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { QueryClient, dehydrate, HydrationBoundary, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/server";
import { qk } from "@/lib/query-keys";
import { businessToday } from "@/lib/business-date";
import { fetchDashboardData } from "@/lib/dashboard/fetch-dashboard-data";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { CAPS } from "@/lib/cache/prefetch-helpers";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardHomePage() {
  const { orgId, getToken } = await auth();
  const supabase = await createClient();

  if (!orgId) {
    return <NoHotelState />;
  }

  const { data: hotel, error: hotelError } = await supabase
    .from("hotels")
    .select("id, currency, logo_url, timezone")
    .eq("clerk_org_id", orgId)
    .limit(1)
    .maybeSingle();

  if (hotelError || !hotel) {
    return <NoHotelState />;
  }

  const timezone = hotel.timezone || "UTC";
  const dateStr = businessToday(timezone);

  const rlsToken = getToken ? await getToken({ template: "supabase" }).catch(() => null) : null;
  if (rlsToken) {
    // Lightweight warm-ids query so detail prefetch does not need to block on full board aggregation
    const { data: warmRows } = await supabase
      .from("bookings")
      .select("id, check_in, status")
      .eq("hotel_id", hotel.id)
      .or(`check_in.eq.${dateStr},status.eq.checked_in`)
      .order("check_in", { ascending: true })
      .limit(CAPS.serverWarm);
    const warmIds = [...new Set((warmRows || []).map((r) => r.id))].slice(0, CAPS.serverWarm);
    return (
      <DashboardWarmBoundary
        orgId={orgId}
        hotelId={hotel.id}
        dateStr={dateStr}
        timezone={timezone}
        warmIds={warmIds}
      >
        <DashboardClient
          orgId={orgId}
          hotelId={hotel.id}
          currency={hotel.currency || "GHS"}
          hotelTimezone={timezone}
          initialDate={dateStr}
        />
      </DashboardWarmBoundary>
    );
  }

  return (
    <DashboardClient
      orgId={orgId}
      hotelId={hotel.id}
      currency={hotel.currency || "GHS"}
      hotelTimezone={timezone}
      initialDate={dateStr}
    />
  );
}

async function DashboardWarmBoundary({
  orgId,
  hotelId,
  dateStr,
  timezone,
  warmIds,
  children,
}: {
  orgId: string;
  hotelId: string;
  dateStr: string;
  timezone: string;
  warmIds: string[];
  children: React.ReactNode;
}) {
  const queryClient = new QueryClient();
  const supabase = await createClient();
  void queryClient
    .prefetchQuery({
      queryKey: qk.dashboard(orgId, hotelId, dateStr),
      queryFn: () => fetchDashboardData(supabase, hotelId, dateStr, timezone),
    })
    .catch(() => {});
  if (warmIds.length > 0) {
    void Promise.allSettled(
      warmIds.map((id) =>
        queryClient.prefetchQuery({
          ...bookingDetailCache.options(id),
          queryFn: bookingDetailCache.serverQueryFn(id),
        })
      )
    ).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 0));
  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) || q.state.status === "pending",
      })}
    >
      <Suspense fallback={children}>{children}</Suspense>
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
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">No hotel is associated with this account. Please contact support.</p>
    </div>
  );
}
