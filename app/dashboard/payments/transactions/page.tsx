import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TransactionsClient } from "./transactions-client";
export default async function PaymentTransactionsPage() {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, currency")
    .eq("clerk_org_id", orgId)
    .single();
  if (!hotel) redirect("/dashboard");

  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, currency, method, status, paystack_reference, paid_at, created_at, notes, booking_id, bookings(reference, guests(full_name))")
    .eq("hotel_id", hotel.id)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (payments ?? []).map((p) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency ?? hotel.currency ?? "GHS",
    method: p.method,
    status: p.status,
    paystackReference: p.paystack_reference,
    paidAt: p.paid_at,
    createdAt: p.created_at,
    notes: p.notes,
    bookingId: p.booking_id,
    bookingReference: (p.bookings as { reference?: string | null } | null)?.reference ?? null,
    guestName: (p.bookings as { guests?: { full_name?: string | null } | null } | null)?.guests?.full_name ?? null,
  }));

  return <TransactionsClient data={rows} currency={hotel.currency ?? "GHS"} hotelId={hotel.id} />;
}
