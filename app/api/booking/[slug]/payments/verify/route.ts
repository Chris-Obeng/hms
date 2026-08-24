import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/paystack";
import { recordOnlinePayment } from "@/lib/bookings/confirm-online-payment";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/booking/[slug]/payments/verify?reference=<paystackRef>
 *
 * Guest-facing payment verification. Called from the confirmation page after
 * Paystack redirects back. The webhook is the primary confirmation path — this
 * route is an idempotent fallback for cases where the webhook fires before the
 * browser redirect arrives (or never arrives).
 *
 * Security properties:
 * - Amount is re-verified against Paystack (not trusted from client/URL)
 * - Booking ownership verified: booking.hotel_id must match the hotel resolved
 *   from the slug — prevents confirming a foreign hotel's booking
 * - Idempotent: shares recordOnlinePayment() with the webhook; UNIQUE
 *   paystack_reference makes concurrent runs race-safe
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Each call hits Paystack's paid/quota-limited API — throttle hard.
  const rl = await rateLimit(req, { name: "payment-verify", limit: 10, windowSeconds: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

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

    // Booking must belong to the hotel resolved from the URL slug (cross-tenant check)
    const { data: ownership, error: ownershipError } = await supabaseAdmin
      .from("bookings")
      .select("hotel_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (ownershipError) {
      throw new Error(`Ownership lookup failed: ${ownershipError.message}`);
    }

    if (!ownership || ownership.hotel_id !== hotel.id) {
      console.error("[payment/verify] hotel_id mismatch — possible cross-tenant access attempt", {
        urlSlug: slug,
        resolvedHotelId: hotel.id,
        bookingHotelId: ownership?.hotel_id ?? null,
        bookingId,
      });
      return NextResponse.json({ verified: false, error: "Invalid request" }, { status: 403 });
    }

    // ── Shared, race-safe recording pipeline (same as webhook) ──
    const subaccountData = txn.subaccount as Record<string, unknown> | null | undefined;

    const result = await recordOnlinePayment({
      bookingId,
      paystackReference: reference,
      paystackId: txn.id != null ? String(txn.id) : null,
      amountPaid: txn.amount / 100, // pesewas → major units
      currency: typeof txn.currency === "string" ? txn.currency : hotel.currency,
      subaccountCode: (subaccountData?.account_code as string | null) ?? null,
    });

    switch (result.outcome) {
      case "already_recorded":
      case "recorded":
        return NextResponse.json({
          verified: true,
          bookingReference: bookingRef,
          partialPayment: !result.fullyPaid,
        });
      case "failed":
        // The guest may have paid — surface a 500 so the confirmation page can
        // retry rather than reporting success for a payment we never stored.
        throw new Error(result.error);
    }
  } catch (err) {
    console.error("[payment/verify]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { verified: false, error: "Verification failed. Please contact the hotel." },
      { status: 500 }
    );
  }
}
