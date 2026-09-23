"use client";

import { RouteError } from "@/components/errors/route-error";

/**
 * Boundary for the unauthenticated platform routes (sign-in, password reset).
 * The authenticated console has its own boundary in `(protected)/error.tsx`.
 */
export default function PlatformPublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Couldn't load this page"
      description="Retry to continue, or return to the sign-in page."
      error={error}
      boundary="platform-public"
      reset={reset}
    />
  );
}
