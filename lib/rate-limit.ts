import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { captureError } from "@/lib/observability/sentry";

/**
 * Anything that exposes request headers: a route handler's `NextRequest`, or
 * the `headers()` of a server component render.
 */
export type RateLimitRequest = { headers: { get(name: string): string | null } };

/**
 * Rate limiting for public endpoints.
 *
 * Primary path: Upstash Redis (centralized, works across serverless
 * instances). Configure UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 *
 * Fallback path: per-instance in-memory fixed window. Used when the Upstash
 * env vars are absent (local dev) or while an Upstash account is being set
 * up. On multi-instance deployments the fallback's effective limit scales
 * with instance count — treat it as a stopgap, not production hardening.
 *
 * If the Upstash call itself fails (network outage), we fail open and log so
 * a limiter outage never takes booking flow down.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, Bucket>();

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt <= now) memoryBuckets.delete(key);
  }
}

export interface RateLimitOptions {
  /** Logical bucket name, e.g. "booking-create". */
  name: string;
  /** Max requests allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const upstashEnabled = Boolean(redisUrl && redisToken);

// One Ratelimit instance per (bucket, limit, window); instances are cheap but
// each carries its own prefix + limiter config, so cache them.
const limiters = new Map<string, Ratelimit>();

/**
 * Shared in-memory record of identifiers Upstash has already blocked.
 *
 * A blocked identifier is exactly the case that repeats: someone hammering the
 * booking endpoint keeps hitting the same bucket, and without this every one of
 * those requests costs a Redis round trip that can only return "still blocked".
 * With it, the block is answered locally.
 *
 * Declared at module scope on purpose — the SDK caches nothing useful if the Map
 * is created per invocation, which is the documented pitfall.
 */
const ephemeralCache = new Map<string, number>();

/**
 * How long to wait for Upstash before failing open.
 *
 * The SDK default is 5s, which is 5s of a guest staring at a spinner during a
 * Redis brownout before the fail-open path is even reached. A limiter decision is
 * worth ~1s and no more; past that, letting the request through is the cheaper
 * mistake.
 */
const LIMITER_TIMEOUT_MS = 1000;

function getLimiter(name: string, limit: number, windowSeconds: number): Ratelimit {
  const key = `${name}:${limit}:${windowSeconds}`;
  const existing = limiters.get(key);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis: new Redis({ url: redisUrl!, token: redisToken! }),
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: `rl:${name}`,
    ephemeralCache,
    timeout: LIMITER_TIMEOUT_MS,
  });
  limiters.set(key, limiter);
  return limiter;
}

/**
 * Extracts the best-effort client identity from proxy headers.
 * Falls back to a constant when no proxy headers exist (local dev).
 */
export function getClientIp(req: RateLimitRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

function memoryRateLimit(
  req: RateLimitRequest,
  { name, limit, windowSeconds }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const key = `${name}:${getClientIp(req)}`;
  const existing = memoryBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: windowSeconds };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
  };
}

export async function rateLimit(
  req: RateLimitRequest,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  if (!upstashEnabled) return memoryRateLimit(req, options);

  try {
    const { success, remaining, reset } = await getLimiter(
      options.name,
      options.limit,
      options.windowSeconds
    ).limit(getClientIp(req));

    return {
      ok: success,
      remaining,
      retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (err) {
    // Limiter outage must not take the booking funnel down — fail open.
    console.error(`[rate-limit] Upstash unavailable for "${options.name}":`, err);
    reportLimiterOutage(options.name, err);
    return { ok: true, remaining: options.limit - 1, retryAfterSeconds: 60 };
  }
}

/**
 * Reports a limiter outage, at most once per bucket per 5 minutes per instance.
 *
 * Failing open is the right trade for a guest checkout, but it means every public
 * endpoint is unthrottled while it lasts — reference enumeration and repeated
 * Paystack initialisations included — so it must not be silent. The throttle is
 * what keeps an hour-long Upstash outage from turning into one Sentry event per
 * request on a path that allows 60 requests per minute per guest.
 */
const OUTAGE_REPORT_INTERVAL_MS = 5 * 60 * 1000;
const lastOutageReport = new Map<string, number>();

function reportLimiterOutage(name: string, err: unknown): void {
  const now = Date.now();
  const previous = lastOutageReport.get(name) ?? 0;
  if (now - previous < OUTAGE_REPORT_INTERVAL_MS) return;
  lastOutageReport.set(name, now);

  captureError(err, {
    scope: "rate-limit",
    level: "error",
    tags: { "ratelimit.bucket": name, "ratelimit.failed_open": true },
    // One issue for the outage, not one per bucket: the cause is the same store.
    fingerprint: ["rate-limit", "upstash-unavailable"],
  });
}
