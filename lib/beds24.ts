/**
 * lib/beds24.ts
 * Beds24 API V2 integration.
 *
 * ── Auth model ────────────────────────────────────────────────────
 * HotelOS uses ONE master Beds24 account for all hotels.
 * Each hotel is a separate property under that account.
 *
 * Credentials live in environment variables (never per-hotel DB rows):
 *   BEDS24_REFRESH_TOKEN  — long-lived, used to generate 24h access tokens
 *   BEDS24_API_TOKEN      — current 24h access token (seeded at deploy, auto-refreshed)
 *
 * Per-hotel DB columns:
 *   hotels.beds24_property_id  — the Beds24 property ID for this hotel
 *   beds24_property_mappings   — maps HotelOS room_type_id → beds24_room_id
 *
 * Token refresh: call getMasterToken() from server actions — it caches the
 * active token in-process for its remaining lifetime and auto-refreshes when
 * it expires. No per-request token fetch.
 *
 * Rate Limiting: Bed24 enforces 100 credits per rolling 5-minute window.
 * All API calls are tracked via bed24RateLimiter to prevent exceeding limits.
 *
 * Docs:    https://wiki.beds24.com/index.php/Category:API_V2
 * Swagger: https://beds24.com/api/v2/
 */

import { bed24RateLimiter, OPERATION_COSTS } from "./bed24-rate-limiter";

const BEDS24_BASE = "https://beds24.com/api/v2";

// ── Master token cache ────────────────────────────────────────────
// In-process cache so we don't call the refresh endpoint on every request.
// Refreshes automatically when the token has less than 5 minutes remaining.

type TokenCache = { token: string; expiresAt: number };
let _tokenCache: TokenCache | null = null;

/**
 * Get the current master access token for the HotelOS Beds24 account.
 * Reads BEDS24_API_TOKEN / BEDS24_REFRESH_TOKEN from env.
 * Auto-refreshes using the refresh token when the cached token is near expiry.
 *
 * Call this from server actions instead of using per-hotel tokens.
 */
export async function getMasterToken(): Promise<string> {
  const now = Date.now();
  const FIVE_MINUTES = 5 * 60 * 1000;

  // Return cached token if still valid with 5-min buffer
  if (_tokenCache && _tokenCache.expiresAt - now > FIVE_MINUTES) {
    return _tokenCache.token;
  }

  const refreshToken = process.env.BEDS24_REFRESH_TOKEN;
  const envToken = process.env.BEDS24_API_TOKEN;

  // If we have a refresh token, use it to get a fresh access token
  if (refreshToken) {
    const result = await refreshAccessToken(refreshToken);
    if (result.success) {
      _tokenCache = {
        token: result.token,
        expiresAt: now + result.expiresIn * 1000,
      };
      return result.token;
    }
    // Fall through to env token if refresh fails
  }

  // Fall back to the static env token (long-life token or manually set)
  if (envToken) {
    // Cache with 23h lifetime (long-life tokens are essentially permanent,
    // but we re-read env every 23h to pick up manual rotations)
    _tokenCache = {
      token: envToken,
      expiresAt: now + 23 * 60 * 60 * 1000,
    };
    return envToken;
  }

  throw new Error(
    "Beds24 not configured — set BEDS24_REFRESH_TOKEN and BEDS24_API_TOKEN in environment variables"
  );
}

/**
 * Check whether the master Beds24 credentials are configured in env.
 * Does NOT make a network call — just checks env vars are present.
 */
export function isBeds24Configured(): boolean {
  return !!(process.env.BEDS24_REFRESH_TOKEN || process.env.BEDS24_API_TOKEN);
}

// ── Types ─────────────────────────────────────────────────────────

export interface Beds24Config {
  /** Long-life token or short-life access token. Stored as beds24_api_key. */
  token: string;
  /** Refresh token to generate new access tokens. Stored as beds24_refresh_token. */
  refreshToken?: string | null;
}

export interface Beds24AvailabilityBlock {
  /** Beds24 room ID (integer) from beds24_property_mappings.beds24_room_id */
  roomId: number | string;
  /** YYYY-MM-DD inclusive start date */
  from: string;
  /** YYYY-MM-DD inclusive end date (last night, NOT checkout day) */
  to: string;
  /**
   * availability: number of available units for the date range.
   * 0 = fully blocked/closed. Positive = available count.
   */
  availability: number;
}

