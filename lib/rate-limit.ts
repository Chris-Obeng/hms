import { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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

function getLimiter(name: string, limit: number, windowSeconds: number): Ratelimit {
  const key = `${name}:${limit}:${windowSeconds}`;
  const existing = limiters.get(key);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis: new Redis({ url: redisUrl!, token: redisToken! }),
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: `rl:${name}`,
  });
  limiters.set(key, limiter);
  return limiter;
}

/**
 * Extracts the best-effort client identity from proxy headers.
 * Falls back to a constant when no proxy headers exist (local dev).
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

function memoryRateLimit(
  req: NextRequest,
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
  req: NextRequest,
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
    return { ok: true, remaining: options.limit - 1, retryAfterSeconds: 60 };
  }
}
