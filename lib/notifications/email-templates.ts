/**
 * lib/notifications/email-templates.ts
 *
 * HTML email templates for transactional notifications.
 * Sent through Resend.
 */

import type { BookingNotifyData } from "@/lib/notifications/types";

/**
 * Entity-escapes dynamic strings interpolated into HTML email bodies and
 * double/single-quoted attributes (`HIGH-06`).
 */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeTelHref(phone: string): string {
  return phone.replace(/[^+0-9]/g, "");
}

/**
 * Builds the HTML body for a booking confirmation email.
 * Produces a self-contained, inbox-safe HTML email (no external stylesheets).
 */
export function buildConfirmationEmail(
  hotelName: string,
  booking: BookingNotifyData,
  currency: string
): string {
  const rawFirstName = booking.guestName.trim().split(/\s+/)[0] || booking.guestName;
  const safeHotelName = escapeHtml(hotelName);
  const safeFirstName = escapeHtml(rawFirstName);
  const safeReference = escapeHtml(booking.reference);
  const safeRoomName = escapeHtml(booking.roomName);
  const safeCheckIn = escapeHtml(booking.checkIn);
  const safeCheckInTime = booking.checkInTime ? escapeHtml(booking.checkInTime) : null;
  const safeCheckOut = escapeHtml(booking.checkOut);
  const safeCheckOutTime = booking.checkOutTime ? escapeHtml(booking.checkOutTime) : null;
  const safeAddress = booking.hotelAddress ? escapeHtml(booking.hotelAddress) : null;
  const safePhone = booking.hotelPhone ? escapeHtml(booking.hotelPhone) : null;
  const safeTelHref = booking.hotelPhone ? escapeHtml(sanitizeTelHref(booking.hotelPhone)) : null;
  const safeCurrency = escapeHtml(currency);
  const safeNights = Number.isFinite(booking.nights) ? String(booking.nights) : escapeHtml(String(booking.nights));

  // A multi-room reservation names every room with its own occupancy — the same
  // lines the confirmation page shows, so the email can't under-report what was
  // booked. A single-room booking keeps its one "Room" row.
  const rooms = booking.rooms ?? [];
  const roomRows = rooms.length > 0
    ? rooms
        .map(
          (room, index) => `          <tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;width:45%;">${rooms.length > 1 ? `Room ${index + 1}` : "Room"}</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;font-weight:500;">${escapeHtml(room.name)}${room.occupancy ? ` <span style="color:#A8A29E;">· ${escapeHtml(room.occupancy)}</span>` : ""}</td>
          </tr>`
        )
        .join("\n")
    : `          <tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;width:45%;">Room</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;font-weight:500;">${safeRoomName}</td>
          </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmed — ${safeReference}</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:16px;border:1px solid #E7E5E4;overflow:hidden;">

    <!-- Header -->
    <div style="background:#1C1917;padding:28px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${safeHotelName}</h1>
      <p style="margin:6px 0 0;color:#A8A29E;font-size:13px;">Booking Confirmation</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#44403C;font-size:15px;line-height:1.5;">
        Hi ${safeFirstName}, your reservation is confirmed.
      </p>

      <!-- Reference block -->
      <div style="background:#F5F4F2;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:10px;color:#A8A29E;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Booking Reference</p>
        <p style="margin:0;font-size:22px;font-weight:700;color:#1C1917;font-family:'Courier New',Courier,monospace;letter-spacing:.04em;">${safeReference}</p>
      </div>

      <!-- Details table -->
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tbody>
${roomRows}
          <tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;">Check-in</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;">${safeCheckIn}${safeCheckInTime ? ` <span style="color:#A8A29E;">from ${safeCheckInTime}</span>` : ""}</td>
          </tr>
          <tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;">Check-out</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;">${safeCheckOut}${safeCheckOutTime ? ` <span style="color:#A8A29E;">by ${safeCheckOutTime}</span>` : ""}</td>
          </tr>
          <tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;">Nights</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;">${safeNights}</td>
          </tr>
          ${safeAddress ? `<tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;">Address</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;">${safeAddress}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:12px 0 0;font-weight:700;color:#1C1917;font-size:15px;">Total</td>
            <td style="padding:12px 0 0;text-align:right;font-weight:700;color:#1C1917;font-size:15px;">${safeCurrency} ${booking.totalAmount.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      ${safePhone ? `<p style="margin:20px 0 0;font-size:13px;color:#78716C;">Questions? Call us at <a href="tel:${safeTelHref}" style="color:#1C1917;">${safePhone}</a></p>` : ""}
    </div>

    <!-- Footer -->
    <div style="background:#F5F4F2;padding:16px 32px;border-top:1px solid #E7E5E4;">
      <p style="margin:0;font-size:12px;color:#A8A29E;text-align:center;">
        This is an automated confirmation from ${safeHotelName}. Please keep this for your records.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Builds the HTML body for a booking cancellation email.
 */
export function buildCancellationEmail(
  hotelName: string,
  guestName: string,
  reference: string,
  hotelPhone?: string | null
): string {
  const rawFirstName = guestName.trim().split(/\s+/)[0] || guestName;
  const safeHotelName = escapeHtml(hotelName);
  const safeFirstName = escapeHtml(rawFirstName);
  const safeReference = escapeHtml(reference);
  const safePhone = hotelPhone ? escapeHtml(hotelPhone) : null;
  const safeTelHref = hotelPhone ? escapeHtml(sanitizeTelHref(hotelPhone)) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Booking Cancelled — ${safeReference}</title></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;border:1px solid #E7E5E4;overflow:hidden;">
    <div style="background:#1C1917;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${safeHotelName}</h1>
      <p style="margin:6px 0 0;color:#A8A29E;font-size:13px;">Booking Cancellation</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;color:#44403C;font-size:15px;">Hi ${safeFirstName},</p>
      <p style="margin:0 0 16px;color:#44403C;font-size:15px;">
        Your booking <strong style="font-family:monospace;">${safeReference}</strong> at <strong>${safeHotelName}</strong> has been cancelled.
      </p>
      <p style="margin:0;color:#78716C;font-size:14px;">
        If this was unexpected, please contact us directly${safePhone ? ` at <a href="tel:${safeTelHref}" style="color:#1C1917;">${safePhone}</a>` : ""}.
      </p>
    </div>
  </div>
</body>
</html>`;
}