export interface Beds24SyncResult {
  success: boolean;
  error?: string;
}

export interface Beds24TokenResponse {
  token: string;
  expiresIn: number;
  refreshToken?: string;
}

// ── Token refresh ─────────────────────────────────────────────────

/**
 * Get a fresh access token from a refresh token.
 * Tokens expire after 24h; refresh tokens last 30 days from last use.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ success: true; token: string; expiresIn: number } | { success: false; error: string }> {
  try {
    // Record rate limit (1 credit for token refresh)
    bed24RateLimiter.recordKnownOperation("TOKEN_REFRESH");
    
    const res = await fetch(`${BEDS24_BASE}/authentication/token`, {
      method: "GET",
      headers: { accept: "application/json", refreshToken },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, error: `Token refresh failed (${res.status}): ${text}` };
    }
    const data = (await res.json()) as Beds24TokenResponse;
    return { success: true, token: data.token, expiresIn: data.expiresIn };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Token refresh failed" };
  }
}

/**
 * Exchange an invite code for a refresh token + initial access token.
 * Done once during hotel onboarding by HotelOS staff.
 */
export async function setupFromInviteCode(
  inviteCode: string
): Promise<{ success: true; token: string; refreshToken: string; expiresIn: number } | { success: false; error: string }> {
  try {
    const res = await fetch(`${BEDS24_BASE}/authentication/setup`, {
      method: "GET",
      headers: { accept: "application/json", code: inviteCode },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, error: `Setup failed (${res.status}): ${text}` };
    }
    const data = (await res.json()) as Beds24TokenResponse;
    if (!data.refreshToken) {
      return { success: false, error: "No refresh token returned — check invite code scopes" };
    }
    return { success: true, token: data.token, refreshToken: data.refreshToken, expiresIn: data.expiresIn };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Setup failed" };
  }
}

// ── Core HTTP helper ──────────────────────────────────────────────

