import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2,
  CalendarPlus,
  MapPin,
  Phone,
  Clock,
  XCircle,
} from "lucide-react";
import { CopyButton } from "@/components/booking/copy-button";
import { PaymentVerifier } from "@/components/booking/payment-verifier";
import { CompletePaymentPanel } from "@/components/booking/complete-payment-panel";
import { formatCurrency } from "@/lib/format";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { occupancyText } from "@/lib/bookings/cart";

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

// Per-line occupancy comes from occupancyText() in lib/bookings/cart.ts — the
// same phrasing the booking engine, the panels and the email use.

/** One sibling line of a reservation group, as this page reads it. */
type GroupLine = {
  id: string;
  reference: string;
  check_in: string;
  check_out: string;
  nights: number | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  adults: number | null;
  children: number | null;
  rooms_count: number | null;
  payment_status: string | null;
  room_types: { name?: string | null } | null;
};

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
};

type BookingState = "confirmed" | "awaiting_payment" | "expired" | "cancelled";

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const reference = scalar(sp.bref) ?? scalar(sp.reference);
  const trxref = scalar(sp.trxref) ?? scalar(sp.reference);

  if (!reference) notFound();

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, name, address, city, phone, check_in_time, check_out_time, currency")
    .eq("slug", slug)
    .single();

  if (!hotel) notFound();

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, reference, group_id, status, payment_status, payment_preference, cancellation_reason, check_in, check_out, nights, subtotal, tax_amount, total_amount, currency, rooms_count, guests(full_name, email), room_types(name)"
    )
    .eq("hotel_id", hotel.id)
    .eq("reference", reference)
    .single();

  if (!booking) notFound();

  // ── Reservation group ────────────────────────────────────────
  // A multi-room reservation is N sibling `bookings` rows sharing one group_id;
  // the URL reference is the anchor's, so `booking` is the anchor. group_id NULL
  // is an ordinary single-room booking — `lines` stays empty and the page renders
  // exactly as it always has.
  const groupId = booking.group_id;
  const isGroup = groupId != null;
  let lines: GroupLine[] = [];
  if (groupId != null) {
    const { data: groupRows } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, reference, check_in, check_out, nights, subtotal, tax_amount, total_amount, adults, children, rooms_count, payment_status, room_types(name)"
      )
      .eq("hotel_id", hotel.id)
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });
    lines = (groupRows as GroupLine[] | null) ?? [];
  }

  const currency = booking.currency ?? hotel.currency ?? "GHS";

  // Group money is the sum across lines; a single-room booking uses its own row.
  // Summed in minor units so the total reconciles to the pesewa with the single
  // amount Paystack charged (itself the sum of the line totals).
  const sumSubtotal = isGroup
    ? fromMinor(
        sumMinor(lines.map((l) => toMinor(l.subtotal ?? l.total_amount ?? 0, currency))),
        currency
      )
    : booking.subtotal ?? booking.total_amount ?? 0;
  const sumTax = isGroup
    ? fromMinor(sumMinor(lines.map((l) => toMinor(l.tax_amount ?? 0, currency))), currency)
    : booking.tax_amount ?? 0;
  const sumTotal = isGroup
    ? fromMinor(sumMinor(lines.map((l) => toMinor(l.total_amount ?? 0, currency))), currency)
    : booking.total_amount ?? 0;

  const guestName =
    (booking.guests as { full_name?: string | null } | null)?.full_name ?? "Guest";
  const guestEmail =
    (booking.guests as { email?: string | null } | null)?.email ?? null;
  const roomName =
    (booking.room_types as { name?: string | null } | null)?.name ?? "Room";

  // ── Resolve the guest-facing state ───────────────────────────
  // A group is fully paid only when every line is; a single booking uses its own.
  const fullyPaid = isGroup
    ? lines.length > 0 && lines.every((l) => l.payment_status === "paid")
    : booking.payment_status === "paid";
  let state: BookingState;
  if (booking.status === "confirmed" || booking.status === "checked_in" || fullyPaid) {
    state = "confirmed";
  } else if (booking.status === "pending") {
    state = "awaiting_payment";
  } else if (
    booking.status === "cancelled" &&
    booking.cancellation_reason === "payment_timeout"
  ) {
    state = "expired";
  } else {
    state = "cancelled";
  }

  const fmtMoney = (n: number) => formatCurrency(n, currency);
  const firstName = guestName.split(" ")[0];
  const location = [hotel.address, hotel.city].filter(Boolean).join(", ");
  const roomsCount = isGroup
    ? lines.reduce((s, l) => s + Math.max(1, l.rooms_count ?? 1), 0)
    : Math.max(1, booking.rooms_count ?? 1);
  const calendarUrl = `/api/booking/${slug}/calendar?reference=${reference}`;

  const heading =
    state === "confirmed"
      ? `Thank you, ${firstName}`
      : state === "awaiting_payment"
        ? `Almost there, ${firstName}`
        : state === "expired"
          ? "Reservation expired"
          : "Reservation cancelled";

  const kicker =
    state === "confirmed"
      ? "Booking confirmed"
      : state === "awaiting_payment"
        ? "Complete your payment"
        : state === "expired"
          ? "Payment not completed in time"
          : "Booking cancelled";

  const statusIcon =
    state === "confirmed" ? (
      <CheckCircle2 className="size-8" strokeWidth={1.5} />
    ) : state === "awaiting_payment" ? (
      <Clock className="size-8" strokeWidth={1.5} />
    ) : (
      <XCircle className="size-8" strokeWidth={1.5} />
    );

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
            <div
              className="booking-status-icon booking-status-icon-hero"
              data-state={state}
            >
              {statusIcon}
            </div>
            <div>
              <p className="booking-heading-italic text-[var(--bk-muted)] text-base mb-1 pb-0.5">
                {kicker}
              </p>
              <h1 className="booking-heading text-3xl sm:text-4xl text-[var(--bk-ink)] text-balance">
                {heading}
              </h1>
            </div>
          </div>

          {/* ── State-specific panels ── */}
          {state === "awaiting_payment" && trxref && (
            <PaymentVerifier paymentRef={trxref} slug={slug} />
          )}

          {state === "awaiting_payment" && (
            <CompletePaymentPanel
              slug={slug}
              reference={booking.reference}
              amountLabel={fmtMoney(sumTotal)}
            />
          )}

          {state === "expired" && (
            <div className="booking-surface p-5 space-y-3 text-sm">
              <p className="text-[var(--bk-ink-soft)] leading-relaxed">
                This reservation was held for 30 minutes but payment was not
                completed, so the room has been released.
              </p>
              <Link
                href={`/${slug}/rooms`}
                className="booking-cta w-full h-11 rounded-xl text-sm inline-flex items-center justify-center touch-manipulation"
              >
                Check availability again
              </Link>
            </div>
          )}

          {state === "cancelled" && (
            <div className="booking-surface p-5 space-y-3 text-sm">
              <p className="text-[var(--bk-ink-soft)] leading-relaxed">
                This reservation was cancelled. If you were charged in error,
                please contact the hotel directly.
              </p>
              {(location || hotel.phone) && hotel.phone && (
                <a
                  href={`tel:${hotel.phone}`}
                  className="flex items-center gap-2 text-[var(--bk-accent)] font-semibold hover:underline"
                >
                  <Phone className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {hotel.phone}
                </a>
              )}
              <Link
                href={`/${slug}`}
                className="booking-cta w-full h-11 rounded-xl text-sm inline-flex items-center justify-center touch-manipulation"
              >
                Back to {hotel.name}
              </Link>
            </div>
          )}

          {/* ── Reference card — always visible for non-cancelled states ── */}
          {state !== "expired" && state !== "cancelled" && (
            <div className="booking-surface p-5 sm:p-6 text-center space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--bk-muted)]">
                {state === "confirmed" ? "Booking reference" : "Reservation reference"}
              </p>
              <div className="flex items-center justify-center gap-2 sm:gap-3 min-w-0">
                <span className="font-mono text-lg sm:text-2xl font-bold text-[var(--bk-ink)] tracking-wider booking-price break-all">
                  {booking.reference}
                </span>
                <CopyButton text={booking.reference} />
              </div>
              <p className="text-xs text-[var(--bk-muted)]">
                {state === "confirmed"
                  ? guestEmail
                    ? `Confirmation sent to ${guestEmail}`
                    : "Confirmation sent to your email and phone."
                  : "Keep this reference — you will need it at the hotel."}
              </p>
            </div>
          )}

          {/* ── Stay summary ── */}
          {state !== "expired" && state !== "cancelled" && (
            <div className="booking-surface p-5 text-sm space-y-3">
              <Row label="Guest" value={guestName} />

              {isGroup ? (
                <div className="border-t border-[var(--bk-line)] pt-3 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--bk-muted)]">
                    {roomsCount} room{roomsCount !== 1 ? "s" : ""}
                  </p>
                  {lines.map((l) => {
                    const name =
                      (l.room_types as { name?: string | null } | null)?.name ?? "Room";
                    const qty = Math.max(1, l.rooms_count ?? 1);
                    const n = l.nights ?? 1;
                    return (
                      <div key={l.id} className="flex justify-between gap-4 items-start">
                        <div className="min-w-0">
                          <p className="text-[var(--bk-ink)] font-medium">
                            {qty > 1 ? `${qty} × ${name}` : name}
                          </p>
                          <p className="text-xs text-[var(--bk-muted)] mt-0.5">
                            {fmtDate(l.check_in)} – {fmtDate(l.check_out)} · {n} night
                            {n !== 1 ? "s" : ""} · {occupancyText(l.adults ?? 1, l.children ?? 0)}
                          </p>
                        </div>
                        <span className="text-right booking-price text-[var(--bk-ink)] shrink-0">
                          {fmtMoney(l.total_amount ?? 0)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <Row label="Room" value={roomsCount > 1 ? `${roomsCount} × ${roomName}` : roomName} />
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
                </>
              )}
              <div className="border-t border-[var(--bk-line)] pt-3 space-y-2.5">
                {isGroup ? (
                  <Row label="Subtotal" value={fmtMoney(sumSubtotal)} />
                ) : (
                  <Row
                    label={`Rate${roomsCount > 1 ? ` × ${roomsCount} rooms` : ""}`}
                    value={fmtMoney(sumSubtotal)}
                  />
                )}
                {sumTax > 0 && (
                  <Row label="Taxes & fees" value={fmtMoney(sumTax)} />
                )}
                <Row label="Total" value={fmtMoney(sumTotal)} bold />
                <Row
                  label="Payment"
                  value={
                    fullyPaid
                      ? "Paid online"
                      : booking.payment_status === "partial"
                        ? "Partially paid"
                        : booking.payment_preference === "pay_now"
                          ? "Pending — not yet received"
                          : "Pay at check-in"
                  }
                />
              </div>
            </div>
          )}

          {state === "confirmed" && (location || hotel.phone) && (
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

          {state === "confirmed" && (
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
          )}

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
