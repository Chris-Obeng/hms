import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, name, currency")
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
      "id, reference, check_in, check_out, nights, status, payment_status, source, total_amount, amount_paid, outstanding_balance, room_id, created_at, guests(full_name, email, phone), rooms(room_number), room_types(name)"
    )
    .eq("hotel_id", hotelId)
    .order("check_in", { ascending: false })
    .limit(500);

  const bookings: BookingRow[] = (bookingsRaw || []).map((b) => ({
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

  const currency = hotel?.currency || "GHS";

  return (
    <BookingsTable
      data={bookings}
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
