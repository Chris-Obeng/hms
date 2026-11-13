"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button, Tooltip } from "@heroui/react";
import { formatCurrency, formatRoomLabel, getNights } from "@/lib/format";
import { getMethodLabel } from "@/lib/booking-status";
import { type FullBookingDetail } from "./booking-detail-types";
import { format, eachDayOfInterval, addDays, parseISO } from "date-fns";

interface BookingFolioPrintProps {
  booking: FullBookingDetail;
  currency: string;
  hotelName?: string;
  hotelAddress?: string;
  hotelPhone?: string;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function BookingFolioPrintButton({
  booking,
  currency,
  hotelName = "RoomLine Property",
  hotelAddress,
  hotelPhone,
}: BookingFolioPrintProps) {
  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;

    const group = booking.group;
    const totalAmount = group ? group.total : booking.totalAmount;
    const subtotalAmount = group ? group.subtotal : booking.subtotal || booking.totalAmount;
    const taxAmount = group ? group.taxAmount : booking.taxAmount || 0;
    const paidAmount = group ? group.amountPaid : booking.amountPaid || 0;
    const balance = Math.max(0, totalAmount - paidAmount);
    const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);

    const checkInDate = booking.checkIn ? parseISO(booking.checkIn) : new Date();
    const checkOutDate = booking.checkOut
      ? parseISO(booking.checkOut)
      : addDays(checkInDate, nights);

    let chargesRowsHtml = "";
    if (group && group.lines.length > 0) {
      chargesRowsHtml = group.lines
        .map((line) => {
          const roomDesc = `${escapeHtml(line.roomTypeName || "Room")}${
            line.roomNumber ? ` · ${escapeHtml(formatRoomLabel(line.roomNumber))}` : ""
          }`;
          const lineNights = line.nights ?? nights;
          return `
            <tr>
              <td>${escapeHtml(format(parseISO(line.checkIn), "MMM d"))} – ${escapeHtml(format(parseISO(line.checkOut), "MMM d, yyyy"))}</td>
              <td>${roomDesc} (${lineNights} ${lineNights === 1 ? "night" : "nights"})</td>
              <td class="num">${escapeHtml(formatCurrency(line.subtotal || line.totalAmount, currency))}</td>
            </tr>
          `;
        })
        .join("");
    } else {
      try {
        const days = eachDayOfInterval({
          start: checkInDate,
          end: addDays(checkOutDate, -1),
        });
        const perNight = booking.roomRate || subtotalAmount / Math.max(1, nights);
        chargesRowsHtml = days
          .map(
            (day, idx) => `
              <tr>
                <td>${escapeHtml(format(day, "MMM d, yyyy"))}</td>
                <td>${escapeHtml(booking.roomType?.name || "Room")} — Night ${idx + 1}</td>
                <td class="num">${escapeHtml(formatCurrency(perNight, currency))}</td>
              </tr>
            `
          )
          .join("");
      } catch {
        chargesRowsHtml = `
          <tr>
            <td>Stay</td>
            <td>${escapeHtml(booking.roomType?.name || "Room")} (${nights} ${nights === 1 ? "night" : "nights"})</td>
            <td class="num">${escapeHtml(formatCurrency(subtotalAmount, currency))}</td>
          </tr>
        `;
      }
    }

    const paymentsRowsHtml = (booking.payments || [])
      .map(
        (p) => `
          <tr>
            <td>${p.paidAt ? escapeHtml(format(new Date(p.paidAt), "MMM d, yyyy HH:mm")) : "—"}</td>
            <td>${escapeHtml(getMethodLabel(p.method))}${p.notes ? ` · ${escapeHtml(p.notes)}` : ""}</td>
            <td class="num paid">−${escapeHtml(formatCurrency(p.amount, currency))}</td>
          </tr>
        `
      )
      .join("");

