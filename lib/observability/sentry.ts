/**
 * Sentry capture helpers.
 *
 * Everything RoomLine reports to Sentry goes through this module, for three
 * reasons:
 *
 *  1. Consistent tags. Tags are the only searchable dimension in Sentry, so the
 *     keys are fixed here (`roomline.scope`, `booking.step`, `hotel.id`, …)
 *     rather than invented per call site. That is what makes "show me every
 *     failure in the payment step for hotel X" a query instead of a grep.
 *  2. No guest PII. The SDK runs with `sendDefaultPii: false`; this module adds
 *     a second, explicit layer that redacts obviously personal keys even if a
 *     call site passes them by mistake.
 *  3. Non-throwing failures still get reported. Large parts of the booking and
 *     payment pipeline deliberately swallow errors to keep a guest checkout
 *     alive. `captureIssue` exists so those paths can stay non-fatal and still
 *     be visible.
 */

import * as Sentry from "@sentry/nextjs";

/** Subsystem the failure belongs to. Kept small on purpose — it is a facet. */
export type RoomlineScope =
  | "paystack-webhook"
  | "payments"
  | "booking-funnel"
  | "server-action"
  | "supabase"
  | "notifications"
  | "rate-limit"
  | "realtime"
  | "proxy"
  | "client";

/** Booking funnel stage, so a broken checkout can be located by step. */
export type BookingFunnelStep =
  | "search"
  | "hold"
  | "confirm"
  | "payment_init"
  | "payment_verify"
  | "payment_webhook";

type SentryLevel = "fatal" | "error" | "warning" | "info";

export type CaptureMeta = {
  scope: RoomlineScope;
  step?: BookingFunnelStep;
  /** Opaque internal ids — safe to tag, and the main way to scope a search. */
  hotelId?: string | null;
  orgId?: string | null;
  bookingId?: string | null;
  /** Booking or Paystack reference. An opaque handle, not guest PII. */
  reference?: string | null;
  role?: string | null;
  /** Extra searchable tags. Values are stringified and truncated to 200 chars. */
  tags?: Record<string, string | number | boolean | null | undefined>;
  /** Debug payloads. Not searchable, and PII-scrubbed before sending. */
  contexts?: Record<string, Record<string, unknown>>;
  /** Overrides grouping. Include "{{ default }}" to refine rather than replace. */
  fingerprint?: string[];
  level?: SentryLevel;
};

/** Sentry truncates tag values at 200 characters; do it here so it is visible. */
const TAG_VALUE_LIMIT = 200;
const CONTEXT_STRING_LIMIT = 500;

/**
 * Bounds for the recursive scrubber. A context is a debug aid, not a data dump:
 * without these, one `error.details` blob holding a full row set could dominate
 * the event payload (Sentry drops events over ~1 MB outright) and walking a
 * cyclic object would not terminate.
 */
const MAX_SCRUB_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 50;

/**
 * Keys whose values must never reach Sentry. This is a backstop: call sites are
 * expected not to pass guest identity in the first place.
 */
const PII_KEY_PATTERN =
  /(email|phone|mobile|first_?name|last_?name|full_?name|guest_?name|customer_?name|address|postcode|zip|card|pan|cvv|cvc|authorization|auth_?code|token|secret|password|api_?key)/i;

/**
 * Value-level backstop for context strings.
 *
 * Postgres error text is the usual way PII escapes: a unique-violation on
 * `guests(hotel_id, email)` reports `Key (hotel_id, email)=(…, guest@example.com)
 * already exists`, under the innocuous key `details`. Key-based redaction cannot
 * see that, so email addresses and long digit runs (phone, account, card) are
 * stripped from the value as well.
 *
 * Applied to contexts only, never to tags. That exemption is load-bearing here:
 * `generate_booking_reference` returns a bare 13-digit OTA-style number, so a
 * booking reference is itself a long digit run. Redacting tag values would erase
 * the one handle support needs to find a guest's reservation.
 */
const EMAIL_VALUE_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_DIGIT_RUN_PATTERN = /\d{7,}/g;

