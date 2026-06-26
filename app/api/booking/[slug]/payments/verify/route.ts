import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/paystack";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const reference = req.nextUrl.searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  try {
    const txn = await verifyTransaction(reference);
    if (txn.status !== "success") {
      return NextResponse.json({ verified: false, status: txn.status });
    }

    const metadata = typeof txn.metadata === "string" ? JSON.parse(txn.metadata) : (txn.metadata ?? {});
    const bookingId: string | undefined = metadata.booking_id;
    const bookingRef: string | undefined = metadata.booking_reference;

    if (!bookingId) return NextResponse.json({ verified: false, error: "No booking linked" }, { status: 400 });

    // Idempotent — webhook may have already confirmed it
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (!existing) {
      const { data: booking } = await supabaseAdmin
        .from("bookings")
        .select("id, hotel_id, total_amount, currency")
        .eq("id", bookingId)
        .single();

      if (booking) {
        const amountPaid = txn.amount / 100;
        await supabaseAdmin.from("payments").insert({
          hotel_id: booking.hotel_id,
          booking_id: bookingId,
          amount: amountPaid,
          currency: booking.currency ?? "GHS",
          method: "card",
          status: "success",
          paystack_reference: reference,
          paystack_subaccount: txn.subaccount?.account_code ?? null,
          paid_at: new Date().toISOString(),
        });
        await supabaseAdmin
          .from("bookings")
          .update({ status: "confirmed", payment_status: "paid", amount_paid: amountPaid })
          .eq("id", bookingId);
      }
    }

    return NextResponse.json({ verified: true, bookingReference: bookingRef });
  } catch (err) {
    return NextResponse.json({ verified: false, error: (err as Error).message }, { status: 500 });
  }
}
