/**
 * Sentry — Node.js server runtime.
 *
 * Loaded by `instrumentation.ts` when NEXT_RUNTIME === "nodejs". Covers route
 * handlers, server actions, RSC renders and the Paystack webhook.
 *
 * Cost posture: errors only. Performance tracing is deliberately switched off
 * (`tracesSampleRate: 0`) to conserve the sponsored plan's quota. Trace IDs are
 * still generated and propagated at rate 0, so a browser error and the server
 * error it caused remain linked in the issue view at no event cost.
 *
 * PII posture: `sendDefaultPii: false` plus a `beforeSend` that redacts
 * stack-frame local variables. See `includeLocalVariables` below.
 */

import * as Sentry from "@sentry/nextjs";

import { scrubEventLocalVariables } from "@/lib/observability/sentry";

Sentry.init({
  // Unset DSN (local dev, CI) makes the SDK a no-op rather than an error.
  dsn: process.env.SENTRY_DSN,

  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  // Guest and staff PII (names, emails, phone numbers, IPs, request bodies) is
  // never auto-attached. Anything Sentry sees is added explicitly and scrubbed
  // in lib/observability/sentry.ts.
  sendDefaultPii: false,

  // See file header — errors only, no transaction sampling.
  tracesSampleRate: 0,

  // Stack-frame locals are OFF by default. They are attached by the SDK, not by
  // our capture helpers, and in the booking POST the locals of the handler hold
  // the parsed guest record — name, email and phone. Shipping that to a third
  // party would contradict `sendDefaultPii: false` above.
  //
  // Set SENTRY_INCLUDE_LOCAL_VARIABLES=true for a deliberate debugging window.
  // `beforeSend` scrubs frame vars either way, so the flag widens what is
  // collected without widening what leaves the process unredacted.
  includeLocalVariables: process.env.SENTRY_INCLUDE_LOCAL_VARIABLES === "true",

  beforeSend: scrubEventLocalVariables,

  // Next.js control-flow signals are thrown, not failures.
  ignoreErrors: ["NEXT_REDIRECT", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK"],
});
