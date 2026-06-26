import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { CopyButton } from "./_copy-button";
import { PaymentVerifier } from "./_payment-verifier";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ reference?: string; slug?: string; trxref?: string }>;

export default async function ConfirmationPage({ searchParams }: { searchParams: SearchParams }) {
  const { reference, trxref } = await searchParams;
  const h = await headers();
  const slug = h.get("x-hotel-slug") ?? "";

  // Paystack redirects back with `trxref` as the payment reference — not the booking reference.
  // We embed booking_reference in the callback_url as `reference` param directly.
  const bookingRef = reference;

  if (!bookingRef) notFound();

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, name, address, city, phone, check_in_time, check_out_time")
    .or(`slug.eq.${slug},custom_domain.eq.${slug}`)
    .single();
  if (!hotel) notFound();

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("id, reference, status, payment_status, check_in, check_out, nights, total_amount, currency, guests(full_name, email), room_types(name)")
    .eq("hotel_id", hotel.id)
    .eq("reference", bookingRef)
    .single();
  if (!booking) notFound();

  const guestName = (booking.guests as any)?.full_name ?? "Guest";
  const roomName = (booking.room_types as any)?.name ?? "Room";
  const isPending = booking.status === "pending"; // pay_now but webhook not yet fired

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <CheckCircle2 className="size-14 text-emerald-600" strokeWidth={1.5} />
        </div>

        <div>
          <p className="booking-heading-italic text-[#78716C] text-base mb-1">Booking confirmed</p>
          <h1 className="booking-heading text-4xl text-[#1C1917]">Thank you, {guestName.split(" ")[0]}!</h1>
        </div>

        {/* Payment verifier — shown when coming back from Paystack redirect */}
        {isPending && trxref && (
          <PaymentVerifier paymentRef={trxref} slug={slug} bookingRef={bookingRef} />
        )}

        {/* Reference */}
        <div className="bg-white rounded-2xl border border-[#E7E5E4] p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#A8A29E]">Booking Reference</p>
          <div className="flex items-center justify-center gap-3">
            <span className="font-mono text-2xl font-bold text-[#1C1917] tracking-wider">{booking.reference}</span>
            <CopyButton text={booking.reference} />
          </div>
          <p className="text-xs text-[#78716C]">
            A confirmation has been sent to your email and phone.
          </p>
        </div>

        {/* Stay details */}
        <div className="bg-white rounded-2xl border border-[#E7E5E4] p-5 text-sm space-y-2.5">
          <Row label="Room" value={roomName} />
          <Row label="Check-in" value={`${booking.check_in}${hotel.check_in_time ? ` from ${hotel.check_in_time}` : ""}`} />
          <Row label="Check-out" value={`${booking.check_out}${hotel.check_out_time ? ` by ${hotel.check_out_time}` : ""}`} />
          <Row label="Duration" value={`${booking.nights} night${(booking.nights ?? 1) !== 1 ? "s" : ""}`} />
          <div className="border-t border-[#F0EDE8] pt-2.5">
            <Row
              label="Total"
              value={`${booking.currency ?? "GHS"} ${(booking.total_amount ?? 0).toLocaleString()}`}
              bold
            />
            <Row
              label="Payment"
              value={booking.payment_status === "paid" ? "Paid online" : isPending && trxref ? "Confirming…" : "Pay at check-in"}
            />
          </div>
        </div>

        {/* Hotel contact */}
        <div className="text-sm text-[#78716C] space-y-1">
          <p className="font-medium text-[#1C1917]">{hotel.name}</p>
          {hotel.address && <p>{hotel.address}{hotel.city ? `, ${hotel.city}` : ""}</p>}
          {hotel.phone && <p>{hotel.phone}</p>}
        </div>

        <Link
          href="/"
          className="inline-block text-sm text-[#A8A29E] hover:text-[#1C1917] underline underline-offset-2 transition-colors"
        >
          ← Back to {hotel.name}
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#A8A29E]">{label}</span>
      <span className={`text-right ${bold ? "font-bold text-[#1C1917]" : "text-[#44403C]"}`}>{value}</span>
    </div>
  );
}
