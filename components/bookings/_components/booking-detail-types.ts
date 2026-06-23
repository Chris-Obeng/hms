"use client";

import { type FullBookingDetail } from "@/app/actions/bookings-detail";

export type { FullBookingDetail };
export type { PaymentRecord } from "@/app/actions/bookings-detail";

// ── Helpers ──────────────────────────────────────────────────────

export function formatCurrency(amount: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateFull(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function getNights(checkIn: string, checkOut: string, nights?: number | null): number {
  if (nights && nights > 0) return nights;
  return Math.max(
    1,
    Math.round(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
    )
  );
}

export function getStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" | "ghost" {
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

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    confirmed: "Confirmed",
    checked_in: "Checked In",
    checked_out: "Checked Out",
    cancelled: "Cancelled",
    no_show: "No Show",
    pending: "Pending",
  };
  return labels[status] || status;
}

export function getSourceLabel(source: string | null): string {
  const labels: Record<string, string> = {
    direct: "Direct",
    bookings_com: "Booking.com",
    manual: "Manual",
    phone: "Phone",
    walk_in: "Walk-in",
  };
  return labels[source || ""] || source || "—";
}

export function getMethodLabel(method: string | null): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    pos: "POS",
    mobile_money: "Mobile Money",
    bank_transfer: "Bank Transfer",
    card: "Card",
    other: "Other",
  };
  return labels[method || ""] || method || "—";
}

export const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-500",
  checked_in: "bg-emerald-500",
  checked_out: "bg-slate-400",
  cancelled: "bg-red-500",
  no_show: "bg-rose-500",
  pending: "bg-violet-500",
};
