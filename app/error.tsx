"use client";

import { RouteError } from "@/components/errors/route-error";

/**
 * Catch-all route boundary.
 *
 * Every segment with its own error.tsx handles its errors first; this exists so a
 * segment that has none — today the marketing landing page — still reports rather
 * than escalating to `global-error.tsx`, which replaces the whole HTML shell.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Something went wrong"
      description="This page failed to load. Retry, or try again in a moment."
      error={error}
      boundary="root"
      reset={reset}
    />
  );
}
