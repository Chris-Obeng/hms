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

import { GUEST_ACCESS_QUERY_PARAM, redactGuestAccessToken } from "@/lib/bookings/guest-access-link";
import {
  redactGuestAccessFromBreadcrumb,
  redactGuestAccessFromEvent,
} from "@/lib/observability/sentry";

/**
 * Replay events hold page URLs, link `href`s and fetch URLs, any of which can
 * carry a guest booking access token. Events are JSON by contract (that is how
 * they are sent), so a round trip reaches every string at any depth; the
 * substring test keeps the common case to one serialisation.
 */
function redactReplayEvent<T>(event: T): T {
  try {
    const json = JSON.stringify(event);
    if (!json.includes(`${GUEST_ACCESS_QUERY_PARAM}=`)) return event;
    const redacted = redactGuestAccessToken(json);
    return redacted === json ? event : (JSON.parse(redacted) as T);
  } catch {
    return event;
  }
}

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

  // Guest booking links carry an access token (`?t=`); it never leaves the browser.
  beforeSend: redactGuestAccessFromEvent,
  beforeBreadcrumb: redactGuestAccessFromBreadcrumb,

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
      beforeAddRecordingEvent: redactReplayEvent,
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
