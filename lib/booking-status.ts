/**
 * lib/booking-status.ts
 *
 * Single source of truth for booking status / payment status / source /
 * payment method presentation: labels, badge variants and colour classes.
 *
 * Import these instead of re-declaring `getStatusLabel`-style maps in
 * individual tables, drawers and panels.
 */

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost";

// ── Booking status ───────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  cancelled: "Cancelled",
  no_show: "No Show",
  pending: "Pending",
};

/**
 * State machine for booking status changes. Maps current status → allowed
 * next statuses. checked_out is terminal. Reinstatement from cancelled or
 * no_show returns to confirmed (audit trail preserved via status history).
 * confirmed → no_show covers same-day no-shows recorded before check-in.
 */
export const ALLOWED_BOOKING_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled", "no_show"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["checked_out"],
  checked_out: [],
  cancelled: ["confirmed"],
  no_show: ["confirmed"],
};

export function canTransitionBooking(from: string | null, to: string): boolean {
  return (ALLOWED_BOOKING_TRANSITIONS[from ?? ""] ?? []).includes(to);
}

/** Status dot colour. Single source for the pill dot and guest-history dot. */
export const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-500",
  checked_in: "bg-emerald-500",
  checked_out: "bg-muted-foreground/50",
  cancelled: "bg-red-500",
  no_show: "bg-rose-500",
  pending: "bg-amber-500",
};

export const STATUS_DOT_FALLBACK = "bg-muted-foreground/50";

/** Status pill (badge) classes: background + text + ring per booking status. */
export const STATUS_PILL_CLASSES: Record<string, string> = {
  confirmed: "bg-blue-500/10 text-blue-700 ring-blue-500/20",
  checked_in: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  checked_out: "bg-muted text-muted-foreground ring-border",
  pending: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
  cancelled: "bg-red-500/10 text-red-700 ring-red-500/20",
  no_show: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};

export const STATUS_PILL_FALLBACK = "bg-muted text-muted-foreground ring-border";

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

export function getStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "confirmed":
      return "default";
    case "checked_in":
      return "secondary";
    case "checked_out":
      return "outline";
    case "cancelled":
    case "no_show":
      return "destructive";
    case "pending":
      return "ghost";
    default:
      return "outline";
  }
}

// ── Payment status ───────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  refunded: "Refunded",
};

export function getPaymentLabel(status: string): string {
  return PAYMENT_LABELS[status] || status;
}

/**
 * Booking payment-status → text tone. Colour appears only when money is still
 * owed or has been reversed; "paid" reads positive.
 */
export const PAYMENT_STATUS_TONE: Record<string, string> = {
  paid: "text-emerald-600",
  partial: "text-amber-600",
  unpaid: "text-destructive",
  refunded: "text-muted-foreground",
};

/**
 * Individual payment-record status → text tone. Successful payments stay
 * neutral (no entry); only records that need attention carry colour.
 */
export const PAYMENT_RECORD_TONE: Record<string, string> = {
  pending: "text-amber-700",
  failed: "text-red-600",
  refunded: "text-muted-foreground",
};

export function getPaymentVariant(status: string): BadgeVariant {
  switch (status) {
    case "paid":
      return "default";
    case "partial":
      return "secondary";
    case "unpaid":
      return "outline";
    case "refunded":
      return "destructive";
    default:
      return "outline";
  }
}

// ── Booking source ───────────────────────────────────────────────

export const SOURCE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  direct: { label: "Direct", color: "text-blue-600", bg: "bg-blue-500/10" },
  manual: { label: "Manual", color: "text-teal-600", bg: "bg-teal-500/10" },
  phone: { label: "Phone", color: "text-amber-600", bg: "bg-amber-500/10" },
  walk_in: { label: "Walk-in", color: "text-emerald-600", bg: "bg-emerald-500/10" },
};

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCE_BADGES).map(([key, badge]) => [key, badge.label])
);

export function getSourceLabel(source: string | null): string {
  return SOURCE_LABELS[source || ""] || source || "—";
}

// ── Payment method ───────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Card",
  cash: "Cash",
  pos: "POS",
  bank_transfer: "Bank Transfer",
  mobile_money: "Mobile Money",
  paystack_link: "Paystack Link",
  refund: "Refund",
  other: "Other",
};

export function getMethodLabel(method: string | null): string {
  return PAYMENT_METHOD_LABELS[method || ""] || method || "—";
}
