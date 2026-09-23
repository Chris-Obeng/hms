"use client";

import { useParams } from "next/navigation";

import { useBoundaryReport } from "@/components/errors/use-boundary-report";

/**
 * Error boundary for guest checkout (`/[slug]/book`).
 *
 * The most expensive place in the product for an error to go unreported: a guest
 * who sees a blank step abandons the booking, and the hotel never learns why.
 * Reported under its own boundary tag so checkout failures do not group with the
 * rest of the public site.
 *
 * The copy deliberately states that no charge was made. That is safe to assert
 * here and only here: the payment path leaves this route with a full navigation
 * to Paystack, and the guest returns to `/[slug]/book/confirmation`, which has
 * its own boundary precisely so this copy never reaches a guest who has paid.
 *
 * It stops short of claiming no room was reserved, because a completed hold does
 * reserve inventory until it expires.
 */
export default function BookingCheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ slug?: string }>();
  useBoundaryReport(error, "booking-checkout", { "hotel.slug": params?.slug });

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center booking-safe-x px-6 text-center">
      <div
        className="mb-4 flex size-12 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, #ef4444 12%, transparent)" }}
        aria-hidden="true"
      >
        <svg
          className="size-6"
          style={{ color: "#ef4444" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>
      <h1 className="booking-heading text-2xl sm:text-3xl text-[var(--bk-ink)]">
        We couldn&apos;t continue your booking
      </h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--bk-ink-soft)] leading-relaxed">
        You have not been charged. Retry to pick up where you left off — any
        rooms held for you are still yours for a few more minutes.
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
