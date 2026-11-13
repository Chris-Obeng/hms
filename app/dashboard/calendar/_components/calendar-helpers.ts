/** Statuses that never occupy a room. Shared by the timeline, auto-assign and
 *  drop validation so the taxonomy evolves in exactly one place. */
export const TERMINAL_BOOKING_STATUSES = ["cancelled", "checked_out", "no_show"] as const;
export const TERMINAL_BOOKING_STATUS_SET: ReadonlySet<string> = new Set(TERMINAL_BOOKING_STATUSES);

/** Room states that cannot take bookings (row hatching, drop/create guards). */
export const NON_BOOKABLE_ROOM_STATUSES: ReadonlySet<string> = new Set(["maintenance", "out_of_service"]);

export function isManualLikeSource(source: string | null | undefined): boolean {
  return source === "manual" || source === "phone" || source === "walk_in";
}

/** Bar color is keyed by lifecycle status, never source — the front desk
 *  scans the rack by "arriving / in-house / departed", and coloring confirmed
 *  bookings by source used to make manual-green collide with in-house-green.
 *  The key maps to a CSS token set in calendar.css. */
export type BookingStatusKey =
  | "confirmed"
  | "inhouse"
  | "checkout"
  | "pending"
  | "cancelled"
  | "noshow";

export function getBookingStatusKey(status: string): BookingStatusKey {
  switch (status) {
    case "checked_in":
      return "inhouse";
    case "checked_out":
      return "checkout";
    case "cancelled":
      return "cancelled";
    case "no_show":
      return "noshow";
    case "pending":
      return "pending";
    case "confirmed":
    default:
      return "confirmed";
  }
}

/** Accent stripe for grouped (multi-room) reservations. Additive only — it
 *  never replaces the status/source bar color; it marks that sibling bars
 *  belong to ONE reservation so front-desk reads them as a set. A stable hash
 *  of the group id picks a hue, so every sibling gets the same stripe without
 *  server coordination. */
const GROUP_ACCENTS = [
  "#E11D48", // rose
  "#D97706", // amber
  "#7C3AED", // violet
  "#0891B2", // cyan
  "#4F46E5", // indigo
  "#DB2777", // pink
  "#0D9488", // teal
  "#CA8A04", // gold
] as const;

export function groupAccent(groupId: string | null | undefined): string | null {
  if (!groupId) return null;
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = (hash * 31 + groupId.charCodeAt(i)) | 0;
  }
  return GROUP_ACCENTS[Math.abs(hash) % GROUP_ACCENTS.length];
}

/** Operational zoom levels — nothing below a week: hotel planning happens
 *  in week-plus horizons, and sub-week views only added dropdown noise. */
export const VIEW_PRESETS = [
  { label: "Week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "Month", days: 30 },
] as const;

/** Days of past context rendered before the business date, so the timeline
 *  opens anchored on today while previous dates stay one scroll away — no
 *  date-picker round trip. Capped at half the view so the narrowest preset
 *  (Week) keeps today inside the window. */
export const PAST_LEAD_MAX_DAYS = 7;
export function pastLeadDays(viewDays: number): number {
  return Math.min(PAST_LEAD_MAX_DAYS, Math.floor(viewDays / 2));
}

export type ViewPreset = (typeof VIEW_PRESETS)[number]["label"];

export interface LegendItem {
  label: string;
  /** Matches `.rl-legend-swatch[data-swatch]` in calendar.css. */
  swatch: BookingStatusKey | "closure";
}

export const CALENDAR_LEGEND: LegendItem[] = [
  { label: "Confirmed", swatch: "confirmed" },
  { label: "In house", swatch: "inhouse" },
  { label: "Pending", swatch: "pending" },
  { label: "Checked out", swatch: "checkout" },
  { label: "Cancelled", swatch: "cancelled" },
  { label: "No-show", swatch: "noshow" },
  { label: "Blocked dates", swatch: "closure" },
];

export const BLOCK_REASONS = [
  { value: "maintenance", label: "Maintenance" },
  { value: "deep_cleaning", label: "Deep Cleaning" },
  { value: "owner_use", label: "Owner Use" },
  { value: "renovation", label: "Renovation" },
  { value: "other", label: "Other" },
] as const;

/** Display labels keyed by stored reason value. Includes the legacy values
 *  (`cleaning`, `hold`) written by older clients, so historic rows still
 *  render a friendly label instead of raw text. */
export const BLOCK_REASON_LABELS: Record<string, string> = {
  ...Object.fromEntries(BLOCK_REASONS.map(({ value, label }) => [value, label])),
  cleaning: "Deep cleaning",
  hold: "Operational hold",
};
