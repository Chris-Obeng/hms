import { sendEmailViaResend } from "@/lib/notifications/resend";

export async function sendPaymentReceipt(params: {
  hotelName: string;
  currency: string;
  guestName: string;
  guestEmail: string | null | undefined;
  reference: string;
  paymentId: string;
  amountPaid: number;
  outstandingBalance: number;
}): Promise<void> {
  const email = params.guestEmail?.trim();
  if (!email) return;

  const balanceLine = params.outstandingBalance > 0
    ? `<p style="margin:12px 0 0;color:#57534e;">Outstanding balance: <strong>${params.currency} ${params.outstandingBalance.toLocaleString()}</strong></p>`
    : `<p style="margin:12px 0 0;color:#166534;">Booking is fully paid.</p>`;

  const html = `<!doctype html><html><body style="margin:0;background:#fafaf8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#292524;"><div style="max-width:560px;margin:32px auto;border:1px solid #e7e5e4;background:#fff;padding:32px;"><h1 style="margin:0 0 8px;font-size:22px;">Payment received</h1><p style="margin:0 0 20px;color:#78716c;">${params.hotelName}</p><p>Hi ${params.guestName.split(" ")[0] || params.guestName},</p><p>We received <strong>${params.currency} ${params.amountPaid.toLocaleString()}</strong> for booking <strong>${params.reference}</strong>.</p>${balanceLine}</div></body></html>`;

  await sendEmailViaResend({
    hotelName: params.hotelName,
    to: email,
    subject: `Payment Receipt — ${params.reference}`,
    html,
    idempotencyKey: `payment_received/${params.paymentId}`,
  });
}
