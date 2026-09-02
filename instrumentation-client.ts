/**
 * Sentry — browser runtime.
 *
 * Next.js loads this file into the client bundle automatically (it replaced the
 * older `sentry.client.config.ts` in Next 15.3 / @sentry/nextjs 9; a file named
 * `sentry.client.config.ts` is no longer picked up).
 *
 * Session Replay is on, but only for sessions that actually produced an error
 * (`replaysSessionSampleRate: 0`), so normal browsing consumes no replay quota.
 */

import * as Sentry from "@sentry/nextjs";

/**
 * Replay sampling for errored sessions. Defaults to every one of them, which is
 * the right default at this traffic level, but reads from the environment so
 * replay quota can be dialled back during an incident without a deploy.
 */
function replayOnErrorRate(): number {
  const raw = process.env.NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR_RATE;
  if (!raw) return 1.0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1.0;
  return Math.min(1, Math.max(0, parsed));
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.NODE_ENV,

  // No IPs, cookies or request bodies. Guest checkout data stays out of Sentry.
  sendDefaultPii: false,

  // Errors only — see sentry.server.config.ts for the reasoning.
  tracesSampleRate: 0,

  // Replay quota policy: record nothing routinely, everything around an error.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: replayOnErrorRate(),

  integrations: [
    Sentry.replayIntegration({
      // These are the SDK defaults, pinned explicitly because this app renders
      // guest names, emails, phone numbers and payment amounts. Unmasking any of
      // them would put guest PII in the replay.
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  ignoreErrors: [
    // Browser/extension noise that is not actionable.
    "ResizeObserver loop completed with undelivered notifications",
    "ResizeObserver loop limit exceeded",
    // Navigating away mid-fetch, or a user cancelling a request.
    "AbortError",
    "The play() request was interrupted",
    // Next.js control-flow signals.
    "NEXT_REDIRECT",
    "NEXT_NOT_FOUND",
  ],
});

// Reports App Router client-side navigations to Sentry so an error can be tied
// to the navigation that triggered it.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
