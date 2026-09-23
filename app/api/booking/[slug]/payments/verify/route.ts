import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTransaction, extractSubaccountCode } from "@/lib/paystack";
import { recordOnlinePayment } from "@/lib/bookings/confirm-online-payment";
import { fromMinor } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import {
  captureError,
  captureIssue,
  captureSupabaseError,
  flushSentry,
} from "@/lib/observability/sentry";
import { hotelSlugParam, paystackReferenceParam } from "@/lib/validation/params";

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

  // Both values are parsed against the shared allowlists in lib/validation, not
  // re-checked with an inline regex: the reference is interpolated into a
  // Paystack URL path and the slug into a PostgREST filter, so "what a valid
  // reference is" must have exactly one definition across the routes that
  // accept one.
  const parsedReference = paystackReferenceParam.safeParse(
    req.nextUrl.searchParams.get("reference")
  );

  if (!parsedReference.success) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const reference = parsedReference.data;

  if (!hotelSlugParam.safeParse(slug).success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  /**
   * Whether Paystack has already told us this transaction succeeded.
   *
   * This is what separates "the verify call itself broke" from "money is
   * captured and RoomLine failed to record it". Before this flag, every throw in
   * the block below — including a Paystack timeout during an outage, which is
   * already reported by paystackFetch — was captured as `fatal`, so the one
   * severity reserved for lost money also fired for problems that cost nothing
   * and resolve on the guest's next refresh.
   */
  let paymentConfirmed = false;

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

    // From here on the guest's card has been charged.
    paymentConfirmed = true;

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
      captureSupabaseError(ownershipError, "bookings.select.ownership", {
        scope: "booking-funnel",
        step: "payment_verify",
        hotelId: hotel.id,
        bookingId,
        reference,
        tags: { "hotel.slug": slug },
      });
      throw new Error(`Ownership lookup failed: ${ownershipError.message}`);
    }

    if (!ownership || ownership.hotel_id !== hotel.id) {
      console.error("[payment/verify] hotel_id mismatch — possible cross-tenant access attempt", {
        urlSlug: slug,
        resolvedHotelId: hotel.id,
        bookingHotelId: ownership?.hotel_id ?? null,
        bookingId,
      });
      // Either a guest verifying a reference against the wrong hotel's site, or a
      // deliberate cross-tenant probe. Both are worth seeing; the tag says which.
      captureIssue("Payment verify blocked: booking belongs to another hotel", {
        scope: "booking-funnel",
        step: "payment_verify",
        level: "error",
        hotelId: hotel.id,
        bookingId,
        reference,
        tags: {
          "hotel.slug": slug,
          "verify.reason": ownership ? "hotel-mismatch" : "booking-missing",
        },
        fingerprint: ["booking-funnel", "verify-cross-tenant"],
      });
      return NextResponse.json({ verified: false, error: "Invalid request" }, { status: 403 });
    }

    // ── Shared, race-safe recording pipeline (same as webhook) ──
    // Paystack reports the amount in the transaction currency's smallest unit.
    // Dividing by a fixed 100 understates a zero-decimal charge a hundredfold and
    // would leave the booking looking underpaid.
    const txnCurrency = typeof txn.currency === "string" ? txn.currency : hotel.currency;

    const result = await recordOnlinePayment({
      bookingId,
      paystackReference: reference,
      paystackId: txn.id != null ? String(txn.id) : null,
      amountPaid: fromMinor(txn.amount, txnCurrency),
      currency: txnCurrency,
      subaccountCode: extractSubaccountCode(txn),
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
    // The guest is told to contact the hotel, so this is the last chance to learn
    // that a paid booking was never confirmed.
    //
    // `fatal` is reserved for the case that actually deserves a page: Paystack
    // confirmed the charge and the recording pipeline still failed, which means
    // real money exists with no payment row behind it. Anything that broke before
    // that confirmation is a failed lookup or an upstream outage — serious, but
    // no money has moved, so it is graded `error` and grouped separately.
    captureError(err, {
      scope: "booking-funnel",
      step: "payment_verify",
      level: paymentConfirmed ? "fatal" : "error",
      reference,
      tags: {
        "hotel.slug": slug,
        "verify.payment_confirmed": paymentConfirmed,
      },
      fingerprint: [
        "booking-funnel",
        "verify-failed",
        paymentConfirmed ? "after-charge" : "before-charge",
      ],
    });
    return NextResponse.json(
      { verified: false, error: "Verification failed. Please contact the hotel." },
      { status: 500 }
    );
  } finally {
    // Guest-facing payment path on a serverless isolate: flush before the
    // response resolves or the event is lost.
    await flushSentry();
  }
}
