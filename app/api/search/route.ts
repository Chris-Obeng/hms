import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth, AuthError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  escapeFilterTerm,
  type SearchGroup,
  type SearchHit,
  type SearchResponse,
} from "@/lib/search";

/**
 * GET /api/search?q=<term> — global dashboard search (staff only).
 *
 * Route handler (not a server action) so the client can cancel in-flight
 * requests via AbortController and so it can be IP rate-limited.
 *
 * Multi-tenancy: authenticates, resolves the caller's own hotel from Clerk,
 * and scopes every query to it. Uses the RLS-bound createClient() (never
 * supabaseAdmin) as defence-in-depth. Returns only the fields the panel
 * renders — no email, no payment data, no full records.
 */

const PER_GROUP = 5;
const FETCH = PER_GROUP + 1;

const BOOKING_SELECT =
  "id, reference, check_in, check_out, status, guests:guest_id(full_name), rooms:room_id(room_number), room_types:room_type_id(name)";

function firstRel<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a `YYYY-MM-DD` date string as "Sep 25" without a timezone shift. */
function fmtDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const rl = await rateLimit(req, {
      name: "global-search",
      limit: 60,
      windowSeconds: 10,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many searches. Please slow down." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const raw = req.nextUrl.searchParams.get("q") ?? "";
    const parsed = z.string().trim().min(1).max(100).safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ query: "", groups: [] } satisfies SearchResponse);
    }
    const q = parsed.data;
    const safeQ = escapeFilterTerm(q);
    if (!safeQ) {
      return NextResponse.json({ query: q, groups: [] } satisfies SearchResponse);
    }

    const ctx = await requireAuth();
    const supabase = await createClient();
    const hotelId = ctx.hotelId;
    const like = `%${safeQ}%`;

    // Phase 1: the three independent lookups run together.
    const [guestsRes, bookingsByRefRes, roomsRes] = await Promise.all([
      supabase
        .from("guests")
        .select("id, full_name, phone")
        .eq("hotel_id", hotelId)
        .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
        .limit(FETCH),
      supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("hotel_id", hotelId)
        .ilike("reference", like)
        .limit(FETCH),
      supabase
        .from("rooms")
        .select("id, room_number, status, room_types:room_type_id(name)")
        .eq("hotel_id", hotelId)
        .ilike("room_number", like)
        .limit(FETCH),
    ]);

    const guestRows = guestsRes.data ?? [];

    // Phase 2: bookings belonging to a matched guest, so a name search still
    // surfaces that guest's bookings (preserves the prior palette behaviour).
    const bookingRows = [...(bookingsByRefRes.data ?? [])];
    if (guestRows.length > 0) {
      const byGuest = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("hotel_id", hotelId)
        .in(
          "guest_id",
          guestRows.map((g) => g.id)
        )
        .limit(FETCH);
      if (byGuest.data) bookingRows.push(...byGuest.data);
    }

    const groups: SearchGroup[] = [];

    // Guests
    if (guestRows.length > 0) {
      const items: SearchHit[] = guestRows.slice(0, PER_GROUP).map((g) => ({
        id: `guest-${g.id}`,
        type: "guest",
        label: g.full_name,
        subLabel: g.phone || "No phone",
        url: `/dashboard/customers?guestId=${g.id}`,
      }));
      groups.push({
        type: "guest",
        items,
        hasMore: guestRows.length > PER_GROUP,
        seeAllUrl: `/dashboard/customers?search=${encodeURIComponent(q)}`,
      });
    }

    // Bookings (deduped by id; reference matches keep their leading position)
    const seenBooking = new Set<string>();
    const uniqueBookings = bookingRows.filter((b) => {
      if (seenBooking.has(b.id)) return false;
      seenBooking.add(b.id);
      return true;
    });
    if (uniqueBookings.length > 0) {
      const items: SearchHit[] = uniqueBookings.slice(0, PER_GROUP).map((b) => {
        const guest = firstRel(b.guests)?.full_name ?? "";
        const room = firstRel(b.rooms)?.room_number ?? "";
        const type = firstRel(b.room_types)?.name ?? "";
        const roomBit = [type, room ? `Rm ${room}` : ""].filter(Boolean).join(" ");
        const parts = [
          guest,
          roomBit,
          `${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}`,
          b.status ? titleCase(b.status) : "",
        ].filter(Boolean);
        return {
          id: `booking-${b.id}`,
          type: "booking",
          label: `#${b.reference}`,
          subLabel: parts.join(" · "),
          url: `/dashboard/bookings/${b.id}`,
        };
      });
      groups.push({
        type: "booking",
        items,
        hasMore: uniqueBookings.length > PER_GROUP,
        seeAllUrl: `/dashboard/bookings?search=${encodeURIComponent(q)}`,
      });
    }

    // Rooms
    const roomRows = roomsRes.data ?? [];
    if (roomRows.length > 0) {
      const items: SearchHit[] = roomRows.slice(0, PER_GROUP).map((r) => {
        const type = firstRel(r.room_types)?.name ?? "";
        return {
          id: `room-${r.id}`,
          type: "room",
          label: `Room ${r.room_number}`,
          subLabel: [type, r.status ? titleCase(r.status) : ""].filter(Boolean).join(" · "),
          url: `/dashboard/rooms?search=${encodeURIComponent(r.room_number)}`,
        };
      });
      groups.push({
        type: "room",
        items,
        hasMore: roomRows.length > PER_GROUP,
        seeAllUrl: `/dashboard/rooms?search=${encodeURIComponent(q)}`,
      });
    }

    return NextResponse.json({ query: q, groups } satisfies SearchResponse);
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "UNAUTHENTICATED" ? 401 : err.code === "HOTEL_NOT_FOUND" ? 404 : 403;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("[api/search] unexpected error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
