import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, CalendarPlus } from "lucide-react";
import { CopyButton } from "@/components/booking/copy-button";
import { PaymentVerifier } from "@/components/booking/payment-verifier";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

/** Paystack can duplicate params; always take the first scalar value. */
function scalar(v: SearchParamValue): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

type Props = {
  params: Promise<{ slug: string }>;
  // 'bref'     = our booking reference (set by us in the callback URL)
  // 'reference' = Paystack payment reference (appended by Paystack)
  // 'trxref'   = Paystack transaction reference (appended by Paystack)
  searchParams: Promise<Record<string, SearchParamValue>>;
};

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  // 'bref' is the booking reference we embed in the callback URL.
  // Fall back to 'reference' only for pay-at-checkin flows that still use it.
  const reference = scalar(sp.bref) ?? scalar(sp.reference);
  const trxref = scalar(sp.trxref) ?? scalar(sp.reference);

  if (!reference) notFound();

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, name, address, city, phone, check_in_time, check_out_time")
    .eq("slug", slug)
    .single();

  if (!hotel) notFound();

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, reference, status, payment_status, check_in, check_out, nights, total_amount, currency, guests(full_name, email), room_types(name)"
    )
    .eq("hotel_id", hotel.id)
    .eq("reference", reference)
    .single();

  if (!booking) notFound();

  const guestName =
    (booking.guests as { full_name?: string | null } | null)?.full_name ?? "Guest";
  const roomName =
    (booking.room_types as { name?: string | null } | null)?.name ?? "Room";
  const isPending = booking.status === "pending";

  const calendarUrl = `/api/booking/${slug}/calendar?reference=${reference}`;

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <CheckCircle2 className="size-14 text-emerald-600" strokeWidth={1.5} />
        </div>

        <div>
          <p className="booking-heading-italic text-[#78716C] text-base mb-1">
            Booking confirmed
          </p>
          <h1 className="booking-heading text-4xl text-[#1C1917]">
            Thank you, {guestName.split(" ")[0]}!
          </h1>
        </div>

        {/* Payment verifier — shown when coming back from Paystack */}
        {isPending && trxref && (
          <PaymentVerifier paymentRef={trxref} slug={slug} bookingRef={reference} />
        )}

        {/* Reference */}
        <div className="bg-white rounded-2xl border border-[#E7E5E4] p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#A8A29E]">
            Booking Reference
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className="font-mono text-2xl font-bold text-[#1C1917] tracking-wider">
              {booking.reference}
            </span>
            <CopyButton text={booking.reference} />
          </div>
          <p className="text-xs text-[#78716C]">
            A confirmation has been sent to your email and phone.
          </p>
        </div>

        {/* Stay details */}
        <div className="bg-white rounded-2xl border border-[#E7E5E4] p-5 text-sm space-y-2.5">
          <Row label="Room" value={roomName} />
          <Row
            label="Check-in"
            value={`${booking.check_in}${hotel.check_in_time ? ` from ${hotel.check_in_time}` : ""}`}
          />
          <Row
            label="Check-out"
            value={`${booking.check_out}${hotel.check_out_time ? ` by ${hotel.check_out_time}` : ""}`}
          />
          <Row
            label="Duration"
            value={`${booking.nights} night${(booking.nights ?? 1) !== 1 ? "s" : ""}`}
          />
          <div className="border-t border-[#F0EDE8] pt-2.5">
            <Row
              label="Total"
              value={`${booking.currency ?? "GHS"} ${(booking.total_amount ?? 0).toLocaleString()}`}
              bold
            />
            <Row
              label="Payment"
              value={booking.payment_status === "paid" ? "Paid online" : "Pay at check-in"}
            />
          </div>
        </div>

        {/* Add to Calendar */}
        <a
          href={calendarUrl}
          download={`booking-${reference}.ics`}
          className="flex items-center justify-center gap-2 w-full h-11 rounded-2xl border border-[#E7E5E4] bg-white text-[#44403C] text-sm font-medium hover:bg-[#F5F4F2] transition-colors"
        >
          <CalendarPlus className="size-4 text-[#78716C]" />
          Add to Calendar
        </a>

        <Link
          href={`/${slug}`}
          className="inline-block text-sm text-[#A8A29E] hover:text-[#1C1917] underline underline-offset-2 transition-colors"
        >
          Back to {hotel.name}
        </Link>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#A8A29E]">{label}</span>
      <span className={`text-right ${bold ? "font-bold text-[#1C1917]" : "text-[#44403C]"}`}>
        {value}
      </span>
    </div>
  );
}
