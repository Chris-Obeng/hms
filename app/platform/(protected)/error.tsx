"use client";

import { RouteError } from "@/components/errors/route-error";

export default function PlatformError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Couldn't load the admin console"
      description="Hotel data was not changed. Retry to continue."
      reset={reset}
    />
  );
}
