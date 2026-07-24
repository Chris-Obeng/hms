import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { CheckCircle2, CalendarPlus, MapPin, Phone } from "lucide-react";
import { CopyButton } from "@/components/booking/copy-button";
import { PaymentVerifier } from "@/components/booking/payment-verifier";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

/** Paystack can duplicate params; always take the first scalar value. */
function scalar(v: SearchParamValue): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function fmtDate(iso: string) {
  try {
    return format(parseISO(iso), "EEE, MMM d yyyy");
  } catch {
    return iso;
  }
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
};

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

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
    (booking.guests as { full_name?: string | null } | null)?.full_name ??
    "Guest";
  const guestEmail =
    (booking.guests as { email?: string | null } | null)?.email ?? null;
  const roomName =
    (booking.room_types as { name?: string | null } | null)?.name ?? "Room";
  const isPending = booking.status === "pending";
  const firstName = guestName.split(" ")[0];
  const location = [hotel.address, hotel.city].filter(Boolean).join(", ");

  const calendarUrl = `/api/booking/${slug}/calendar?reference=${reference}`;

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#confirmation-main" className="booking-skip-link">
        Skip to confirmation
      </a>

      <header className="booking-header sticky top-0 z-40 booking-safe-x h-12 pt-[env(safe-area-inset-top)] flex items-center">
        <Link
          href={`/${slug}`}
          className="booking-heading text-sm sm:text-base text-[var(--bk-ink)] hover:opacity-80 transition-opacity truncate"
        >
          {hotel.name}
        </Link>
      </header>

      <main
        id="confirmation-main"
        className="flex-1 flex flex-col items-center justify-center booking-safe-x py-10 sm:py-12 md:py-16 pb-[max(2.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="w-full max-w-md space-y-5 sm:space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex size-14 items-center justify-center rounded-full bg-[var(--bk-success)]/10 text-[var(--bk-success)] ring-1 ring-[var(--bk-success)]/15">
              <CheckCircle2 className="size-8" strokeWidth={1.5} />
            </div>
            <div>
              <p className="booking-heading-italic text-[var(--bk-muted)] text-base mb-1 pb-0.5">
                Booking confirmed
              </p>
              <h1 className="booking-heading text-3xl sm:text-4xl text-[var(--bk-ink)] text-balance">
                Thank you, {firstName}
              </h1>
            </div>
          </div>

          {isPending && trxref && (
            <PaymentVerifier
              paymentRef={trxref}
              slug={slug}
            />
          )}

          <div className="booking-surface p-5 sm:p-6 text-center space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--bk-muted)]">
              Booking reference
            </p>
            <div className="flex items-center justify-center gap-2 sm:gap-3 min-w-0">
              <span className="font-mono text-lg sm:text-2xl font-bold text-[var(--bk-ink)] tracking-wider booking-price break-all">
                {booking.reference}
              </span>
              <CopyButton text={booking.reference} />
            </div>
            <p className="text-xs text-[var(--bk-muted)]">
              {guestEmail
                ? `Confirmation sent to ${guestEmail}`
                : "Confirmation sent to your email and phone."}
            </p>
          </div>

          <div className="booking-surface p-5 text-sm space-y-2.5">
            <Row label="Guest" value={guestName} />
            <Row label="Room" value={roomName} />
            <Row
              label="Check-in"
              value={`${fmtDate(booking.check_in)}${
                hotel.check_in_time ? ` from ${hotel.check_in_time}` : ""
              }`}
            />
            <Row
              label="Check-out"
              value={`${fmtDate(booking.check_out)}${
                hotel.check_out_time ? ` by ${hotel.check_out_time}` : ""
              }`}
            />
            <Row
              label="Duration"
              value={`${booking.nights} night${
                (booking.nights ?? 1) !== 1 ? "s" : ""
              }`}
            />
            <div className="border-t border-[var(--bk-line)] pt-2.5 space-y-2.5">
              <Row
                label="Total"
                value={`${booking.currency ?? "GHS"} ${(
                  booking.total_amount ?? 0
                ).toLocaleString()}`}
                bold
              />
              <Row
                label="Payment"
                value={
                  booking.payment_status === "paid"
                    ? "Paid online"
                    : "Pay at check-in"
                }
              />
            </div>
          </div>

          {(location || hotel.phone) && (
            <div className="booking-surface-soft p-4 space-y-2 text-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--bk-muted)]">
                Arrival details
              </p>
              {location && (
                <p className="flex items-start gap-2 text-[var(--bk-ink-soft)]">
                  <MapPin
                    className="size-3.5 mt-0.5 shrink-0 text-[var(--bk-muted)]"
                    strokeWidth={1.75}
                  />
                  <span>{location}</span>
                </p>
              )}
              {hotel.phone && (
                <a
                  href={`tel:${hotel.phone}`}
                  className="flex items-center gap-2 text-[var(--bk-ink-soft)] hover:text-[var(--bk-ink)] transition-colors"
                >
                  <Phone
                    className="size-3.5 shrink-0 text-[var(--bk-muted)]"
                    strokeWidth={1.75}
                  />
                  {hotel.phone}
                </a>
              )}
            </div>
          )}

          <a
            href={calendarUrl}
            download={`booking-${reference}.ics`}
            className="flex items-center justify-center gap-2 w-full h-11 rounded-xl border border-[var(--bk-line)] bg-[var(--bk-surface)] text-[var(--bk-ink)] text-sm font-semibold hover:bg-[var(--bk-surface-soft)] active:scale-[0.99] transition-all"
          >
            <CalendarPlus
              className="size-4 text-[var(--bk-muted)]"
              strokeWidth={1.75}
            />
            Add to calendar
          </a>

          <div className="text-center pt-1">
            <Link
              href={`/${slug}`}
              className="text-sm text-[var(--bk-muted)] hover:text-[var(--bk-ink)] underline underline-offset-4 transition-colors"
            >
              Back to {hotel.name}
            </Link>
          </div>
        </div>
      </main>
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
      <span className="text-[var(--bk-muted)]">{label}</span>
      <span
        className={`text-right ${
          bold
            ? "font-semibold booking-price text-[var(--bk-ink)]"
            : "text-[var(--bk-ink)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
