"use client";

import { useParams } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { useBoundaryReport } from "@/components/errors/use-boundary-report";

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
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#F5F5F5] booking-safe-x px-6 text-center">
      <div
        className="mb-4 flex size-12 items-center justify-center rounded-full bg-[#FF383C]/12 text-[#FF383C]"
        aria-hidden="true"
      >
        <CircleAlert className="size-6" strokeWidth={2} />
      </div>
      <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.3px] text-[#18181B]">
        We couldn&apos;t continue your booking
      </h1>
      <p className="mt-2 max-w-sm text-[13px] text-[#71717A] leading-relaxed">
        You have not been charged. Retry to pick up where you left off — any
        rooms held for you are still yours for a few more minutes.
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
