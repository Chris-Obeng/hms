"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useRef } from "react";

/**
 * Reports a React error-boundary error to Sentry.
 *
 * Next.js does not forward `error.tsx` / `global-error.tsx` errors to Sentry on
 * its own — a boundary that only renders a message is a silently lost error. Any
 * boundary in this app must call this hook.
 *
 * The current path is read from `window.location` rather than `usePathname()` so
 * the hook is safe inside `global-error.tsx`, which renders after the root layout
 * has failed and cannot rely on router context.
 *
 * `tags` adds searchable dimensions the boundary knows and Sentry cannot infer —
 * the hotel slug on the public booking site, for instance. Keys follow the same
 * convention as lib/observability/sentry.ts. Never pass guest or staff identity.
 */
export function useBoundaryReport(
  error: Error & { digest?: string },
  boundary: string,
  tags?: Record<string, string | null | undefined>,
): void {
  // Tags are read inside the effect only, so an inline object literal at the call
  // site does not need to be memoised to keep the effect from re-firing.
  // `useRef(tags)` seeds the mount value; later values are written in an effect
  // rather than during render, which React forbids for mutable external state.
  const tagsRef = useRef(tags);
  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  useEffect(() => {
    Sentry.withScope((scope) => {
      scope.setTag("roomline.scope", "client");
      scope.setTag("error.boundary", boundary);

      // Server-rendered errors are opaque to the browser; the digest is the only
      // handle that ties this event to the matching server-side issue.
      if (error.digest) scope.setTag("error.digest", error.digest);

      for (const [key, value] of Object.entries(tagsRef.current ?? {})) {
        if (value) scope.setTag(key, value);
      }

      scope.setContext("route", {
        boundary,
        pathname: typeof window === "undefined" ? null : window.location.pathname,
      });

      // Keep Sentry's grouping, but split it per boundary so the same generic
      // failure in guest checkout and in the dashboard are separate issues.
      scope.setFingerprint(["{{ default }}", boundary]);

      Sentry.captureException(error);
    });
  }, [error, boundary]);
}
