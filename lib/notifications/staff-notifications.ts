/**
 * Hospitality-first staff notification copy & presentation formatter.
 *
 * Hotel front-desk and management teams need immediate, plain-language answers
 * when an alert arrives — Who is the guest? Which room? What dates? Was money
 * paid or is a balance left? — without raw ISO dates, 13-digit booking IDs
 * leading the sentence, database enum names, or decorative emojis.
 *
 * This module serves two roles:
 *   1. `build*Notification` helpers produce clean `{ title, message }` pairs
 *      at write time across bookings, payments, cancellations, and team events.
 *   2. `presentStaffNotification` normalizes both newly written AND legacy rows
 *      at read/push time so historical database rows also read cleanly.
 */

import { formatCurrencyCode, formatDate, getNights, nightsLabel } from "@/lib/format";

export type StaffNotificationCategory =
  | "booking"
  | "payment"
  | "attention"
  | "cancellation"
  | "arrival"
  | "departure"
  | "team"
  | "general";

export interface RawStaffNotification {
  id: string;
  type: string | null;
  title: string;
  message: string;
  booking_id: string | null;
  is_read?: boolean;
  created_at?: string | null;
}

export interface PresentedStaffNotification {
  id: string;
  category: StaffNotificationCategory;
  badgeLabel: string;
  title: string;
  message: string;
  reference: string | null;
  href: string | null;
  actionLabel: string | null;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  momo: "Mobile Money",
  card: "Card",
  pos: "Card",
  bank_transfer: "Bank transfer",
  ussd: "USSD",
  online: "Online payment",
  paystack: "Online payment",
  paystack_link: "Payment link",
  other: "Other payment",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Admin",
  manager: "Manager",
  front_desk: "Front Desk",
  read_only: "View Only",
};

function cleanGuestName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "Guest";
}

function cleanActorName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.toLowerCase() === "staff") return null;
  return trimmed.split(/\s+/)[0] || trimmed;
}

export function formatStayWindow(
  checkIn: string | null | undefined,
  checkOut?: string | null | undefined,
  nights?: number | null
): string {
  if (!checkIn) return "";
  const start = formatDate(checkIn, "MMM d", checkIn);
  if (!checkOut) return start;
  const end = formatDate(checkOut, "MMM d", checkOut);
  const count = getNights(checkIn, checkOut, nights);
  return `${start} – ${end} (${nightsLabel(count)})`;
}

export function formatPaymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "Payment";
  const key = method.trim().toLowerCase();
  return PAYMENT_METHOD_LABELS[key] ?? method.replace(/_/g, " ");
}

