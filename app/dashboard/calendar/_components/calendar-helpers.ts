/** Statuses that never occupy a room. Shared by the timeline, auto-assign and
 *  drop validation so the taxonomy evolves in exactly one place. */
export const TERMINAL_BOOKING_STATUSES = ["cancelled", "checked_out", "no_show"] as const;
export const TERMINAL_BOOKING_STATUS_SET: ReadonlySet<string> = new Set(TERMINAL_BOOKING_STATUSES);

/** Room states that cannot take bookings (row hatching, drop/create guards). */
export const NON_BOOKABLE_ROOM_STATUSES: ReadonlySet<string> = new Set(["maintenance", "out_of_service"]);

export function isManualLikeSource(source: string | null | undefined): boolean {
  return source === "manual" || source === "phone" || source === "walk_in";
}

export function getBookingBarColor(
  status: string,
  source: string | null
): { bg: string; text: string; border: string } {
  // Terminal/special statuses always override source-based coloring
  if (status === "checked_in") {
    // IN HOUSE - matches CALENDAR_LEGEND "In House" #16A34A
    return { bg: "#16A34A", text: "#FFFFFF", border: "#15803D" };
  }
  if (status === "checked_out") {
    return { bg: "#6B7280", text: "#FFFFFF", border: "#4B5563" };
  }
  if (status === "cancelled") {
    return { bg: "#94A3B8", text: "#FFFFFF", border: "#64748B" };
  }
  if (status === "pending") {
    // PENDING - matches CALENDAR_LEGEND "Pending" #7C3AED (violet)
    return { bg: "#7C3AED", text: "#FFFFFF", border: "#6D28D9" };
  }
  if (status === "maintenance" || status === "out_of_service") {
    return { bg: "#D97706", text: "#FFFFFF", border: "#B45309" };
  }

  // CONFIRMED: source-based coloring — matches CALENDAR_LEGEND swatches exactly
  switch (source) {
    case "manual":
    case "phone":
    case "walk_in":
      // Manual/Phone - green, matches legend #2FAA67
      return { bg: "#2FAA67", text: "#FFFFFF", border: "#27996E" };
    case "direct":
    default:
      // Direct - cyan, matches legend #16A7D8
      return { bg: "#16A7D8", text: "#FFFFFF", border: "#0E96C5" };
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
  { label: "2 Wks", days: 14 },
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
  color: string;
  type: "booking" | "block";
}

export const CALENDAR_LEGEND: LegendItem[] = [
  { label: "Direct", color: "#16A7D8", type: "booking" },
  { label: "Manual/Phone", color: "#2FAA67", type: "booking" },
  { label: "In House", color: "#16A34A", type: "booking" },
  { label: "Pending", color: "#7C3AED", type: "booking" },
  { label: "Blocked", color: "#64748B", type: "block" },
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
