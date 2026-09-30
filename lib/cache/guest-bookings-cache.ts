// lib/cache/guest-bookings-cache.ts
// Shared TanStack cache contract for guest history (GuestDetailSheet).
// Mirrors booking-detail-cache tiered strategy.
import { queryOptions } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import type { GuestBookingSummary } from "@/app/actions/customers";

export const guestBookingsCache = {
  key: (id: string) => qk.guestBookings(id),
  options: (id: string) =>
    queryOptions<GuestBookingSummary[]>({
      queryKey: qk.guestBookings(id),
      queryFn: async () => {
        const { getGuestBookings } = await import("@/app/actions/customers");
        const res = await getGuestBookings(id);
        if (!res.success) throw new Error(res.error);
        return res.data;
      },
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    }),
  serverQueryFn: (id: string) => async () => {
    const { getGuestBookings } = await import("@/app/actions/customers");
    const res = await getGuestBookings(id);
    if (!res.success) throw new Error(res.error);
    return res.data;
  },
};