export function formatStaffRoleLabel(role: string | null | undefined): string {
  if (!role) return "Team Member";
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

// ── Write-time Copy Builders ───────────────────────────────────────────────

export function buildNewBookingNotification(params: {
  guestName?: string | null;
  roomLabel?: string | null;
  roomsCount?: number;
  checkIn?: string | null;
  checkOut?: string | null;
  nights?: number | null;
  currency?: string;
  amountPaid?: number | null;
  totalAmount?: number | null;
  paymentPreference?: "pay_now" | "pay_at_checkin" | string | null;
  actorName?: string | null;
  isOnline?: boolean;
}): { title: string; message: string } {
  const guest = cleanGuestName(params.guestName);
  const isGroup = (params.roomsCount ?? 1) > 1;
  const roomSummary =
    params.roomLabel?.trim() ||
    (isGroup ? `${params.roomsCount} rooms` : "Room reservation");

  const title = isGroup
    ? `New group booking — ${guest}`
    : `New booking — ${guest}`;

  const parts: string[] = [roomSummary];

  const stay = formatStayWindow(params.checkIn, params.checkOut, params.nights);
  if (stay) parts.push(stay);

  const currency = params.currency || "GHS";
  if (typeof params.amountPaid === "number" && params.amountPaid > 0) {
    parts.push(`Paid ${formatCurrencyCode(params.amountPaid, currency)}`);
  } else if (
    params.paymentPreference === "pay_at_checkin" &&
    typeof params.totalAmount === "number" &&
    params.totalAmount > 0
  ) {
    parts.push(
      params.isOnline
        ? `Pay at check-in (${formatCurrencyCode(params.totalAmount, currency)})`
        : `${formatCurrencyCode(params.totalAmount, currency)} due at check-in`
    );
  } else if (typeof params.totalAmount === "number" && params.totalAmount > 0 && !params.isOnline) {
    parts.push(
      params.paymentPreference === "pay_now"
        ? `${formatCurrencyCode(params.totalAmount, currency)} awaiting payment`
        : formatCurrencyCode(params.totalAmount, currency)
    );
  }

  const actor = cleanActorName(params.actorName);
  if (actor) {
    parts.push(`Added by ${actor}`);
  }

  return {
    title,
    message: parts.filter(Boolean).join(" · "),
  };
}

export function buildPaymentReceivedNotification(params: {
  amount: number;
  currency?: string;
  guestName?: string | null;
  roomLabel?: string | null;
  remainingBalance?: number | null;
  method?: string | null;
  actorName?: string | null;
  partial?: boolean;
}): { title: string; message: string } {
  const currency = params.currency || "GHS";
  const amountText = formatCurrencyCode(params.amount, currency);
  const isPartial =
    params.partial ?? (typeof params.remainingBalance === "number" && params.remainingBalance > 0.009);

  const title = isPartial
    ? `Part payment — ${amountText}`
    : `Payment received — ${amountText}`;

  const parts: string[] = [];
  if (params.guestName?.trim()) parts.push(params.guestName.trim());
  if (params.roomLabel?.trim()) parts.push(params.roomLabel.trim());
  if (params.method) parts.push(formatPaymentMethodLabel(params.method));

  if (isPartial && typeof params.remainingBalance === "number" && params.remainingBalance > 0) {
    parts.push(`${formatCurrencyCode(params.remainingBalance, currency)} left to pay`);
  } else {
    parts.push("Paid in full");
  }

  const actor = cleanActorName(params.actorName);
  if (actor) {
    parts.push(`Recorded by ${actor}`);
  }

  return {
    title,
    message: parts.filter(Boolean).join(" · "),
  };
}

export function buildPaymentReviewNotification(
  kind:
    | {
        reason: "currency_mismatch";
        receivedCurrency: string;
        expectedCurrency: string;
        amountPaid: number;
        guestName?: string | null;
      }
    | {
        reason: "amount_mismatch";
        currency: string;
        amountPaid: number;
        expectedAmount: number;
        guestName?: string | null;
      }
    | {
        reason: "non_active_booking";
        currency: string;
        amountPaid: number;
        bookingStatus?: string | null;
        guestName?: string | null;
      }
    | {
        reason: "group_partial_confirm";
        currency: string;
        amountPaid: number;
        guestName?: string | null;
      }
    | {
        reason: "settlement_check";
        currency: string;
        amountPaid: number;
        guestName?: string | null;
      }
): { title: string; message: string } {
  const who = kind.guestName?.trim() ? ` from ${kind.guestName.trim()}` : "";

  switch (kind.reason) {
    case "currency_mismatch": {
      const paid = formatCurrencyCode(kind.amountPaid, kind.receivedCurrency);
      return {
        title: "Payment needs a quick check",
        message: `${paid} arrived${who} in ${kind.receivedCurrency.toUpperCase()} instead of ${kind.expectedCurrency.toUpperCase()}. Open the booking to review.`,
      };
    }
    case "amount_mismatch": {
      const paid = formatCurrencyCode(kind.amountPaid, kind.currency);
      const expected = formatCurrencyCode(kind.expectedAmount, kind.currency);
      return {
        title: "Payment amount needs a check",
        message: `${paid} arrived${who}, which differs from the booking total (${expected}). Open the booking to review.`,
      };
    }
    case "settlement_check": {
      const paid = formatCurrencyCode(kind.amountPaid, kind.currency);
      return {
        title: "Payment needs a quick check",
        message: `${paid} arrived${who}, but the payment details did not match the booking record. Open the booking to review.`,
      };
    }
    case "non_active_booking": {
      const paid = formatCurrencyCode(kind.amountPaid, kind.currency);
      const stateWord =
        kind.bookingStatus === "cancelled"
          ? "cancelled"
          : kind.bookingStatus === "checked_out"
            ? "checked-out"
            : "closed";
      return {
        title: `Payment on ${stateWord} booking`,
        message: `${paid} arrived${who} for a ${stateWord} reservation. The payment is saved — open the booking to review.`,
      };
    }
    case "group_partial_confirm": {
      const paid = formatCurrencyCode(kind.amountPaid, kind.currency);
      return {
        title: "Group booking needs a quick check",
        message: `${paid} arrived${who}, but one or more rooms could not be confirmed automatically. Open the booking to review.`,
      };
    }
  }
}

export function buildBookingCancelledNotification(params: {
  guestName?: string | null;
  roomLabel?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  nights?: number | null;
  actorName?: string | null;
}): { title: string; message: string } {
  const guest = cleanGuestName(params.guestName);
  const parts: string[] = [];
  if (params.roomLabel?.trim()) parts.push(params.roomLabel.trim());
  const stay = formatStayWindow(params.checkIn, params.checkOut, params.nights);
  if (stay) parts.push(stay);
  const actor = cleanActorName(params.actorName);
  if (actor) parts.push(`Cancelled by ${actor}`);

  return {
    title: `Booking cancelled — ${guest}`,
    message: parts.length > 0 ? parts.join(" · ") : "Reservation was cancelled.",
  };
}

export function buildStaffJoinedNotification(params: {
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
  pendingApproval?: boolean;
}): { title: string; message: string } {
  const person = params.fullName?.trim() || params.email?.trim() || null;
  if (params.pendingApproval) {
    return {
      title: person ? `Access request — ${person}` : "New access request",
      message: "Waiting for approval in Staff settings.",
    };
  }
  return {
    title: person ? `New team member — ${person}` : "New team member joined",
    message: `Joined your hotel as ${formatStaffRoleLabel(params.role)}.`,
  };
}

export function buildTestPushNotification(): { title: string; message: string } {
  return {
    title: "Alerts are working on this device",
    message: "New bookings, payments, and guest arrival updates will appear right here.",
  };
}

// ── Read & Push Presentation Normalizer (Handles Both New & Legacy Rows) ──

const ISO_RANGE_RE = /(\d{4}-\d{2}-\d{2})\s*(?:→|->|to)\s*(\d{4}-\d{2}-\d{2})/i;
const UNFORMATTED_MONEY_RE = /\b([A-Z]{3})\s+(\d{4,}(?:\.\d{1,2})?)\b/g;
const LEADING_EMOJI_RE = /^(?:⚠️|⚠|🔔|✅|❌|💳|📅)\s*/u;
const LEGACY_ONLINE_BOOKING_RE =
  /^([A-Z0-9-]{6,})\s*·\s*([^·]+?)\s*·\s*([^·]+?)\s*·\s*(\d{4}-\d{2}-\d{2})\s*(?:→|->)\s*(\d{4}-\d{2}-\d{2})$/i;
const LEGACY_STAFF_BOOKING_RE =
  /^([A-Z0-9-]{6,})(?:\s*·\s*(\d+\s+stays?))?\s+(?:added\s+)?by\s+(.+)$/i;
const LEGACY_ONLINE_PAYMENT_RE =
  /^Online payment of\s+([A-Z]{3})\s+([\d,.]+)\s+(?:for\s+([^()]+?)\s+)?(confirmed|recorded|\(balance:\s*([\d,.]+)\))$/i;

function formatRawMoneyInText(text: string): string {
  return text.replace(UNFORMATTED_MONEY_RE, (_match, code: string, numStr: string) => {
    const parsed = Number(numStr);
    if (!Number.isFinite(parsed)) return _match;
    return formatCurrencyCode(parsed, code);
  });
}

function humanizeIsoRanges(text: string): string {
  return text.replace(ISO_RANGE_RE, (_m, checkIn: string, checkOut: string) =>
    formatStayWindow(checkIn, checkOut)
  );
}

function resolveCategory(type: string | null, title: string): {
  category: StaffNotificationCategory;
  badgeLabel: string;
} {
  switch (type) {
    case "new_booking":
      return { category: "booking", badgeLabel: "Booking" };
    case "payment_received":
      return { category: "payment", badgeLabel: "Payment" };
    case "payment_failed":
    case "channel_conflict":
      return { category: "attention", badgeLabel: "Needs check" };
    case "booking_cancelled":
      return { category: "cancellation", badgeLabel: "Cancelled" };
    case "check_in_reminder":
      return { category: "arrival", badgeLabel: "Arrivals" };
    case "check_out_reminder":
      return { category: "departure", badgeLabel: "Departures" };
    case "staff_access_request":
      return { category: "team", badgeLabel: "Team" };
    case "test_push":
      return { category: "general", badgeLabel: "Test" };
    default: {
      if (/cancel/i.test(title)) return { category: "cancellation", badgeLabel: "Cancelled" };
      if (/payment/i.test(title)) return { category: "payment", badgeLabel: "Payment" };
      if (/booking/i.test(title)) return { category: "booking", badgeLabel: "Booking" };
      return { category: "general", badgeLabel: "Update" };
    }
  }
}

export function presentStaffNotification(raw: RawStaffNotification): PresentedStaffNotification {
  let title = (raw.title || "Hotel update").replace(LEADING_EMOJI_RE, "").trim();
  let message = (raw.message || "").trim();
  let reference: string | null = null;

  // 1. Normalize legacy online booking rows:
  //    "1723821744980 · Chris · Deluxe Room · 2026-11-13 → 2026-11-18"
  const legacyOnline = message.match(LEGACY_ONLINE_BOOKING_RE);
  if (legacyOnline) {
    const [, ref, guest, room, checkIn, checkOut] = legacyOnline;
    reference = ref.trim();
    const guestClean = cleanGuestName(guest);
    if (/^new online booking$/i.test(title) || /^new booking/i.test(title)) {
      title = `New booking — ${guestClean}`;
    }
    message = `${room.trim()} · ${formatStayWindow(checkIn, checkOut)}`;
  }

  // 2. Normalize legacy staff-created booking rows:
  //    "1723821744980 added by staff" or "1723821744980 · 2 stays by Kofi"
  const legacyStaff = !legacyOnline ? message.match(LEGACY_STAFF_BOOKING_RE) : null;
  if (legacyStaff) {
    const [, ref, stays, actorRaw] = legacyStaff;
    reference = ref.trim();
    const actor = cleanActorName(actorRaw);
    const parts: string[] = [];
    if (stays) parts.push(stays.replace(/\bstays\b/i, "rooms").replace(/\bstay\b/i, "room"));
    parts.push(actor ? `Added by ${actor}` : "Added at the front desk");
    if (/^new booking created$/i.test(title)) {
      title = "New desk booking";
    }
    message = parts.join(" · ");
  }

  // 3. Normalize legacy online payment rows:
  //    "Online payment of GHS 11130.00 confirmed"
  const legacyPay = !legacyOnline && !legacyStaff ? message.match(LEGACY_ONLINE_PAYMENT_RE) : null;
  if (legacyPay) {
    const [, currency, rawAmount, roomsPart, statusPart, rawBalance] = legacyPay;
    const amountNum = Number(rawAmount.replace(/,/g, ""));
    const formattedAmount = Number.isFinite(amountNum)
      ? formatCurrencyCode(amountNum, currency)
      : `${currency} ${rawAmount}`;

    if (rawBalance) {
      const balNum = Number(rawBalance.replace(/,/g, ""));
      const balFormatted = Number.isFinite(balNum)
        ? formatCurrencyCode(balNum, currency)
        : `${currency} ${rawBalance}`;
      title = `Part payment — ${formattedAmount}`;
      message = [roomsPart?.trim(), `Online payment · ${balFormatted} left to pay`]
        .filter(Boolean)
        .join(" · ");
    } else {
      title = `Payment received — ${formattedAmount}`;
      message = [
        roomsPart?.trim(),
        statusPart.toLowerCase() === "confirmed" ? "Online payment · Paid in full" : "Online payment recorded",
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }

  // 4. Clean up any remaining raw numbers, ISO dates, or technical jargon
  title = formatRawMoneyInText(title);
  message = formatRawMoneyInText(humanizeIsoRanges(message))
    .replace(/booking status is "([^"]+)"/gi, (_m, st: string) => `booking is ${st.replace(/_/g, " ")}`)
    .replace(/Money recorded — review manually\./gi, "The payment is saved — open the booking to review.");

  const { category, badgeLabel } = resolveCategory(raw.type, title);

  let href: string | null = null;
  let actionLabel: string | null = null;
  if (raw.booking_id) {
    href = `/dashboard/bookings/${raw.booking_id}`;
    actionLabel = "View booking";
  } else if (raw.type === "staff_access_request") {
    href = "/dashboard/staff";
    actionLabel = "View team";
  } else if (raw.type === "check_in_reminder" || raw.type === "check_out_reminder") {
    href = "/dashboard";
    actionLabel = "View front desk";
  }

  return {
    id: raw.id,
    category,
    badgeLabel,
    title,
    message,
    reference,
    href,
    actionLabel,
  };
}