    const contactSub = [hotelAddress, hotelPhone].filter(Boolean).map(escapeHtml).join(" · ");
    const roomSummary = group
      ? `${group.totalRooms} rooms`
      : `${formatRoomLabel(booking.room?.roomNumber) ?? "Unassigned"}${
          booking.roomType?.name ? ` (${booking.roomType.name})` : ""
        }`;

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Folio ${escapeHtml(booking.reference)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; margin: 0; padding: 40px; font-variant-numeric: tabular-nums; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #111827; padding-bottom: 18px; margin-bottom: 28px; }
    .hotel-title { font-size: 20px; font-weight: 600; margin: 0; }
    .hotel-sub { font-size: 12px; color: #6b7280; margin: 4px 0 0; }
    .folio-meta { text-align: right; font-size: 12px; color: #4b5563; }
    .folio-meta h2 { font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 4px; }
    .folio-meta p { margin: 2px 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 28px; font-size: 13px; }
    .label { font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    th { text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #d1d5db; background: #f9fafb; }
    th.num, td.num { text-align: right; }
    td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
    td.paid { color: #15803d; }
    .totals { margin-left: auto; width: 300px; font-size: 13px; }
    .totals-row { display: flex; justify-content: space-between; padding: 5px 0; }
    .totals-row.final { font-size: 14px; font-weight: 600; border-top: 1.5px solid #111827; margin-top: 6px; padding-top: 10px; }
    .footer { margin-top: 48px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="hotel-title">${escapeHtml(hotelName)}</h1>
      ${contactSub ? `<p class="hotel-sub">${contactSub}</p>` : ""}
    </div>
    <div class="folio-meta">
      <h2>Guest folio</h2>
      <p>Ref: <strong>${escapeHtml(booking.reference)}</strong></p>
      <p>Issued: ${escapeHtml(format(new Date(), "MMM d, yyyy"))}</p>
    </div>
  </div>
  <div class="grid">
    <div>
      <div class="label">Guest</div>
      <p style="margin:0;font-weight:600;">${escapeHtml(booking.guest?.fullName || "Guest")}</p>
      ${booking.guest?.email ? `<p style="margin:3px 0 0;color:#4b5563;">${escapeHtml(booking.guest.email)}</p>` : ""}
      ${booking.guest?.phone ? `<p style="margin:2px 0 0;color:#4b5563;">${escapeHtml(booking.guest.phone)}</p>` : ""}
    </div>
    <div>
      <div class="label">Stay</div>
      <p style="margin:0;">${escapeHtml(roomSummary)}</p>
      <p style="margin:3px 0 0;color:#4b5563;">${escapeHtml(format(checkInDate, "MMM d, yyyy"))} → ${escapeHtml(format(checkOutDate, "MMM d, yyyy"))} (${nights} ${nights === 1 ? "night" : "nights"})</p>
    </div>
  </div>
  <div class="label">Charges</div>
  <table>
    <thead>
      <tr><th style="width:150px;">Date</th><th>Description</th><th class="num" style="width:120px;">Amount</th></tr>
    </thead>
    <tbody>
      ${chargesRowsHtml}
      ${taxAmount > 0 ? `<tr><td>—</td><td>Tax</td><td class="num">${escapeHtml(formatCurrency(taxAmount, currency))}</td></tr>` : ""}
    </tbody>
  </table>
  ${
    booking.payments && booking.payments.length > 0
      ? `<div class="label">Payments</div>
         <table>
           <thead><tr><th style="width:160px;">Date</th><th>Method</th><th class="num" style="width:120px;">Amount</th></tr></thead>
           <tbody>${paymentsRowsHtml}</tbody>
         </table>`
      : ""
  }
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${escapeHtml(formatCurrency(subtotalAmount, currency))}</span></div>
    ${taxAmount > 0 ? `<div class="totals-row"><span>Tax</span><span>${escapeHtml(formatCurrency(taxAmount, currency))}</span></div>` : ""}
    <div class="totals-row"><span>Total charges</span><span>${escapeHtml(formatCurrency(totalAmount, currency))}</span></div>
    <div class="totals-row" style="color:#15803d;"><span>Paid</span><span>−${escapeHtml(formatCurrency(paidAmount, currency))}</span></div>
    <div class="totals-row final"><span>Balance due</span><span style="color:${balance > 0 ? "#dc2626" : "#15803d"};">${escapeHtml(formatCurrency(balance, currency))}</span></div>
  </div>
  <div class="footer">Thank you for staying with ${escapeHtml(hotelName)}</div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <Tooltip delay={300}>
      <Button isIconOnly variant="secondary" aria-label="Print folio" onPress={handlePrint} className="rounded-xl max-md:size-11">
        <Printer className="size-4" aria-hidden="true" />
      </Button>
      <Tooltip.Content>
        <p>Print folio</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
