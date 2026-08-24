"use client";

import { RouteError } from "@/components/errors/route-error";

export default function SettingsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Couldn't load settings"
      description="Your changes are safe. Retry to continue."
      reset={reset}
    />
  );
}
