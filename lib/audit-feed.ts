/**
 * lib/audit-feed.ts
 *
 * Server-only reader for the audit trail, paginated in DAY WINDOWS so the
 * UI can render one collapsible section per day and lazy-load older days on
 * scroll instead of fetching the whole log up front.
 *
 * Pagination model:
 *   - Each call reads a WINDOW_DAYS calendar window ending at `cursor`.
 *   - Rows are ordered by (created_at DESC, id DESC) with a keyset cursor
 *     ("<iso>|<uuid>") so no row is ever skipped or duplicated, even when a
 *     window is cut mid-day or two rows share a timestamp.
 *   - Empty windows (no activity that week) are skipped server-side — up to
 *     MAX_EMPTY_WINDOWS hops per call — so a hotel with sparse activity does
 *     not burn client round-trips on empty weeks.
 *
 * Days are bucketed by UTC calendar date ("yyyy-MM-dd"), which is
 * deterministic on both server and client regardless of timezone, so
 * hydration never mismatches on the day headers.
 */

import { createClient } from "@/lib/supabase/server";

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  staff_name: string | null;
  before_state: unknown;
  after_state: unknown;
  created_at: string | null;
}

export interface AuditDayGroup {
  /** UTC calendar date, "yyyy-MM-dd". */
  date: string;
  entries: AuditLogRow[];
}

export interface AuditLogPageData {
  /** Days in this window, newest first; entries within a day newest first. */
  days: AuditDayGroup[];
  /** Opaque keyset cursor for the next call; null when the trail is exhausted. */
  nextCursor: string | null;
  hasMore: boolean;
}

const WINDOW_DAYS = 7;
/** Empty-window hops per call — caps lookback at ~3 months of silence. */
const MAX_EMPTY_WINDOWS = 12;
/** Hard row cap per call; overflow is resumed via the keyset cursor. */
const ROW_LIMIT = 200;

const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const MAX_UUID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const COLUMNS =
  "id, action, entity_type, entity_id, staff_name, before_state, after_state, created_at";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

interface KeysetCursor {
  t: string;
  id: string;
}

function parseCursor(cursor: string | null): KeysetCursor {
  if (!cursor) return { t: new Date().toISOString(), id: MAX_UUID };
  const sep = cursor.lastIndexOf("|");
  const t = sep === -1 ? "" : cursor.slice(0, sep);
  const id = sep === -1 ? "" : cursor.slice(sep + 1);
  if (!t || !id || Number.isNaN(new Date(t).getTime())) {
    throw new Error("Invalid audit log cursor");
  }
  return { t, id };
}

/** UTC day key — stable across every timezone, so SSR and client agree. */
function utcDayKey(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toISOString().slice(0, 10);
}

function groupByUtcDay(rows: AuditLogRow[]): AuditDayGroup[] {
  const days: AuditDayGroup[] = [];
  for (const row of rows) {
    const key = utcDayKey(row.created_at);
    const last = days[days.length - 1];
    if (last && last.date === key) {
      last.entries.push(row);
    } else {
      days.push({ date: key, entries: [row] });
    }
  }
  return days;
}

async function existsBefore(
  supabase: ServerSupabase,
  hotelId: string,
  before: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("hotel_id", hotelId)
    .lt("created_at", before)
    .limit(1);
  if (error) throw new Error(`audit_logs fetch failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Fetch the next window of audit log days for a hotel.
 * Caller is responsible for authorization (role gate lives in the caller).
 */
export async function fetchAuditLogPage(
  hotelId: string,
  cursor: string | null
): Promise<AuditLogPageData> {
  const supabase = await createClient();
  let upper = parseCursor(cursor);

  for (let hop = 0; hop <= MAX_EMPTY_WINDOWS; hop++) {
    const lower = new Date(new Date(upper.t).getTime() - WINDOW_DAYS * DAY_MS).toISOString();

    const { data, error } = await supabase
      .from("audit_logs")
      .select(COLUMNS)
      .eq("hotel_id", hotelId)
      .gte("created_at", lower)
      // Keyset: rows strictly before (upper.t, upper.id) in (created_at, id) order.
      .or(`created_at.lt.${upper.t},and(created_at.eq.${upper.t},id.lt.${upper.id})`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(ROW_LIMIT + 1);

    if (error) throw new Error(`audit_logs fetch failed: ${error.message}`);

    const rows = (data ?? []) as AuditLogRow[];
    const overflow = rows.length > ROW_LIMIT;
    const kept = overflow ? rows.slice(0, ROW_LIMIT) : rows;

    if (kept.length === 0) {
      // Silent week — walk back while older entries exist.
      const hasOlder = await existsBefore(supabase, hotelId, lower);
      if (!hasOlder) return { days: [], nextCursor: null, hasMore: false };
      upper = { t: lower, id: ZERO_UUID };
      continue;
    }

    if (overflow) {
      // Window cut mid-day: resume exactly where we stopped.
      const last = kept[kept.length - 1];
      return {
        days: groupByUtcDay(kept),
        nextCursor: `${last.created_at ?? lower}|${last.id}`,
        hasMore: true,
      };
    }

    const hasOlder = await existsBefore(supabase, hotelId, lower);
    return {
      days: groupByUtcDay(kept),
      // id=ZERO_UUID makes the keyset filter equivalent to created_at < lower.
      nextCursor: hasOlder ? `${lower}|${ZERO_UUID}` : null,
      hasMore: hasOlder,
    };
  }

  // Hit the lookback cap with no rows — hand the walk back to the client so
  // the next scroll continues from where we stopped instead of restarting.
  return { days: [], nextCursor: `${upper.t}|${ZERO_UUID}`, hasMore: true };
}
