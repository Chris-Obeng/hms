"use client";

import { RouteError } from "@/components/errors/route-error";

export default function BookingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Couldn't load bookings"
      description="No reservation was changed. Retry to continue."
      error={error}
      boundary="dashboard-bookings"
      reset={reset}
    />
  );
}
