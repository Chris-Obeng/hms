"use client";

import { useParams, useSearchParams } from "next/navigation";

import { useBoundaryReport } from "@/components/errors/use-boundary-report";

/**
 * Error boundary for the post-payment confirmation page (`/[slug]/book/confirmation`).
 *
 * This exists as its own boundary because it is the Paystack return target: the
 * callback URL built in `app/api/booking/[slug]/bookings/route.ts` and
 * `.../retry-payment/route.ts` sends the guest here *after* the card has been
 * charged. Without this file the nearest boundary is `app/[slug]/book/error.tsx`,
 * whose copy states that no payment was taken — which for a guest standing on
 * this route is false, and invites a chargeback on a valid transaction.
 *
 * So the copy must never assert a payment outcome in either direction. It says
 * only that the receipt could not be displayed, and keeps the booking reference
 * visible so the guest has the one handle the hotel needs to look them up.
 */
export default function ConfirmationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ slug?: string }>();
  const searchParams = useSearchParams();
  const reference = searchParams.get("bref") ?? searchParams.get("reference");

  useBoundaryReport(error, "booking-confirmation", {
    "hotel.slug": params?.slug,
    // Tagged, not just displayed: this is how support ties the guest's report to
    // the event, and a booking reference is an opaque handle, not guest PII.
    "payment.reference": reference,
  });

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center booking-safe-x px-6 text-center">
      <div
        className="mb-4 flex size-12 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, #f59e0b 14%, transparent)" }}
        aria-hidden="true"
      >
        <svg
          className="size-6"
          style={{ color: "#f59e0b" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      </div>
      <h1 className="booking-heading text-2xl sm:text-3xl text-[var(--bk-ink)]">
        We couldn&apos;t load your confirmation
      </h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--bk-ink-soft)] leading-relaxed">
        Your booking has not been lost — we just couldn&apos;t show it right now.
        Retry to reload the page.
      </p>
      {reference && (
        <p className="mt-4 text-sm text-[var(--bk-ink-soft)]">
          Booking reference{" "}
          <span className="font-semibold tracking-wide text-[var(--bk-ink)]">
            {reference}
          </span>
        </p>
      )}
      <p className="mt-4 max-w-sm text-xs text-[var(--bk-ink-soft)] leading-relaxed">
        If you were charged, the payment is already recorded against this
        reference. Quote it when you contact the hotel and they can confirm your
        reservation.
      </p>
      <button
        onClick={() => reset()}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[var(--bk-ink)] px-6 text-sm font-semibold text-[var(--bk-on-ink)] hover:bg-[var(--bk-ink-hover)] transition-colors active:scale-[0.98]"
      >
        Try again
      </button>
    </div>
  );
}
