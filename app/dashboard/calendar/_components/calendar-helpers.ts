// Calendar helper constants and pure formatting functions.

function escapeHtml(str: string): string {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

export function getBookingBarColor(
  status: string,
  source: string | null
): { bg: string; text: string; border: string } {
  // Status-based color system per spec
  if (status === "checked_in") {
    return { bg: "#16A34A", text: "#FFFFFF", border: "#15803D" }; // IN HOUSE - green
  }
  if (status === "checked_out") {
    return { bg: "#6B7280", text: "#FFFFFF", border: "#4B5563" }; // CHECKED OUT - gray
  }
  if (status === "cancelled") {
    return { bg: "#94A3B8", text: "#FFFFFF", border: "#64748B" };
  }
  if (status === "maintenance" || status === "out_of_service") {
    return { bg: "#D97706", text: "#FFFFFF", border: "#B45309" }; // MAINTENANCE - amber
  }

  // Default: RESERVED - blue
  return { bg: "#2563EB", text: "#FFFFFF", border: "#1D4ED8" };
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
  stripeColor?: string
): string {
  const name = guestName || "Guest";
  const n = nights || totalDays;
  const compact = totalDays <= 2;
  const truncate = (s: string, max: number) =>
    s.length > max ? `${s.slice(0, max - 1)}…` : s;

  // Status badge text
  let statusText = "";
  if (status === "checked_in") statusText = "IN HOUSE";
  else if (status === "confirmed" || status === "pending") statusText = "RESERVED";
  else if (status === "checked_out") statusText = "CHECKED OUT";

  // Background color based on status (solid colors as per spec)
  let bgColor = stripeColor || "#16a34a";
  if (status === "checked_in") bgColor = "#16a34a";
  else if (status === "confirmed" || status === "pending") bgColor = "#2563eb";
  else if (status === "checked_out") bgColor = "#6b7280";
  else if (status === "cancelled") bgColor = "#6b7280";

  const sourceLabel = getSourceShortLabel(source);
  const guestPart = escapeHtml(truncate(name, compact ? 14 : 20));
  const sourcePart = sourceLabel && sourceLabel !== "Direct" ? `<span class="cal-evt-source">${sourceLabel}</span>` : "";
  const statusPart = statusText ? `<span class="cal-evt-status-pill">${statusText}</span>` : "";
  const nightsPart = `<span class="cal-evt-nights">${n}n</span>`;

  // Use darker shade for the stripe accent
  const stripeColorDarker = status === "checked_in" ? "#15803d" 
    : status === "checked_out" ? "#4b5563"
    : "#1d4ed8";

  return `<div class="cal-evt ${compact ? 'compact' : ''}" style="background:${bgColor}">
    <div class="cal-evt-stripe" style="background:${stripeColorDarker}"></div>
    <div class="cal-evt-bar">
      <span class="cal-evt-name">${guestPart}</span>
      ${sourcePart}
      ${!compact ? nightsPart : ''}
      ${statusPart}
    </div>
  </div>`;
}

function getSourceShortLabel(source: string | null): string {
  switch (source) {
    case "bookings_com":
      return "Booking.com";
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
  { label: "Booking.com", color: "#6D5DF6", type: "booking" },
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
