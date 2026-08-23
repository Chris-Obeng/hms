"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { type FullBookingDetail } from "./booking-detail-types";
import { format, eachDayOfInterval, addDays, parseISO } from "date-fns";

interface BookingFolioPrintProps {
  booking: FullBookingDetail;
  currency: string;
  hotelName?: string;
  hotelAddress?: string;
  hotelPhone?: string;
}

export function BookingFolioPrintButton({
  booking,
  currency,
  hotelName = "Hotel Management System",
  hotelAddress = "Accra, Ghana",
  hotelPhone = "+233 20 000 0000",
}: BookingFolioPrintProps) {
  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Calculate dates
    const checkInDate = booking.checkIn ? parseISO(booking.checkIn) : new Date();
    const checkOutDate = booking.checkOut ? parseISO(booking.checkOut) : addDays(checkInDate, booking.nights || 1);

    let nightlyRowsHtml = "";
    try {
      const days = eachDayOfInterval({
        start: checkInDate,
        end: addDays(checkOutDate, -1),
      });

      const perNight = booking.roomRate || (booking.totalAmount / (booking.nights || 1));

      nightlyRowsHtml = days
        .map(
          (day, idx) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0;">${format(day, "MMM dd, yyyy")}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0;">Nightly Room Charge (${booking.roomType?.name || "Standard Room"}) - Night ${idx + 1}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0; text-align: right;">${formatCurrency(perNight, currency)}</td>
        </tr>
      `
        )
        .join("");
    } catch {
      nightlyRowsHtml = `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0;">Stay Charges</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0;">Room Charge (${booking.nights || 1} nights)</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0; text-align: right;">${formatCurrency(booking.subtotal || booking.totalAmount, currency)}</td>
        </tr>
      `;
    }

    const paymentsRowsHtml = (booking.payments || [])
      .map(
        (p) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0;">${p.paidAt ? format(new Date(p.paidAt), "MMM dd, yyyy HH:mm") : "—"}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0;">Payment Received (${(p.method || "cash").toUpperCase()}${p.notes ? ` - ${p.notes}` : ""})</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0; text-align: right; color: #16A34A;">-${formatCurrency(p.amount, currency)}</td>
      </tr>
    `
      )
      .join("");

    const paid = booking.amountPaid || 0;
    const balance = Math.max(0, booking.totalAmount - paid);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Guest Folio Invoice - ${booking.reference}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A; margin: 0; padding: 40px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0F172A; padding-bottom: 20px; margin-bottom: 30px; }
          .hotel-title { font-size: 24px; font-weight: 700; color: #0F172A; margin: 0; }
          .hotel-sub { font-size: 13px; color: #64748B; margin-top: 4px; }
          .invoice-title { text-align: right; }
          .invoice-title h2 { font-size: 20px; text-transform: uppercase; letter-spacing: 1px; color: #475569; margin: 0; }
          .invoice-title p { font-size: 13px; color: #64748B; margin-top: 4px; }
          
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; font-size: 13px; }
          .section-label { text-transform: uppercase; font-size: 11px; font-weight: 600; color: #64748B; margin-bottom: 8px; letter-spacing: 0.5px; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; }
          th { background: #F8FAFC; text-align: left; padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #CBD5E1; }
          
          .totals { margin-left: auto; width: 320px; font-size: 13px; border-top: 1px solid #E2E8F0; padding-top: 10px; }
          .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
          .totals-row.bold { font-size: 15px; font-weight: 700; border-top: 2px solid #0F172A; margin-top: 8px; padding-top: 10px; }
          
          .footer { margin-top: 60px; text-align: center; font-size: 12px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 20px; }
          
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="hotel-title">${hotelName}</h1>
            <p class="hotel-sub">${hotelAddress} • Tel: ${hotelPhone}</p>
          </div>
          <div class="invoice-title">
            <h2>Guest Folio</h2>
            <p><strong>Ref:</strong> ${booking.reference}</p>
            <p><strong>Date:</strong> ${format(new Date(), "MMM dd, yyyy")}</p>
          </div>
        </div>

        <div class="grid">
          <div>
            <div class="section-label">Guest Details</div>
            <p style="margin: 0; font-weight: 600;">${booking.guest?.fullName || "Guest"}</p>
            <p style="margin: 4px 0 0 0; color: #475569;">${booking.guest?.email || "No email"}</p>
            <p style="margin: 2px 0 0 0; color: #475569;">${booking.guest?.phone || ""}</p>
          </div>
          <div>
            <div class="section-label">Stay Details</div>
            <p style="margin: 0;"><strong>Room:</strong> ${booking.room?.roomNumber || "Unassigned"} (${booking.roomType?.name || "Standard"})</p>
            <p style="margin: 4px 0 0 0;"><strong>Check-In:</strong> ${booking.checkIn ? format(parseISO(booking.checkIn), "MMM dd, yyyy") : "—"}</p>
            <p style="margin: 2px 0 0 0;"><strong>Check-Out:</strong> ${booking.checkOut ? format(parseISO(booking.checkOut), "MMM dd, yyyy") : "—"} (${booking.nights} nights)</p>
          </div>
        </div>

        <div class="section-label">Itemized Charges</div>
        <table>
          <thead>
            <tr>
              <th style="width: 130px;">Date</th>
              <th>Description</th>
              <th style="text-align: right; width: 120px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${nightlyRowsHtml}
            ${booking.taxAmount ? `
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0;">—</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0;">Applicable Taxes & Levies</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E2E8F0; text-align: right;">${formatCurrency(booking.taxAmount, currency)}</td>
              </tr>
            ` : ""}
          </tbody>
        </table>

        ${booking.payments && booking.payments.length > 0 ? `
          <div class="section-label">Payments Received</div>
          <table>
            <thead>
              <tr>
                <th style="width: 170px;">Date & Time</th>
                <th>Payment Method / Details</th>
                <th style="text-align: right; width: 120px;">Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              ${paymentsRowsHtml}
            </tbody>
          </table>
        ` : ""}

        <div class="totals">
          <div class="totals-row">
            <span>Subtotal Charges:</span>
            <span>${formatCurrency(booking.subtotal || booking.totalAmount, currency)}</span>
          </div>
          ${booking.taxAmount ? `
            <div class="totals-row">
              <span>Taxes & Levies:</span>
              <span>${formatCurrency(booking.taxAmount, currency)}</span>
            </div>
          ` : ""}
          <div class="totals-row">
            <span>Total Folio Amount:</span>
            <span>${formatCurrency(booking.totalAmount, currency)}</span>
          </div>
          <div class="totals-row" style="color: #16A34A;">
            <span>Total Payments Received:</span>
            <span>-${formatCurrency(paid, currency)}</span>
          </div>
          <div class="totals-row bold">
            <span>Balance Due:</span>
            <span style="color: ${balance > 0 ? '#DC2626' : '#16A34A'};">${formatCurrency(balance, currency)}</span>
          </div>
        </div>

        <div class="footer">
          <p>Thank you for staying with us! Please retain this invoice for your tax and accounting records.</p>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-lg text-xs h-8 border-border/60 gap-1.5"
      onClick={handlePrint}
    >
      <Printer className="size-3.5" />
      Print Folio
    </Button>
  );
}