function redactValue(value: string): string {
  return value
    .replace(EMAIL_VALUE_PATTERN, "[email]")
    .replace(LONG_DIGIT_RUN_PATTERN, "[digits]");
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

/**
 * Recursively redacts a value tree.
 *
 * Depth matters: the payloads worth attaching are nested (`{ supabase: { details
 * } }`, a parsed request body, a Paystack response fragment), so a scrubber that
 * only inspects top-level keys and top-level strings would let
 * `{ guest: { email } }` through untouched — exactly the shape a call site is
 * most likely to pass by mistake.
 *
 * Depth, array length and key count are all bounded, which also makes cyclic
 * input safe.
 */
function scrubValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return redactValue(truncate(value, CONTEXT_STRING_LIMIT));
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  // Functions and symbols do not serialise; a class instance's methods would
  // otherwise show up as nulls.
  if (typeof value === "function" || typeof value === "symbol") return "[omitted]";

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: redactValue(value.message) };
  }

  if (depth >= MAX_SCRUB_DEPTH) return "[truncated: max depth]";

  if (Array.isArray(value)) {
    const items: unknown[] = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => scrubValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`);
    }
    return items;
  }

  if (typeof value === "object") {
    return scrubRecord(value as Record<string, unknown>, depth + 1);
  }

  return value;
}

function scrubRecord(
  input: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const entries = Object.entries(input);

  for (const [key, value] of entries.slice(0, MAX_OBJECT_KEYS)) {
    if (PII_KEY_PATTERN.test(key)) {
      output[key] = value === null || value === undefined ? value : "[redacted]";
      continue;
    }
    output[key] = scrubValue(value, depth);
  }

  if (entries.length > MAX_OBJECT_KEYS) {
    output["[truncated]"] = `${entries.length - MAX_OBJECT_KEYS} more keys`;
  }

  return output;
}

function scrubContext(input: Record<string, unknown>): Record<string, unknown> {
  return scrubRecord(input, 0);
}

/**
 * Runs `send` inside an isolated Sentry scope carrying `meta`. Tags set here do
 * not leak into unrelated events on the same request.
 */
function withMeta<T>(meta: CaptureMeta, send: () => T): T {
  return Sentry.withScope((scope) => {
    scope.setLevel(meta.level ?? "error");
    scope.setTag("roomline.scope", meta.scope);

    if (meta.step) scope.setTag("booking.step", meta.step);
    if (meta.hotelId) scope.setTag("hotel.id", meta.hotelId);
    if (meta.orgId) scope.setTag("org.id", meta.orgId);
    if (meta.bookingId) scope.setTag("booking.id", meta.bookingId);
    if (meta.reference) scope.setTag("payment.reference", meta.reference);
    if (meta.role) scope.setTag("staff.role", meta.role);

    for (const [key, value] of Object.entries(meta.tags ?? {})) {
      if (value === null || value === undefined) continue;
      scope.setTag(key, truncate(String(value), TAG_VALUE_LIMIT));
    }

    for (const [key, value] of Object.entries(meta.contexts ?? {})) {
      scope.setContext(key, scrubContext(value));
    }

    if (meta.fingerprint) scope.setFingerprint(meta.fingerprint);

    return send();
  });
}

/**
 * Normalises anything a `catch` can receive into a real `Error`, so Sentry gets
 * a stack and a stable title instead of "Non-Error exception captured".
 *
 * A `code` on the original value becomes the error name, which makes Postgres
 * error codes (`23P01`, `23505`, …) group as distinct issues.
 */
export function toError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string" && value.trim().length > 0) return new Error(value);

  const error = new Error(fallbackMessage);
  if (value && typeof value === "object") {
    const source = value as { message?: unknown; code?: unknown };
    if (typeof source.message === "string" && source.message.length > 0) {
      error.message = `${fallbackMessage}: ${source.message}`;
    }
    if (typeof source.code === "string" && source.code.length > 0) {
      error.name = `Error[${source.code}]`;
    }
  }
  return error;
}

/**
 * Returns a copy of `error` with PII stripped from its message and stack.
 *
 * An exception message is not a context, so `scrubContext` never sees it — yet it
 * is where third-party error text lands. A rejected Paystack response is thrown
 * as `Paystack 400: <body>`, and that body echoes the request, including the
 * guest's email address.
 *
 * The original is returned untouched when nothing matched, and is never mutated:
 * call sites parse `error.message` after reporting (to choose the guest-facing
 * copy), and redaction must not change what the guest is told.
 */
function sanitizeError(error: Error): Error {
  const safeMessage = redactValue(error.message);
  if (safeMessage === error.message) return error;

  const safe = new Error(safeMessage);
  safe.name = error.name;
  // The stack's first line repeats the message, so redact the whole thing rather
  // than reattaching the original.
  safe.stack = error.stack ? redactValue(error.stack) : undefined;
  return safe;
}

/**
 * Reports a thrown error. Use in `catch` blocks, whether or not you rethrow.
 * Returns the Sentry event id, which is worth logging next to a 500 so a support
 * report can be tied to the exact event.
 */
export function captureError(error: unknown, meta: CaptureMeta): string {
  return withMeta(meta, () =>
    Sentry.captureException(
      sanitizeError(toError(error, `Unhandled ${meta.scope} failure`)),
    ),
  );
}

/**
 * Reports a failure that never throws — a swallowed branch, an unexpected state,
 * a downgraded HTTP status. Defaults to `warning` because these are usually
 * "this should not happen but the request continued".
 */
export function captureIssue(message: string, meta: CaptureMeta): string {
  const level = meta.level ?? "warning";
  return withMeta({ ...meta, level }, () => Sentry.captureMessage(message, level));
}

/** Shape shared by PostgrestError and Supabase auth/storage errors. */
export type SupabaseErrorLike = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

/**
 * Reports a Supabase error object. These are plain objects, not `Error`s, so
 * they are invisible to Sentry unless converted — which is how a failed write in
 * an offline-first flow ends up silently discarded.
 *
 * No-ops on a null error, so it can be called straight from a destructured
 * `{ error }` without a guard.
 */
export function captureSupabaseError(
  error: SupabaseErrorLike | null | undefined,
  operation: string,
  meta: Omit<CaptureMeta, "scope"> & { scope?: RoomlineScope },
): string | undefined {
  if (!error) return undefined;

  return captureError(error, {
    ...meta,
    scope: meta.scope ?? "supabase",
    tags: {
      ...meta.tags,
      "db.operation": operation,
      "db.code": error.code ?? "unknown",
    },
    contexts: {
      ...meta.contexts,
      supabase: {
        operation,
        code: error.code ?? null,
        details: error.details ?? null,
        hint: error.hint ?? null,
        message: error.message,
      },
    },
    // Group by operation + Postgres code rather than by message text, which
    // often embeds row ids.
    fingerprint: meta.fingerprint ?? ["supabase", operation, error.code ?? "unknown"],
  });
}

/**
 * Attaches the acting staff member to every subsequent event on this request.
 *
 * Only opaque internal ids and the role are sent — never a name, email or phone
 * number. That is enough to answer "which role hits this error" and "is this one
 * user or everyone" without putting staff identity in the issue stream.
 */
export function identifyStaff(input: {
  staffId?: string | null;
  userId?: string | null;
  role?: string | null;
  hotelId?: string | null;
  orgId?: string | null;
}): void {
  const id = input.staffId ?? input.userId ?? null;
  Sentry.setUser(id ? { id } : null);

  Sentry.setTags({
    ...(input.role ? { "staff.role": input.role } : {}),
    ...(input.hotelId ? { "hotel.id": input.hotelId } : {}),
    ...(input.orgId ? { "org.id": input.orgId } : {}),
  });
}

/**
 * `beforeSend` hook that scrubs stack-frame local variables.
 *
 * Frame locals are attached by the SDK's LocalVariables integration, not by this
 * module, so they never pass through `scrubContext` — and in the booking POST the
 * locals include the parsed guest record (name, email, phone). This is the only
 * place that can reach them.
 *
 * Kept installed even when `includeLocalVariables` is off, so turning the option
 * on for a debugging window cannot silently start shipping guest identity.
 */
export function scrubEventLocalVariables(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (!frame.vars) continue;
      frame.vars = scrubRecord(frame.vars, 0);
    }
  }
  return event;
}

/**
 * Forces pending events out before the response returns.
 *
 * Serverless and edge invocations can be frozen the moment a handler resolves,
 * which drops in-flight events. Call this in webhook and payment handlers, where
 * losing the report defeats the point. Never throws.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Telemetry must never be the reason a payment response fails.
  }
}
