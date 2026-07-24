import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/paystack";

/**
 * GET /api/booking/[slug]/payments/verify?reference=<paystackRef>
 *
 * Guest-facing payment verification. Called from the confirmation page after
 * Paystack redirects back. The webhook is the primary confirmation path — this
 * route is an idempotent fallback for cases where the webhook fires before the
 * browser redirect arrives.
 *
 * Security properties:
 * - Amount is re-verified against Paystack (not trusted from client/URL)
 * - Booking ownership verified: booking.hotel_id must match the hotel resolved
 *   from the slug — prevents confirming a foreign hotel's booking
 * - Idempotent: skips insert if payment record already exists (webhook may
 *   have beaten us here)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const reference = req.nextUrl.searchParams.get("reference");

  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  // Validate slug format before touching the DB
  if (!/^[a-z0-9.-]{1,253}$/i.test(slug)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    // Resolve hotel — two separate parameterized queries (no .or() interpolation)
    let hotelQuery = await supabaseAdmin
      .from("hotels")
      .select("id, currency")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();

    if (!hotelQuery.data) {
      hotelQuery = await supabaseAdmin
        .from("hotels")
        .select("id, currency")
        .eq("custom_domain", slug)
        .eq("status", "active")
        .maybeSingle();
    }

    const hotel = hotelQuery.data;
    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    // Verify payment with Paystack — amount comes from Paystack, not from client
    const txn = await verifyTransaction(reference);

    if (txn.status !== "success") {
      return NextResponse.json({ verified: false, status: txn.status });
    }

    // Parse booking metadata embedded in the transaction
    const metadata =
      typeof txn.metadata === "string"
        ? (JSON.parse(txn.metadata) as Record<string, unknown>)
        : ((txn.metadata ?? {}) as Record<string, unknown>);

    const bookingId = typeof metadata.booking_id === "string" ? metadata.booking_id : null;
    const bookingRef =
      typeof metadata.booking_reference === "string" ? metadata.booking_reference : null;

    if (!bookingId) {
      return NextResponse.json({ verified: false, error: "No booking linked" }, { status: 400 });
    }

    // Idempotent — webhook may have already confirmed it
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (existingError) {
      // Fail loudly rather than risk recording a duplicate payment on a
      // transient read error.
      throw new Error(`Idempotency lookup failed: ${existingError.message}`);
    }

    if (existing) {
      // Already recorded — just return success
      return NextResponse.json({ verified: true, bookingReference: bookingRef });
    }

    // Fetch booking and assert it belongs to THIS hotel (cross-tenant check)
    const { data: booking, error: bookingFetchError } = await supabaseAdmin
      .from("bookings")
      .select("id, hotel_id, total_amount, currency, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingFetchError) {
      throw new Error(`Booking lookup failed: ${bookingFetchError.message}`);
    }

    if (!booking) {
      return NextResponse.json({ verified: false, error: "Booking not found" }, { status: 404 });
    }

    // Booking must belong to the hotel resolved from the URL slug
    if (booking.hotel_id !== hotel.id) {
      console.error("[payment/verify] hotel_id mismatch — possible cross-tenant access attempt", {
        urlSlug: slug,
        resolvedHotelId: hotel.id,
        bookingHotelId: booking.hotel_id,
        bookingId,
      });
      return NextResponse.json({ verified: false, error: "Invalid request" }, { status: 403 });
    }

    const amountPaid = txn.amount / 100; // pesewas → GHS
    const expectedAmount = Number(booking.total_amount);

    // Validate amount matches what was expected
    // Allow a small float delta (0.01) for rounding differences
    if (Math.abs(amountPaid - expectedAmount) > 0.01) {
      console.error("[payment/verify] Amount mismatch — recording as partial/suspicious", {
        bookingId,
        expectedAmount,
        amountPaid,
        reference,
      });

      const { error: mismatchPaymentError } = await supabaseAdmin.from("payments").insert({
        hotel_id: booking.hotel_id,
        booking_id: bookingId,
        amount: amountPaid,
        currency: booking.currency ?? "GHS",
        method: "card",
        status: "success",
        paystack_reference: reference,
        paystack_subaccount: txn.subaccount?.account_code ?? null,
        paid_at: new Date().toISOString(),
        notes: `Amount mismatch: expected ${expectedAmount}, received ${amountPaid}`,
      });

      if (mismatchPaymentError) {
        // Don't tell the guest "verified" when we failed to persist the payment.
        throw new Error(`Failed to record payment: ${mismatchPaymentError.message}`);
      }

      const { error: mismatchNotifyError } = await supabaseAdmin.from("notifications").insert({
        hotel_id: booking.hotel_id,
        type: "payment_received",
        title: "⚠️ Payment Amount Mismatch",
        message: `Payment of ${booking.currency ?? "GHS"} ${amountPaid.toFixed(2)} received for booking (expected ${expectedAmount.toFixed(2)}). Manual review required.`,
        booking_id: bookingId,
        is_read: false,
      });

      if (mismatchNotifyError) {
        console.error("[payment/verify] Failed to write amount-mismatch alert", {
          bookingId,
          reference,
          error: mismatchNotifyError.message,
        });
      }

      // Still verified from Paystack's perspective — partial payment
      const { error: mismatchBookingError } = await supabaseAdmin
        .from("bookings")
        .update({ payment_status: "partial", amount_paid: amountPaid })
        .eq("id", bookingId);

      if (mismatchBookingError) {
        console.error("[payment/verify] Payment recorded but booking update failed", {
          bookingId,
          reference,
          error: mismatchBookingError.message,
        });
      }

      return NextResponse.json({ verified: true, bookingReference: bookingRef, partialPayment: true });
    }

    // Amount matches — record payment and confirm booking
    const { error: paymentInsertError } = await supabaseAdmin.from("payments").insert({
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

    if (paymentInsertError) {
      // The guest paid — surface a 500 so the confirmation page can retry rather
      // than reporting success for a payment we never stored.
      throw new Error(`Failed to record payment: ${paymentInsertError.message}`);
    }

    const { error: bookingUpdateError } = await supabaseAdmin
      .from("bookings")
      .update({ status: "confirmed", payment_status: "paid", amount_paid: amountPaid })
      .eq("id", bookingId);

    if (bookingUpdateError) {
      // Payment is stored; only the booking status failed to update. Log so it's
      // diagnosable — the webhook path will also reconcile the status.
      console.error("[payment/verify] Payment recorded but booking update failed", {
        bookingId,
        reference,
        error: bookingUpdateError.message,
      });
    }

    return NextResponse.json({ verified: true, bookingReference: bookingRef });
  } catch (err) {
    console.error("[payment/verify]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { verified: false, error: "Verification failed. Please contact the hotel." },
      { status: 500 }
    );
  }
}
