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
 * next statuses. checked_out and no_show are terminal. Reinstatement from
 * cancelled returns to confirmed (audit trail preserved via status history).
 */
export const ALLOWED_BOOKING_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled"],
  checked_in: ["checked_out"],
  checked_out: [],
  cancelled: ["confirmed"],
  no_show: [],
};

export function canTransitionBooking(from: string | null, to: string): boolean {
  return (ALLOWED_BOOKING_TRANSITIONS[from ?? ""] ?? []).includes(to);
}

/** Dot / pill background colour per booking status. */
export const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-500",
  checked_in: "bg-emerald-500",
  checked_out: "bg-slate-400",
  cancelled: "bg-red-500",
  no_show: "bg-rose-500",
  pending: "bg-violet-500",
};

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
