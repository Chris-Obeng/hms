/**
 * lib/notifications/email-templates.ts
 *
 * HTML email templates for transactional notifications.
 * Used by both the Resend sender and the legacy Arkesel email sender.
 */

import type { BookingNotifyData } from "@/lib/arkesel";

/**
 * Builds the HTML body for a booking confirmation email.
 * Produces a self-contained, inbox-safe HTML email (no external stylesheets).
 */
export function buildConfirmationEmail(
  hotelName: string,
  booking: BookingNotifyData,
  currency: string
): string {
  const firstName = booking.guestName.split(" ")[0] ?? booking.guestName;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmed — ${booking.reference}</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:16px;border:1px solid #E7E5E4;overflow:hidden;">

    <!-- Header -->
    <div style="background:#1C1917;padding:28px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${hotelName}</h1>
      <p style="margin:6px 0 0;color:#A8A29E;font-size:13px;">Booking Confirmation</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#44403C;font-size:15px;line-height:1.5;">
        Hi ${firstName}, your reservation is confirmed.
      </p>

      <!-- Reference block -->
      <div style="background:#F5F4F2;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:10px;color:#A8A29E;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Booking Reference</p>
        <p style="margin:0;font-size:22px;font-weight:700;color:#1C1917;font-family:'Courier New',Courier,monospace;letter-spacing:.04em;">${booking.reference}</p>
      </div>

      <!-- Details table -->
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tbody>
          <tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;width:45%;">Room</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;font-weight:500;">${booking.roomName}</td>
          </tr>
          <tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;">Check-in</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;">${booking.checkIn}${booking.checkInTime ? ` <span style="color:#A8A29E;">from ${booking.checkInTime}</span>` : ""}</td>
          </tr>
          <tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;">Check-out</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;">${booking.checkOut}${booking.checkOutTime ? ` <span style="color:#A8A29E;">by ${booking.checkOutTime}</span>` : ""}</td>
          </tr>
          <tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;">Nights</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;">${booking.nights}</td>
          </tr>
          ${booking.hotelAddress ? `<tr style="border-bottom:1px solid #F5F4F2;">
            <td style="padding:10px 0;color:#A8A29E;">Address</td>
            <td style="padding:10px 0;text-align:right;color:#44403C;">${booking.hotelAddress}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:12px 0 0;font-weight:700;color:#1C1917;font-size:15px;">Total</td>
            <td style="padding:12px 0 0;text-align:right;font-weight:700;color:#1C1917;font-size:15px;">${currency} ${booking.totalAmount.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      ${booking.hotelPhone ? `<p style="margin:20px 0 0;font-size:13px;color:#78716C;">Questions? Call us at <a href="tel:${booking.hotelPhone}" style="color:#1C1917;">${booking.hotelPhone}</a></p>` : ""}
    </div>

    <!-- Footer -->
    <div style="background:#F5F4F2;padding:16px 32px;border-top:1px solid #E7E5E4;">
      <p style="margin:0;font-size:12px;color:#A8A29E;text-align:center;">
        This is an automated confirmation from ${hotelName}. Please keep this for your records.
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
  const firstName = guestName.split(" ")[0] ?? guestName;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Booking Cancelled — ${reference}</title></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;border:1px solid #E7E5E4;overflow:hidden;">
    <div style="background:#1C1917;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${hotelName}</h1>
      <p style="margin:6px 0 0;color:#A8A29E;font-size:13px;">Booking Cancellation</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;color:#44403C;font-size:15px;">Hi ${firstName},</p>
      <p style="margin:0 0 16px;color:#44403C;font-size:15px;">
        Your booking <strong style="font-family:monospace;">${reference}</strong> at <strong>${hotelName}</strong> has been cancelled.
      </p>
      <p style="margin:0;color:#78716C;font-size:14px;">
        If this was unexpected, please contact us directly${hotelPhone ? ` at <a href="tel:${hotelPhone}" style="color:#1C1917;">${hotelPhone}</a>` : ""}.
      </p>
    </div>
  </div>
</body>
</html>`;
}
