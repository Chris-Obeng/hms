import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from "@tanstack/react-query";
import { getFullBookingDetail } from "@/app/actions/bookings-detail";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { BookingDeepLinkClient } from "./booking-deep-link-client";

type Props = { params: Promise<{ id: string }> };

/**
 * Standalone reservation folio page — prefetches the full reservation on the
 * server into the shared `qk.bookingDetail(id)` cache key so first paint has
 * zero skeleton waterfall and stays in sync with the dashboard drawer.
 */
export default async function BookingDetailPage({ params }: Props) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, address, city, phone, currency")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) redirect("/dashboard");

  const detailResult = await getFullBookingDetail(id);
  if (!detailResult.success) {
    notFound();
  }

  const queryClient = new QueryClient();
  queryClient.setQueryData(bookingDetailCache.key(id), detailResult.booking);

  const hotelAddress = [hotel.address, hotel.city].filter(Boolean).join(", ") || undefined;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BookingDeepLinkClient
        bookingId={id}
        currency={detailResult.booking.currency || hotel.currency || "GHS"}
        hotelName={hotel.name}
        hotelAddress={hotelAddress}
        hotelPhone={hotel.phone ?? undefined}
      />
    </HydrationBoundary>
  );
}
