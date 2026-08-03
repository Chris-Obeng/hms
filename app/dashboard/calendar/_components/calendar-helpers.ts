// Calendar helper constants and pure formatting functions.

function escapeHtml(str: string): string {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

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

export function getRoomStatusColor(status: string): {
  color: string;
  label: string;
} {
  switch (status) {
    case "available":
      return { color: "#16A34A", label: "Available" };
    case "occupied":
      return { color: "#2563EB", label: "Occupied" };
    case "checkout_pending":
      return { color: "#EA580C", label: "Checkout Today" };
    case "cleaning":
      return { color: "#0891B2", label: "Cleaning" };
    case "maintenance":
    case "out_of_service":
      return { color: "#64748B", label: "Out of Service" };
    default:
      return { color: "#94A3B8", label: "Unknown" };
  }
}

export function getStatusCssClass(status: string): string {
  switch (status) {
    case "confirmed":
      return "calendar-event--confirmed";
    case "checked_in":
      return "calendar-event--checked-in";
    case "pending":
      return "calendar-event--pending";
    case "checked_out":
      return "calendar-event--checked-out";
    case "no_show":
      return "calendar-event--no-show";
    case "cancelled":
      return "calendar-event--cancelled";
    default:
      return "";
  }
}

export function getEventText(
  guestName: string | null,
  nights: number | null,
  totalDays: number
): string {
  const name = guestName || "Guest";
  const n = nights || totalDays;
  if (totalDays <= 2) {
    return name.length > 12 ? `${name.slice(0, 11)}...` : name;
  }
  return `${name} - ${n}n`;
}

export function getEventHtml(
  guestName: string | null,
  nights: number | null,
  status: string,
  source: string | null,
  totalDays: number,
  paymentStatus?: string | null,
  _stripeColor?: string
): string {
  const name = guestName || "Guest";
  const n = nights || totalDays;

  // Status badge text
  let statusText = "";
  if (status === "checked_in") statusText = "IN HOUSE";
  else if (status === "confirmed") statusText = "RESERVED";
  else if (status === "pending") statusText = "PENDING";
  else if (status === "checked_out") statusText = "CHECKED OUT";

  // Derive colors from the single source of truth — matches legend exactly
  const colors = getBookingBarColor(status, source);
  const bgColor = colors.bg;
  const stripeColorDarker = colors.border;

  const sourceLabel = getSourceShortLabel(source);
  // Always show source label for confirmed/pending to reinforce legend
  const showSource = sourceLabel && status !== "checked_out" && status !== "cancelled";
  const guestPart = escapeHtml(name);
  const sourcePart = showSource ? `<span class="cal-evt-source">${sourceLabel}</span>` : "";
  const statusPart = statusText ? `<span class="cal-evt-status-pill">${statusText}</span>` : "";
  const nightsPart = `<span class="cal-evt-nights">${n}n</span>`;

  return `<div class="cal-evt" style="background:${bgColor}">
    <div class="cal-evt-stripe" style="background:${stripeColorDarker}"></div>
    <div class="cal-evt-bar">
      <span class="cal-evt-name">${guestPart}</span>
      ${sourcePart}
      ${nightsPart}
      ${statusPart}
    </div>
  </div>`;
}

function getSourceShortLabel(source: string | null): string {
  switch (source) {
    case "direct":
      return "Direct";
    case "manual":
      return "Manual";
    case "phone":
      return "Phone";
    case "walk_in":
      return "Walk-in";
    default:
      return "Direct";
  }
}

export const VIEW_PRESETS = [
  { label: "Day", days: 1 },
  { label: "3 Day", days: 3 },
  { label: "Week", days: 7 },
  { label: "2 Wks", days: 14 },
  { label: "Month", days: 30 },
] as const;

export type ViewPreset = (typeof VIEW_PRESETS)[number]["label"];

export const ROW_HEIGHT = 40;
export const ROW_HEADER_WIDTH = 220;

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
