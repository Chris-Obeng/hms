import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OutstandingClient } from "./outstanding-client";
export default async function OutstandingPage() {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, currency")
    .eq("clerk_org_id", orgId)
    .single();
  if (!hotel) redirect("/dashboard");

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, reference, check_in, check_out, total_amount, amount_paid, outstanding_balance, status, guests(full_name, phone), rooms(room_number), room_types(name)")
    .eq("hotel_id", hotel.id)
    .in("status", ["confirmed", "checked_in"])
    .gt("outstanding_balance", 0)
    .order("check_in", { ascending: true })
    .limit(500);

  const rows = (bookings ?? []).map((b) => ({
    id: b.id,
    reference: b.reference,
    checkIn: b.check_in,
    checkOut: b.check_out,
    totalAmount: b.total_amount,
    amountPaid: b.amount_paid ?? 0,
    outstandingBalance: b.outstanding_balance ?? 0,
    status: b.status ?? "confirmed",
    guestName: (b.guests as { full_name?: string | null } | null)?.full_name ?? "Unknown",
    guestPhone: (b.guests as { phone?: string | null } | null)?.phone ?? null,
    roomNumber: (b.rooms as { room_number?: string | null } | null)?.room_number ?? null,
    roomType: (b.room_types as { name?: string | null } | null)?.name ?? null,
  }));

  const totalOutstanding = rows.reduce((s, r) => s + r.outstandingBalance, 0);

  return <OutstandingClient data={rows} currency={hotel.currency ?? "GHS"} totalOutstanding={totalOutstanding} hotelId={hotel.id} />;
}
