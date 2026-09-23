"use client";

import { RouteError } from "@/components/errors/route-error";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Couldn't load the dashboard"
      description="Live data is unaffected. Retry to continue."
      error={error}
      boundary="dashboard"
      reset={reset}
    />
  );
}
