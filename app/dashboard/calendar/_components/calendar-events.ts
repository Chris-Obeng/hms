import type {
  CalendarAvailabilityBlock,
  CalendarBooking,
} from "../actions";
import {
  getBookingBarColor,
  getEventHtml,
  getEventText,
  getStatusCssClass,
} from "./calendar-helpers";
import { findOverlappingBookingIds } from "@/lib/calendar-domain";

export interface CalendarEvent {
  id: string;
  resource: string;
  start: string;
  end: string;
  text: string;
  html: string;
  barColor: string;
  backColor: string;
  fontColor: string;
  borderColor: string;
  cssClass: string;
  bookingId?: string;
  blockId?: string;
  isBlock?: boolean;
  guestName?: string | null;
  reference?: string;
  status?: string;
  source?: string | null;
  nights?: number | null;
  paymentStatus?: string | null;
  totalAmount?: number;
  isNew?: boolean;
}

export function buildEvents(
  bookings: CalendarBooking[],
  blocks: CalendarAvailabilityBlock[],
  newBookingIds: Set<string> = new Set()
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const conflictIds = findOverlappingBookingIds(bookings.map((booking) => ({
    id: booking.id,
    roomId: booking.roomId,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
  })));

  for (const booking of bookings) {
    if (!booking.roomId) continue;

    const colors = getBookingBarColor(booking.status, booking.source);
    const totalDays =
      Math.round(
        (new Date(booking.checkOut).getTime() -
          new Date(booking.checkIn).getTime()) /
          (1000 * 60 * 60 * 24)
      ) || 1;
    const isNew = newBookingIds.has(booking.id);
    const cssClass = [
      "calendar-event",
      getStatusCssClass(booking.status),
      isNew ? "calendar-event--new" : "",
      conflictIds.has(booking.id) ? "calendar-event--conflict" : "",
    ]
      .filter(Boolean)
      .join(" ");

    events.push({
      id: `booking-${booking.id}`,
      resource: booking.roomId,
      start: booking.checkIn,
      end: booking.checkOut,
      text: getEventText(booking.guestName, booking.nights, totalDays),
      html: getEventHtml(
        booking.guestName,
        booking.nights,
        booking.status,
        booking.source,
        totalDays,
        booking.paymentStatus,
        colors.bg
      ),
      barColor: colors.bg,
      backColor: "transparent",
      fontColor: colors.text,
      borderColor: colors.border,
      cssClass,
      bookingId: booking.id,
      guestName: booking.guestName,
      reference: booking.reference,
      status: booking.status,
      source: booking.source,
      nights: booking.nights,
      paymentStatus: booking.paymentStatus,
      totalAmount: booking.totalAmount,
      isNew,
    });
  }

  for (const block of blocks) {
    const reasonLabel = titleCase(block.reason?.replace(/_/g, " ") || "Blocked");
    events.push({
      id: `block-${block.id}`,
      resource: block.roomId,
      start: block.startDate,
      end: block.endDate,
      text: reasonLabel,
      html: `<div class="cal-evt-block">
        <span class="cal-evt-block-name">${escapeHtml(reasonLabel)}</span>
      </div>`,
      barColor: "#30363D",
      backColor: "transparent",
      fontColor: "#7D8590",
      borderColor: "#30363D",
      cssClass: "calendar-event calendar-event--block",
      blockId: block.id,
      isBlock: true,
    });
  }

  return events;
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
