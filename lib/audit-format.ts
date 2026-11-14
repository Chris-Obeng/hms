/**
 * lib/audit-format.ts
 *
 * Pure display helpers for the audit trail, shared by the server reader
 * (lib/audit-feed.ts) and the client (audit-log-client.tsx). No React, no
 * Supabase — both sides import this freely, so the server filters and the
 * client labels always agree.
 */

export interface AuditLogRow {
  id: string;
  action: string;
  /** Filter-menu bucket, computed by the database (see 20261108094249). */
  category: string;
  entity_type: string | null;
  entity_id: string | null;
  staff_name: string | null;
  before_state: unknown;
  after_state: unknown;
  created_at: string | null;
  /** Display code resolved server-side (booking reference, staff full name). */
  entity_ref?: string | null;
}

export interface AuditDayGroup {
  /** UTC calendar date, "yyyy-MM-dd". */
  date: string;
  entries: AuditLogRow[];
}

/** Rows per page — matches the audit-log page design (5 + 4 + 5). */
export const AUDIT_PAGE_SIZE = 14;

// ── Categories ───────────────────────────────────────────────────────

export type AuditCategoryId =
  | "all"
  | "bookings"
  | "payments"
  | "staff"
  | "rooms"
  | "settings";

export interface AuditCategoryDef {
  id: AuditCategoryId;
  label: string;
}

/**
 * Filter-menu items, in display order. The bucketing itself lives in the
 * database (`audit_logs.category`, migration 20261108094249) so the menu
 * tally, the server filter and the header count can never disagree.
 */
export const AUDIT_CATEGORIES: AuditCategoryDef[] = [
  { id: "all", label: "All actions" },
  { id: "bookings", label: "Bookings" },
  { id: "payments", label: "Payments" },
  { id: "staff", label: "Staff" },
  { id: "rooms", label: "Rooms" },
  { id: "settings", label: "Settings" },
];

/** Narrow a database `category` value to a filter id (rows are untyped strings). */
export function isAuditCategoryId(value: string): value is AuditCategoryId {
  return AUDIT_CATEGORIES.some((c) => c.id === value);
}

// ── Day grouping ─────────────────────────────────────────────────────

/** UTC day key — stable across every timezone, so SSR and client agree. */
function utcDayKey(iso: string | null): string {
  if (!iso) return "unknown";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "unknown" : new Date(t).toISOString().slice(0, 10);
}

/** Flat rows (newest first) → day buckets, preserving order. */
export function groupRowsByUtcDay(rows: AuditLogRow[]): AuditDayGroup[] {
  const days: AuditDayGroup[] = [];
  for (const row of rows) {
    const key = utcDayKey(row.created_at);
    const last = days[days.length - 1];
    if (last && last.date === key) last.entries.push(row);
    else days.push({ date: key, entries: [row] });
  }
  return days;
}

// ── Entry summary line ("Ama Serwaa checked in booking 83855…") ─────

/** Verb phrase per known action. Keys mirror lib/audit.ts AuditAction. */
const ACTION_PHRASES: Record<string, string> = {
  "booking.created": "created booking",
  "booking.confirmed": "confirmed booking",
  "booking.cancelled": "cancelled booking",
  "booking.checked_in": "checked in booking",
  "booking.checked_out": "checked out booking",
  "booking.early_checkout": "checked out early on booking",
  "booking.notes_updated": "updated notes on booking",
  "booking.status_changed": "changed booking status",
  "booking.move": "moved booking",
  "booking.room_assigned": "assigned a room to booking",
  "booking.room_unassigned": "unassigned the room on booking",
  "booking.room_type_change": "changed room type on booking",
  "booking.aborted_unpaid": "aborted unpaid booking",
  "payment.recorded": "recorded payment on booking",
  "payment.refunded": "refunded booking",
  "hotel.settings_updated": "updated hotel settings",
  "hotel.paystack_configured": "configured Paystack",
  "room.block_created": "created a room block",
  "room.block_updated": "updated a room block",
  "room.block_deleted": "removed a room block",
  "room.status_changed": "changed room status",
  "room.note_updated": "updated room notes",
  "room.updated": "updated room",
  "night_audit.completed": "completed night audit",
};

/** Staff actions act on another person, phrased with the target's name. */
const STAFF_ACTION_PHRASES: Record<string, (target: string) => string> = {
  "staff.approved": (t) => `approved ${t}`,
  "staff.rejected": (t) => `rejected ${t}`,
  "staff.deactivated": (t) => `deactivated ${t}`,
  "staff.reactivated": (t) => `reactivated ${t}`,
  "staff.role_changed": (t) => `changed ${t}'s role`,
};

