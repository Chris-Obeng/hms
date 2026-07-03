/**
 * lib/beds24.ts
 * Beds24 API V2 integration.
 *
 * Auth: API V2 uses token-based auth.
 * Header format: "token: {token}"
 * Tokens expire after 24h. Use refresh tokens to get new ones.
 * Long-life tokens never expire (90 days unused = expire).
 *
 * For HotelOS: we store the long-life token in hotels.beds24_api_key.
 * Long-life tokens have read-only access by default.
 * For write access (pushing inventory), a refresh-token-generated token is needed.
 * Store beds24_refresh_token in hotels table for Growth/Pro hotels.
 *
 * Docs: https://wiki.beds24.com/index.php/Category:API_V2
 * Swagger: https://beds24.com/api/v2/
 */

const BEDS24_BASE = "https://beds24.com/api/v2";

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
 */
export async function pushAvailability(
  config: Beds24Config,
  blocks: Beds24AvailabilityBlock[]
): Promise<Beds24SyncResult> {
  if (!config.token) return { success: false, error: "Beds24 token not configured" };
  if (!blocks.length) return { success: true };

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
 */
export async function testBeds24Connection(
  token: string
): Promise<{ success: true; propertyCount: number } | { success: false; error: string }> {
  try {
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
