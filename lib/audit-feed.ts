/**
 * lib/audit-feed.ts
 *
 * Server-only reader for the audit trail, paginated in fixed-size PAGE
 * WINDOWS so the UI can render numbered pagination with an exact page count.
 *
 * Pagination model:
 *   - Each call reads one offset page of `AUDIT_PAGE_SIZE` rows, newest
 *     first, ordered by (created_at DESC, id DESC) so simultaneous writes
 *     never reshuffle the pages mid-flight.
 *   - `category` narrows to one filter-menu bucket and `query` to free text.
 *     Both are plain column filters: `audit_logs.category` and
 *     `audit_logs.search_text` are generated columns (migration
 *     20261108094249), so filtering needs no casts and no pattern algebra.
 *   - `total` is the exact count for the current filters — the client turns
 *     it into the page count and the "213 entries" header.
 *   - Rows are enriched with a display reference (booking reference, staff
 *     full name) resolved from the entity id in one batched lookup each.
 *
 * Rows are bucketed by UTC calendar date ("yyyy-MM-dd") on the client, which
 * is deterministic on both server and client regardless of timezone, so
 * hydration never mismatches on the day headers.
 */

import { createClient } from "@/lib/supabase/server";

import {
  AUDIT_PAGE_SIZE,
  type AuditCategoryId,
  type AuditLogRow,
} from "./audit-format";

export interface AuditLogPage {
  rows: AuditLogRow[];
  /** Exact count of entries matching the current filters. */
  total: number;
  hasMore: boolean;
}

export interface AuditLogQuery {
  /** 1-based page number. */
  page: number;
  category?: AuditCategoryId;
  /** Free-text search; empty string disables it. */
  query?: string;
}

const COLUMNS =
  "id, action, category, entity_type, entity_id, staff_name, before_state, after_state, created_at";

/**
 * PostgREST's `or()` syntax reserves commas and parens; strip them from user
 * input so a query like "guest, (cancelled)" cannot break the filter.
 */
function sanitizeQuery(raw: string): string {
  return raw.replace(/[,()]/g, " ").trim().slice(0, 100);
}

/**
 * Fetch one page of audit entries for a hotel.
 * Caller is responsible for authorization (the action applies the role gate).
 */
export async function fetchAuditLogPage(
  hotelId: string,
  { page, category = "all", query = "" }: AuditLogQuery
): Promise<AuditLogPage> {
  const supabase = await createClient();
  const safePage = Math.max(1, Math.floor(page) || 1);
  const offset = (safePage - 1) * AUDIT_PAGE_SIZE;
  const search = sanitizeQuery(query);

  // Filtered rows and the exact total must always agree, so both start from
  // the same (hotel, category, search) predicate.
  const rowsQuery = supabase.from("audit_logs").select(COLUMNS).eq("hotel_id", hotelId);
  const countQuery = supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId);
  for (const q of [rowsQuery, countQuery]) {
    if (category !== "all") q.eq("category", category);
    if (search) q.ilike("search_text", `%${search}%`);
  }

  const [rowsResult, countResult] = await Promise.all([
    rowsQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + AUDIT_PAGE_SIZE - 1),
    countQuery,
  ]);

  if (rowsResult.error) throw new Error(`audit_logs fetch failed: ${rowsResult.error.message}`);
  if (countResult.error) throw new Error(`audit_logs count failed: ${countResult.error.message}`);

  const total = countResult.count ?? 0;
  const rows = await enrichRows((rowsResult.data ?? []) as AuditLogRow[], hotelId);

  return { rows, total, hasMore: offset + rows.length < total };
}

/**
 * Resolve display references for the page's entities: booking rows get their
 * human reference, staff rows the target's full name. Two batched lookups
 * per page — never per row.
 */
async function enrichRows(rows: AuditLogRow[], hotelId: string): Promise<AuditLogRow[]> {
  const bookingIds = rows
    .filter((r) => r.entity_type === "booking" && r.entity_id)
    .map((r) => r.entity_id as string);
  const staffIds = rows
    .filter((r) => r.entity_type === "staff_profile" && r.entity_id)
    .map((r) => r.entity_id as string);

  if (bookingIds.length === 0 && staffIds.length === 0) return rows;

  const refs = new Map<string, string>();
  const supabase = await createClient();

  await Promise.all([
    bookingIds.length
      ? supabase
          .from("bookings")
          .select("id, reference")
          .eq("hotel_id", hotelId)
          .in("id", bookingIds)
          .then(({ data }) => {
            for (const b of data ?? []) {
              if (b.reference) refs.set(b.id, b.reference);
            }
          })
      : Promise.resolve(),
    staffIds.length
      ? supabase
          .from("staff_profiles")
          .select("id, full_name")
          .in("id", staffIds)
          .then(({ data }) => {
            for (const s of data ?? []) {
              if (s.full_name) refs.set(s.id, s.full_name);
            }
          })
      : Promise.resolve(),
  ]);

  if (refs.size === 0) return rows;
  return rows.map((r) =>
    r.entity_id && refs.has(r.entity_id) ? { ...r, entity_ref: refs.get(r.entity_id) } : r
  );
}