/** Rate actions read better with the object named ("created rate season"). */
const RATE_ACTION_PHRASES: Record<string, string> = {
  season_created: "created rate season",
  season_updated: "updated rate season",
  season_duplicated: "duplicated rate season",
  season_deleted: "deleted rate season",
  season_override_upserted: "updated season override",
  daily_override_upserted: "updated daily rate override",
  daily_override_deleted: "deleted daily rate override",
  daily_override_bulk_upserted: "bulk-updated daily rate overrides",
  daily_override_bulk_deleted: "bulk-deleted daily rate overrides",
  plan_created: "created rate plan",
  plan_updated: "updated rate plan",
  restriction_upserted: "updated rate restriction",
  restriction_overridden: "overrode rate restriction",
};

/** "room.block_created" → "block created" — readable fallback for unknowns. */
function humanizeAction(action: string): string {
  return action.replace(/[._]/g, " ").trim();
}

export interface AuditSummary {
  actor: string;
  verb: string;
  /** Booking reference shown as the trailing mono code, when known. */
  ref: string | null;
}

export function auditSummary(row: AuditLogRow): AuditSummary {
  const actor = row.staff_name?.trim() || "System";
  const target = row.entity_ref?.trim() || null;

  let verb: string;
  if (row.action.startsWith("staff.")) {
    const phrase = STAFF_ACTION_PHRASES[row.action];
    verb = target
      ? (phrase ?? ((t) => `updated ${t}`))(target)
      : phrase
        ? phrase("a staff member")
        : humanizeAction(row.action);
  } else if (row.action.startsWith("rate.")) {
    verb = RATE_ACTION_PHRASES[row.action.slice("rate.".length)] ?? humanizeAction(row.action);
  } else {
    verb = ACTION_PHRASES[row.action] ?? humanizeAction(row.action);
  }

  // Trailing code is the booking reference for booking-entity rows.
  const ref = row.entity_type === "booking" ? (target ?? null) : null;
  return { actor, verb, ref };
}

// ── Meta line ("amount: 450 · method: \"cash\"") ─────────────────────

/** Fields worth surfacing, in display order. Anything else follows alphabetically. */
const META_PRIORITY = [
  "status",
  "reference",
  "amount",
  "method",
  "reason",
  "role",
  "source",
  "room_type",
  "nights",
  "check_in",
  "check_out",
  "nights_released",
  "early_departure_fee",
  "block_range",
  "notes",
  "folio",
  "is_active",
  "date",
  "occupancyRate",
  "totalPayments",
  "roomRevenue",
];

/** Internal bookkeeping keys never shown in the meta line. */
const META_SKIP =
  /(^|_)(id|ids)$|_id$|_ids$|_at$|^currency$|^payment_preference$|^type_changed$|^nights_kept$/;

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function formatMetaValue(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    const s = v.length > 28 ? `${v.slice(0, 27)}…` : v;
    return `"${s}"`;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null; // nested objects/arrays are too noisy for one line
}

function statePairs(state: unknown): [string, unknown][] {
  if (!isPlainObject(state)) return [];
  return Object.entries(state).filter(
    ([k, v]) => !META_SKIP.test(k) && formatMetaValue(v) !== null && !UUID_LIKE.test(String(v))
  );
}

/**
 * One mono line of `key: value` pairs for an entry — up to three, preferring
 * changed fields (shown as `key: "before" → "after"`), then after-state fields.
 */
export function auditMeta(row: AuditLogRow): string | null {
  const before = statePairs(row.before_state);
  const after = statePairs(row.after_state);
  // The booking reference already leads the entry line; don't repeat it here.
  const shownRef = row.entity_type === "booking" ? (row.entity_ref?.trim() ?? null) : null;

  const diffs: { key: string; from: string; to: string }[] = [];
  const singles: { key: string; value: string }[] = [];
  for (const [k, v] of after) {
    const text = formatMetaValue(v);
    if (!text) continue;
    if (k === "reference" && shownRef && String(v).trim() === shownRef) continue;
    const prev = before.find(([key]) => key === k);
    const prevText = prev ? formatMetaValue(prev[1]) : null;
    if (prev && prevText && prev[1] !== v) {
      diffs.push({ key: k, from: prevText, to: text });
    } else if (!prev && k !== "status" && !(k === "is_active" && row.action.startsWith("staff."))) {
      // A bare status is the verb already ("checked out"); only its
      // transition carries extra meaning, so it is shown as a diff only.
      singles.push({ key: k, value: text });
    }
  }

  const rank = (key: string) => {
    const i = META_PRIORITY.indexOf(key);
    return i === -1 ? META_PRIORITY.length : i;
  };
  const pairs: string[] = [
    ...diffs
      .sort((a, b) => rank(a.key) - rank(b.key))
      .map((d) => `${d.key}: ${d.from} → ${d.to}`),
    ...singles
      .sort((a, b) => rank(a.key) - rank(b.key))
      .map((s) => `${s.key}: ${s.value}`),
  ].slice(0, 3);

  return pairs.length > 0 ? pairs.join(" · ") : null;
}

// ── Time ─────────────────────────────────────────────────────────────

/**
 * "HH:mm" in UTC — pairs with the UTC day buckets, and renders identically
 * on server and client so the first paint never fights hydration.
 */
export function auditTime(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(11, 16);
}
