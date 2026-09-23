/**
 * Sentry — Edge runtime.
 *
 * Loaded by `instrumentation.ts` when NEXT_RUNTIME === "edge". Covers `proxy.ts`
 * (Clerk auth gate + Supabase platform session refresh), which is the one place
 * a failure locks every authenticated user out of the dashboard at once.
 *
 * `includeLocalVariables` is not available on the edge runtime, so it is absent
 * here by design — everything else matches sentry.server.config.ts.
 */

import * as Sentry from "@sentry/nextjs";

import { scrubEventLocalVariables } from "@/lib/observability/sentry";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  sendDefaultPii: false,

  // Errors only — see sentry.server.config.ts.
  tracesSampleRate: 0,

  // `includeLocalVariables` is unavailable here, but the same redaction runs so
  // both runtimes have identical PII behaviour.
  beforeSend: scrubEventLocalVariables,

  ignoreErrors: ["NEXT_REDIRECT", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK"],
});
