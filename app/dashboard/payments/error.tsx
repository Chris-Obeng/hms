"use client";

import { RouteError } from "@/components/errors/route-error";

export default function PaymentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Couldn't load payments"
      description="No payment was recorded, refunded or altered. Retry to continue."
      error={error}
      boundary="dashboard-payments"
      reset={reset}
    />
  );
}
