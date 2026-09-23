"use client";

import { RouteError } from "@/components/errors/route-error";
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
