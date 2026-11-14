import Link from "next/link";
import { Suspense } from "react";
import { addDays, format, parseISO } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { businessToday } from "@/lib/business-date";
import { CalendarClient } from "./calendar-client";
import { getCalendarData, getCurrentStaffRole } from "./actions";
import { PAST_LEAD_MAX_DAYS } from "./_components/calendar-helpers";
import { QueryClient, dehydrate, HydrationBoundary, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { CAPS } from "@/lib/cache/prefetch-helpers";
export const metadata = {
  title: "Calendar | Oriel",
};

export default async function CalendarPage() {
  const { orgId, getToken } = await auth();
  const supabase = await createClient();

  if (!orgId) {
    return <NoCalendarState />;
  }

  const { data: hotel } = await supabase.from("hotels").select("id, name, currency, logo_url, timezone").eq("clerk_org_id", orgId).single();

  if (!hotel) {
    return <NoCalendarState />;
  }

  // The seed covers every view the client can open around today (longest view
  // plus the past lead), so switching Week / 2 weeks / Month needs no request.
  const today = businessToday(hotel.timezone || "UTC");
  const seedStart = format(addDays(parseISO(today), -PAST_LEAD_MAX_DAYS), "yyyy-MM-dd");
  const seedDays = 30 + PAST_LEAD_MAX_DAYS;

  // Independent reads run together: the rack, the staff role and the RLS token.
  // The rack read is retried once: a large property's paged read fails when a
  // booking changes between pages, and a second read almost always succeeds.
  const readSeed = () =>
    getCalendarData(seedStart, seedDays).then((data) => ({ data, fetchedAt: Date.now() }));
  const [seedRead, { canEdit, canBlock, canUnblock }, rlsToken] = await Promise.all([
    readSeed()
      .catch(readSeed)
      .catch((error: unknown) => {
        console.error("[calendar] initial data load failed:", error);
        return null;
      }),
    getCurrentStaffRole(),
    getToken ? getToken({ template: "supabase" }).catch(() => null) : Promise.resolve(null),
  ]);

  if (!seedRead) {
    return <CalendarLoadErrorState />;
  }
  const initialData = seedRead.data;
  const seed = { startDate: seedStart, days: seedDays, fetchedAt: seedRead.fetchedAt };

  if (rlsToken && initialData.bookings.length > 0) {
    // Operational priority: confirmed/checked_in first, then by checkIn
    const sorted = [...initialData.bookings].sort((a, b) => {
      const rank = (s: string) => (s === "checked_in" ? 0 : s === "confirmed" ? 1 : 2);
      const d = rank(a.status) - rank(b.status);
      return d !== 0 ? d : a.checkIn.localeCompare(b.checkIn);
    });
    const warmIds = [...new Set(sorted.map((b) => b.id.replace(/:v\d+$/, "")))].slice(0, CAPS.serverWarm);
    return (
      <CalendarWarmBoundary warmIds={warmIds}>
        <div className="-mx-4 -mb-4 md:-mx-6 md:-mb-6 lg:-mx-8 lg:-mb-8 overflow-hidden">
          <CalendarClient
            initialData={initialData}
            seed={seed}
            hotelId={hotel.id}
            hotelName={hotel.name}
            currency={hotel.currency || "GHS"}
            hotelTimezone={hotel.timezone || "UTC"}
            canEdit={canEdit}
            canBlock={canBlock}
            canUnblock={canUnblock}
          />
        </div>
      </CalendarWarmBoundary>
    );
  }

  return (
    <div className="-mx-4 -mb-4 md:-mx-6 md:-mb-6 lg:-mx-8 lg:-mb-8 overflow-hidden">
      <CalendarClient
        initialData={initialData}
        seed={seed}
        hotelId={hotel.id}
        hotelName={hotel.name}
        currency={hotel.currency || "GHS"}
        hotelTimezone={hotel.timezone || "UTC"}
        canEdit={canEdit}
        canBlock={canBlock}
        canUnblock={canUnblock}
      />
    </div>
  );
}

async function CalendarWarmBoundary({ warmIds, children }: { warmIds: string[]; children: React.ReactNode }) {
  const queryClient = new QueryClient();
  void Promise.allSettled(
    warmIds.map((id) =>
      queryClient.prefetchQuery({
        ...bookingDetailCache.options(id),
        queryFn: bookingDetailCache.serverQueryFn(id),
      })
    )
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 0));
  return (
    <HydrationBoundary state={dehydrate(queryClient, { shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) || q.state.status === "pending" })}>
      <Suspense fallback={children}>{children}</Suspense>
    </HydrationBoundary>
  );
}

function CalendarLoadErrorState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <svg className="size-6 text-red-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-foreground">Calendar could not be loaded</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">Something went wrong while loading bookings and rooms. This is usually temporary — try again.</p>
      <Link href="/dashboard/calendar" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
        Retry
      </Link>
    </div>
  );
}

function NoCalendarState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <svg className="size-6 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-foreground">Hotel not found</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">No hotel is associated with this account. Please contact support to set up your property.</p>
    </div>
  );
}
