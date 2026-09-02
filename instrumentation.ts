/**
 * Next.js instrumentation hook.
 *
 * `register()` runs once per server process, before any request is handled, and
 * dispatches to the runtime-specific Sentry config. `onRequestError` is the
 * Next.js 15+ hook that hands Sentry every unhandled error thrown in a route
 * handler, server action or React Server Component render.
 *
 * This is the whole of Sentry's server-side wiring under Turbopack: Turbopack
 * builds skip Sentry's build-time instrumentation and rely on these Next.js
 * telemetry hooks instead.
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
