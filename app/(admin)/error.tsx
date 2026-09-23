"use client";

import { RouteError } from "@/components/errors/route-error";

/**
 * Boundary for the account-state routes: sign-in/up, onboarding, suspended and
 * deactivated. A failure here leaves a staff member unable to reach the product
 * at all, so it is worth its own tag rather than falling through to app/error.tsx.
 */
export default function AdminFlowError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Couldn't load this page"
      description="Your account was not changed. Retry to continue."
      error={error}
      boundary="admin-flow"
      reset={reset}
    />
  );
}
