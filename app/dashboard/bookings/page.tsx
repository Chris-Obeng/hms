import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { businessToday } from "@/lib/business-date";
import { sortByOperationalRelevance } from "@/lib/bookings/operational-sort";
import { BookOpen } from "lucide-react";
import { BookingsTable, type BookingRow } from "@/components/bookings/bookings-table";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const { orgId } = await auth();
  const supabase = await createClient();

  if (!orgId) {
    return <NoBookingsState />;
  }

  // Fetch hotel
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency, timezone")
    .eq("clerk_org_id", orgId)
    .single();

  const hotelId = hotel?.id;

  if (!hotelId) {
    return <NoBookingsState />;
  }

  // Fetch room types for filters
  const { data: roomTypesRaw } = await supabase
    .from("room_types")
    .select("id, name, base_price")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("name");

  const roomTypes = roomTypesRaw || [];

  // Fetch all bookings with relations
  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select(
      "id, reference, check_in, check_out, nights, status, payment_status, payment_preference, source, total_amount, amount_paid, outstanding_balance, room_id, created_at, guests(full_name, email, phone), rooms(room_number), room_types(name)"
    )
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })
    .limit(500);

  // Transient guest payment holds (pay-online, still unpaid) are NOT bookings
  // yet — they surface only after Paystack confirms the charge. Abandoned ones
  // are cancelled automatically by expire_stale_payment_holds() (pg_cron).
  const isTransientHold = (b: NonNullable<typeof bookingsRaw>[number]) =>
    b.source === "direct" &&
    b.payment_preference === "pay_now" &&
    b.status === "pending" &&
    b.payment_status === "unpaid";

  const bookings: BookingRow[] = (bookingsRaw || [])
    .filter((b) => !isTransientHold(b))
    .map((b) => ({
    id: b.id,
    reference: b.reference,
    guestName: (b.guests as { full_name?: string | null } | null)?.full_name ?? "Unknown",
    guestEmail: (b.guests as { email?: string | null } | null)?.email ?? null,
    guestPhone: (b.guests as { phone?: string | null } | null)?.phone ?? null,
    roomType: (b.room_types as { name?: string | null } | null)?.name ?? null,
    roomNumber: (b.rooms as { room_number?: string | null } | null)?.room_number ?? null,
    checkIn: b.check_in,
    checkOut: b.check_out,
    nights: b.nights,
    status: b.status ?? "pending",
    paymentStatus: b.payment_status ?? "unpaid",
    source: b.source ?? "direct",
    totalAmount: b.total_amount,
    amountPaid: b.amount_paid ?? 0,
    outstandingBalance: b.outstanding_balance,
    createdAt: b.created_at,
  }));

  // Front-desk working order (Opera/Mews convention), anchored to the
  // property's business date: today's arrivals and in-house stays first in
  // arrival order, then past history most-recent-first. The table's column
  // sorting still lets staff re-order on demand.
  const orderedBookings = sortByOperationalRelevance(bookings, businessToday(hotel?.timezone || "UTC"));

  const currency = hotel?.currency || "GHS";

  return (
    <BookingsTable
      data={orderedBookings}
      roomTypes={roomTypes}
      currency={currency}
      hotelId={hotelId}
    />
  );
}

function NoBookingsState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <BookOpen className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-semibold text-foreground">Hotel not found</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        No hotel is associated with this account. Reservations cannot be managed
        until your hotel is set up.
      </p>
    </div>
  );
}
