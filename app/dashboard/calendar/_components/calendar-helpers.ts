// Calendar helper constants and pure formatting functions.

export function getBookingBarColor(
  status: string,
  source: string | null
): { bg: string; text: string; border: string } {
  if (status === "checked_in") {
    return { bg: "#16A34A", text: "#FFFFFF", border: "#15803D" };
  }
  if (status === "pending") {
    return { bg: "#7C3AED", text: "#FFFFFF", border: "#6D28D9" };
  }
  if (status === "cancelled") {
    return { bg: "#94A3B8", text: "#FFFFFF", border: "#64748B" };
  }

  switch (source) {
    case "bookings_com":
      return { bg: "#6D5DF6", text: "#FFFFFF", border: "#5448D9" };
    case "direct":
      return { bg: "#16A7D8", text: "#FFFFFF", border: "#0E8DB8" };
    case "manual":
    case "phone":
    case "walk_in":
    default:
      return { bg: "#2FAA67", text: "#FFFFFF", border: "#238451" };
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
  paymentStatus?: string | null
): string {
  const name = guestName || "Guest";
  const n = nights || totalDays;
  const unpaid = paymentStatus === "unpaid" || paymentStatus === "partial";
  const unpaidDot = unpaid
    ? `<span class="event-unpaid-dot" title="Payment outstanding"></span>`
    : "";
  const statusDot = `<span class="event-status-dot event-status-dot--${status.replace(/_/g, "-")}"></span>`;

  if (totalDays <= 1) {
    const truncated = name.length > 10 ? `${name.slice(0, 9)}...` : name;
    return `<div class="event-inner compact">${unpaidDot}${statusDot}<span class="event-name">${truncated}</span></div>`;
  }

  if (totalDays <= 3) {
    const truncated = name.length > 14 ? `${name.slice(0, 13)}...` : name;
    return `<div class="event-inner compact">${unpaidDot}${statusDot}<span class="event-name">${truncated}</span></div>`;
  }

  const truncated = name.length > 22 ? `${name.slice(0, 21)}...` : name;
  const sourceLabel = getSourceShortLabel(source);
  return `<div class="event-inner">
    <div class="event-name-row">${unpaidDot}${statusDot}<span class="event-name">${truncated}</span></div>
    <span class="event-meta">${n}n - ${sourceLabel}</span>
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

export const ROW_HEIGHT = 42;
export const ROW_HEADER_WIDTH = 228;

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
