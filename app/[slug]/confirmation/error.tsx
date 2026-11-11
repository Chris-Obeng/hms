"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Clock } from "lucide-react";
import { useBoundaryReport } from "@/components/errors/use-boundary-report";

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
    "payment.reference": reference,
  });

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#F5F5F5] booking-safe-x px-6 text-center">
      <div
        className="mb-4 flex size-12 items-center justify-center rounded-full bg-[#F5A524]/15 text-[#F5A524]"
        aria-hidden="true"
      >
        <Clock className="size-6" strokeWidth={2} />
      </div>
      <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.3px] text-[#18181B]">
        We couldn&apos;t load your confirmation
      </h1>
      <p className="mt-2 max-w-sm text-[13px] text-[#71717A] leading-relaxed">
        Your booking has not been lost — we just couldn&apos;t show it right
        now. Retry to reload the page.
      </p>
      {reference && (
        <p className="mt-4 text-[13px] text-[#71717A]">
          Booking reference{" "}
          <span className="booking-mono font-semibold text-[#0485F7]">
            {reference}
          </span>
        </p>
      )}
      <p className="mt-3 max-w-sm text-[12px] text-[#71717A] leading-relaxed">
        If you were charged, the payment is already recorded against this
        reference. Quote it when you contact the hotel and they can confirm your
        reservation.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 booking-btn-primary h-10 px-6 text-[14px] inline-flex items-center justify-center cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
