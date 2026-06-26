import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createHmac } from "crypto";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Validate signature
  const sig = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY ?? "")
    .update(rawBody)
    .digest("hex");
  if (sig !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const txn = event.data;
  const paystackRef: string = txn.reference;
  const metadata = typeof txn.metadata === "string" ? JSON.parse(txn.metadata) : (txn.metadata ?? {});
  const bookingId: string | undefined = metadata.booking_id;

  if (!bookingId) return NextResponse.json({ received: true });

  // Idempotency check — if payment already recorded, skip
  const { data: existing } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("paystack_reference", paystackRef)
    .maybeSingle();
  if (existing) return NextResponse.json({ received: true });

  // Fetch booking
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("id, hotel_id, total_amount, currency")
    .eq("id", bookingId)
    .single();
  if (!booking) return NextResponse.json({ received: true });

  const amountPaid = txn.amount / 100; // pesewas → GHS

  // Insert payment record
  await supabaseAdmin.from("payments").insert({
    hotel_id: booking.hotel_id,
    booking_id: bookingId,
    amount: amountPaid,
    currency: booking.currency ?? "GHS",
    method: "card",
    status: "success",
    paystack_reference: paystackRef,
    paystack_id: String(txn.id),
    paystack_subaccount: txn.subaccount?.account_code ?? null,
    paid_at: new Date().toISOString(),
  });

  // Confirm booking
  await supabaseAdmin
    .from("bookings")
    .update({
      status: "confirmed",
      payment_status: "paid",
      amount_paid: amountPaid,
    })
    .eq("id", bookingId)
    .eq("hotel_id", booking.hotel_id);

  // Admin notification
  await supabaseAdmin.from("notifications").insert({
    hotel_id: booking.hotel_id,
    type: "payment_received",
    title: "Payment Received",
    message: `Online payment of ${booking.currency} ${amountPaid.toFixed(2)} confirmed`,
    booking_id: bookingId,
    is_read: false,
  });

  return NextResponse.json({ received: true });
}
