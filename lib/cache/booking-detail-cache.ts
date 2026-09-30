// lib/cache/booking-detail-cache.ts
// Shared TanStack cache contract for booking detail drawers.
// Follows Next.js docs pattern: queryOptions with server queryFn override
// on SSR (void prefetch + HydrationBoundary) and client default fetch.
// staleTime 30_000 prevents immediate refetch on hydration.
import { queryOptions } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import type { FullBookingDetail } from "@/app/actions/bookings-detail";

export type BookingDetailResult =
  | { success: true; booking: FullBookingDetail }
  | { success: false; error: string };

export const bookingDetailCache = {
  key: (id: string) => qk.bookingDetail(id),
  options: (id: string) =>
    queryOptions<FullBookingDetail>({
      queryKey: qk.bookingDetail(id),
      // Client default — server pages override queryFn with direct server action
      queryFn: async () => {
        const { getFullBookingDetail } = await import("@/app/actions/bookings-detail");
        const res = await getFullBookingDetail(id);
        if (!res.success) throw new Error(res.error);
        return res.booking;
      },
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    }),
  /** Server-side queryFn wrapper — throws on failure so prefetchQuery rejects cleanly (caught by allSettled) */
  serverQueryFn: (id: string) => async () => {
    const { getFullBookingDetail } = await import("@/app/actions/bookings-detail");
    const res = await getFullBookingDetail(id);
    if (!res.success) throw new Error(res.error);
    return res.booking;
  },
};
