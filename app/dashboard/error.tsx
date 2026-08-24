"use client";

import { RouteError } from "@/components/errors/route-error";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Couldn't load the dashboard"
      description="Live data is unaffected. Retry to continue."
      reset={reset}
    />
  );
}
