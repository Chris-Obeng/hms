import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { businessToday } from "@/lib/business-date";
import { sortByOperationalRelevance } from "@/lib/bookings/operational-sort";
import { BookOpen } from "lucide-react";
import { BookingsTable, type BookingRow } from "@/components/bookings/bookings-table";
import { QueryClient, dehydrate, HydrationBoundary, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { CAPS } from "@/lib/cache/prefetch-helpers";

// Server warm cap: never hydrate 500 details (see prefetch-helpers CAPS)
const SERVER_WARM_N = CAPS.serverWarm;

export default async function BookingsPage() {
  const { orgId, getToken } = await auth();
  const supabase = await createClient();

  if (!orgId) {
    return <NoBookingsState />;
  }

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency, timezone")
    .eq("clerk_org_id", orgId)
    .single();

  const hotelId = hotel?.id;
  if (!hotelId) {
    return <NoBookingsState />;
  }

  const { data: roomTypesRaw } = await supabase
    .from("room_types")
    .select("id, name, base_price")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("name");

  const roomTypes = roomTypesRaw || [];

  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select(
      "id, reference, check_in, check_out, nights, status, payment_status, payment_preference, source, total_amount, amount_paid, outstanding_balance, room_id, group_id, rooms_count, created_at, guests(full_name, email, phone), rooms(room_number), room_types(name)"
    )
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })
    .limit(500);

  const isTransientHold = (b: NonNullable<typeof bookingsRaw>[number]) =>
    b.source === "direct" &&
    b.payment_preference === "pay_now" &&
    b.status === "pending" &&
    b.payment_status === "unpaid";

  const visible = (bookingsRaw || []).filter((b) => !isTransientHold(b));
  const groupsMap = new Map<string, typeof visible>();
  for (const b of visible) {
    const key = b.group_id ?? b.id;
    const arr = groupsMap.get(key);
    if (arr) arr.push(b);
    else groupsMap.set(key, [b]);
  }

  const bookings: BookingRow[] = [];
  for (const [key, members] of groupsMap) {
    const anchor = members.find((m) => m.id === key) ?? members[0];
    const isGroup = members.length > 1 || anchor.group_id != null;
    const roomsCount = members.reduce((n, m) => n + Math.max(1, m.rooms_count ?? 1), 0);
    const totalAmount = isGroup
      ? members.reduce((s, m) => s + (m.total_amount ?? 0), 0)
      : anchor.total_amount;
    const amountPaid = isGroup
      ? members.reduce((s, m) => s + (m.amount_paid ?? 0), 0)
      : anchor.amount_paid ?? 0;
    const outstandingBalance = isGroup
      ? members.reduce((s, m) => s + (m.outstanding_balance ?? 0), 0)
      : anchor.outstanding_balance;

    bookings.push({
      id: anchor.id,
      reference: anchor.reference,
      guestName: (anchor.guests as { full_name?: string | null } | null)?.full_name ?? "Unknown",
      guestEmail: (anchor.guests as { email?: string | null } | null)?.email ?? null,
      guestPhone: (anchor.guests as { phone?: string | null } | null)?.phone ?? null,
      roomType: (anchor.room_types as { name?: string | null } | null)?.name ?? null,
      roomNumber: (anchor.rooms as { room_number?: string | null } | null)?.room_number ?? null,
      checkIn: anchor.check_in,
      checkOut: anchor.check_out,
      nights: anchor.nights,
      status: anchor.status ?? "pending",
      paymentStatus: anchor.payment_status ?? "unpaid",
      source: anchor.source ?? "direct",
      totalAmount,
      amountPaid,
      outstandingBalance,
      roomsCount,
      isGroup,
      createdAt: anchor.created_at,
    });
  }

  const orderedBookings = sortByOperationalRelevance(bookings, businessToday(hotel?.timezone || "UTC"));
  const currency = hotel?.currency || "GHS";

  // Tier 1: SSR warm — void prefetch + HydrationBoundary (non-blocking, cap 12)
  // Mirrors dashboard/page.tsx RLS guard: only prefetch with valid Supabase token
  const rlsToken = getToken ? await getToken({ template: "supabase" }).catch(() => null) : null;
  if (rlsToken && orderedBookings.length > 0) {
    const warmIds = orderedBookings.slice(0, SERVER_WARM_N).map((b) => b.id);
    return (
      <BookingsWarmBoundary warmIds={warmIds}>
        <BookingsTable data={orderedBookings} roomTypes={roomTypes} currency={currency} hotelId={hotelId} />
      </BookingsWarmBoundary>
    );
  }

  return <BookingsTable data={orderedBookings} roomTypes={roomTypes} currency={currency} hotelId={hotelId} />;
}

// Child Server Component: void prefetch does not block parent paint (Next docs pattern)
async function BookingsWarmBoundary({ warmIds, children }: { warmIds: string[]; children: React.ReactNode }) {
  const queryClient = new QueryClient();
  void Promise.allSettled(
    warmIds.map((id) =>
      queryClient.prefetchQuery({
        ...bookingDetailCache.options(id),
        queryFn: bookingDetailCache.serverQueryFn(id),
      })
    )
  ).catch(() => {});
  // Give event loop a tick so prefetches start before dehydrate captures — still non-blocking for streaming
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

function NoBookingsState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <BookOpen className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-semibold text-foreground">Hotel not found</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        No hotel is associated with this account. Reservations cannot be managed until your hotel is set up.
      </p>
    </div>
  );
}