async function beds24Fetch(
  token: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const res = await fetch(`${BEDS24_BASE}${path}`, {
    method,
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      token, // Beds24 V2 auth header: "token: {token}"
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data, text };
}

// ── Push availability (outbound sync) ────────────────────────────

/**
 * Push availability updates to Beds24 via POST /inventory/rooms/calendar.
 *
 * Payload shape per Beds24 docs:
 * [{ roomId: 1234567, calendar: [{ from: "2025-01-01", to: "2025-01-31", availability: 0 }] }]
 *
 * Called after: booking confirmed, booking cancelled, availability block created/deleted.
 *
 * NOTE: Beds24 recommends caching and batching — avoid calling per-booking in high volume.
 * For MVP (low volume), per-event is fine.
 * 
 * Rate Limit: 5 credits per room
 */
export async function pushAvailability(
  config: Beds24Config,
  blocks: Beds24AvailabilityBlock[]
): Promise<Beds24SyncResult> {
  if (!config.token) return { success: false, error: "Beds24 token not configured" };
  if (!blocks.length) return { success: true };

  // Check rate limit (5 credits per room)
  const cost = blocks.length * OPERATION_COSTS.AVAILABILITY_PUSH_PER_ROOM;
  if (!bed24RateLimiter.canProceed(cost)) {
    const status = bed24RateLimiter.getStatus();
    const resetMinutes = Math.ceil(status.resetsIn / 60000);
    return {
      success: false,
      error: `Rate limit: ${cost} credits needed, ${status.remaining} available. Resets in ${resetMinutes}m.`,
    };
  }

  const payload = blocks.map((b) => ({
    roomId: Number(b.roomId),
    calendar: [
      {
        from: b.from,
        to: b.to,
        availability: b.availability,
      },
    ],
  }));

  try {
    // Record rate limit BEFORE making the request
    bed24RateLimiter.recordRequest("availability_push", cost);
    
    const result = await beds24Fetch(config.token, "POST", "/inventory/rooms/calendar", payload);

    if (!result.ok) {
      return { success: false, error: `Beds24 inventory push failed (${result.status}): ${result.text}` };
    }

    // Beds24 returns array of results, check for errors
    if (Array.isArray(result.data)) {
      const failed = (result.data as { success: boolean; errors?: { message: string }[] }[]).filter(
        (r) => !r.success
      );
      if (failed.length > 0) {
        const msg = failed.map((f) => f.errors?.[0]?.message ?? "Unknown error").join(", ");
        return { success: false, error: `Beds24 sync errors: ${msg}` };
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Beds24 push failed" };
  }
}

// ── Test connection ───────────────────────────────────────────────

/**
 * Test the Beds24 connection by calling GET /properties.
 * Returns property count if successful.
 * 
 * Rate Limit: 2 credits for property fetch
 */
export async function testBeds24Connection(
  token: string
): Promise<{ success: true; propertyCount: number } | { success: false; error: string }> {
  try {
    // Check rate limit (2 credits for property fetch)
    if (!bed24RateLimiter.canProceed(OPERATION_COSTS.PROPERTY_FETCH)) {
      const status = bed24RateLimiter.getStatus();
      const resetMinutes = Math.ceil(status.resetsIn / 60000);
      return {
        success: false,
        error: `Rate limit: ${OPERATION_COSTS.PROPERTY_FETCH} credits needed, ${status.remaining} available. Resets in ${resetMinutes}m.`,
      };
    }
    
    // Record rate limit BEFORE making the request
    bed24RateLimiter.recordKnownOperation("PROPERTY_FETCH");
    
    const result = await beds24Fetch(token, "GET", "/properties");

    if (!result.ok) {
      return {
        success: false,
        error: `Connection failed (${result.status}) — check your token is valid and has the 'properties' scope`,
      };
    }

    const data = result.data as { data?: unknown[] } | unknown[];
    const items = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data ?? [];
    return { success: true, propertyCount: items.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

// ── Force full sync ───────────────────────────────────────────────

/**
 * Push current room count as availability for all mapped rooms for the next 6 months.
 * Per Beds24 docs, cache availability at your side and sync ~every 6 hours or on change.
 */
export async function forceFullSync(
  config: Beds24Config,
  roomAvailability: Array<{
    beds24RoomId: number | string;
    from: string;
    to: string;
    availability: number;
  }>
): Promise<Beds24SyncResult> {
  return pushAvailability(
    config,
    roomAvailability.map((r) => ({
      roomId: r.beds24RoomId,
      from: r.from,
      to: r.to,
      availability: r.availability,
    }))
  );
}

// ── Date helpers ──────────────────────────────────────────────────

/**
 * Convert a booking's check_in/check_out to the availability range Beds24 expects.
 * Beds24 "from"/"to" are inclusive — last occupied night is (checkout - 1 day).
 */
export function bookingToAvailabilityRange(
  checkIn: string,
  checkOut: string
): { from: string; to: string } {
  const out = new Date(checkOut);
  out.setUTCDate(out.getUTCDate() - 1);
  return {
    from: checkIn,
    to: out.toISOString().split("T")[0],
  };
}

// ── Beds24 webhook booking payload type ──────────────────────────

/**
 * Beds24 V2 booking webhook payload fields (key fields only).
 * Full schema: https://beds24.com/api/v2/#/Webhooks/postWebhooks___bookings
 *
 * Note: Beds24 sends the full booking object. We only map what we need.
 */
export interface Beds24BookingWebhookPayload {
  id?: number;                  // Beds24 booking ID
  propId?: number;              // Beds24 property ID
  roomId?: number;              // Beds24 room ID
  firstNight?: string;          // YYYY-MM-DD (check-in)
  lastNight?: string;           // YYYY-MM-DD (last occupied night — checkout is lastNight + 1)
  numAdult?: number;
  numChild?: number;
  price?: number;               // Total price
  guestFirstName?: string;
  guestLastName?: string;
  guestEmail?: string;
  guestPhone?: string;
  status?: number;              // 0=new, 1=request, -1=cancelled
  apiSourceId?: string;         // Source OTA (e.g. "Booking.com")
  externalId?: string;          // OTA's booking reference
  referer?: string;
  checkoutDate?: string;        // YYYY-MM-DD — actual checkout date (lastNight + 1)
}
