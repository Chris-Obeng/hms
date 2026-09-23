"use client";

import { useParams } from "next/navigation";

import { useBoundaryReport } from "@/components/errors/use-boundary-report";

/**
 * Guest-facing error boundary for the public booking site. Uses the booking
 * theme tokens so it matches light and dark hotel branding.
 *
 * Tagged with the hotel slug, which is what makes "this one hotel's site is
 * broken" distinguishable from "the booking site is broken" in Sentry.
 */
export default function BookingSiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ slug?: string }>();
  useBoundaryReport(error, "booking-site", { "hotel.slug": params?.slug });

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
        This page couldn&apos;t load
      </h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--bk-ink-soft)] leading-relaxed">
        Nothing was charged or booked. Retry, or check back in a moment.
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
