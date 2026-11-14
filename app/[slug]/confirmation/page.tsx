import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Check, Plus, Phone, XCircle } from "lucide-react";
import { CopyButton } from "@/components/booking/copy-button";
import { AwaitingPayment } from "@/components/booking/awaiting-payment";
import { BookingStatusHero } from "@/components/booking/booking-status-hero";
import { BookingHeader } from "@/components/booking/booking-progress";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { occupancyText } from "@/lib/bookings/cart";
import { bookingReferenceParam, paystackReferenceParam } from "@/lib/validation/params";
import { getPublicHotel } from "../_lib/get-public-hotel";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

function scalar(v: SearchParamValue): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function fmtShortDay(iso: string) {
  try {
    return format(parseISO(iso), "EEE d MMM");
  } catch {
    return iso;
  }
}

function fmtClockTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return /^\d{2}:\d{2}:\d{2}$/.test(raw) ? raw.slice(0, 5) : raw;
}

type RoomTypeRel = {
  name?: string | null;
  images?: unknown;
} | null;

function firstImageUrl(rel: RoomTypeRel): string | null {
  if (!rel || !Array.isArray(rel.images)) return null;
  const first = rel.images[0] as { url?: unknown } | undefined;
  return typeof first?.url === "string" ? first.url : null;
}

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
  room_types: RoomTypeRel;
};

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
};

type BookingState = "confirmed" | "awaiting_payment" | "expired" | "cancelled";

export default async function ConfirmationPage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const reference = scalar(sp.bref) ?? scalar(sp.reference);

  if (!reference || !bookingReferenceParam.safeParse(reference).success) {
    notFound();
  }

  // Paystack's redirect appends `trxref` and `reference` (both the transaction
  // reference) to the callback URL, which carries the booking as `bref`.
  // Without `bref`, `reference` is the booking itself, not a payment to check.
  const paymentRefCandidate =
    scalar(sp.trxref) ?? (scalar(sp.bref) ? scalar(sp.reference) : undefined);
  const paymentRef =
    paymentRefCandidate && paystackReferenceParam.safeParse(paymentRefCandidate).success
      ? paymentRefCandidate
      : null;

  const hotel = await getPublicHotel(slug);
  if (!hotel) notFound();

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, reference, group_id, status, payment_status, payment_preference, cancellation_reason, check_in, check_out, nights, adults, children, subtotal, tax_amount, total_amount, currency, rooms_count, guests(full_name, email), room_types(name, images)"
    )
    .eq("hotel_id", hotel.id)
    .eq("reference", reference)
    .single();

  if (!booking) notFound();

  const groupId = booking.group_id;
  const isGroup = groupId != null;
  let lines: GroupLine[] = [];
  if (groupId != null) {
    const { data: groupRows } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, reference, check_in, check_out, nights, subtotal, tax_amount, total_amount, adults, children, rooms_count, payment_status, room_types(name, images)"
      )
      .eq("hotel_id", hotel.id)
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });
    lines = (groupRows as GroupLine[] | null) ?? [];
  }

  const currency = booking.currency ?? hotel.currency ?? "GHS";

  const sumTotal = isGroup
    ? fromMinor(
        sumMinor(
          lines.map((l) => toMinor(l.total_amount ?? 0, currency))
        ),
        currency
      )
    : booking.total_amount ?? 0;

  const guestName =
    (booking.guests as { full_name?: string | null } | null)?.full_name ??
    "Guest";
  const guestEmail =
    (booking.guests as { email?: string | null } | null)?.email ?? null;
  const singleRoomRel = booking.room_types as RoomTypeRel;
  const singleRoomName = singleRoomRel?.name ?? "Room";

  const fullyPaid = isGroup
    ? lines.length > 0 && lines.every((l) => l.payment_status === "paid")
    : booking.payment_status === "paid";

  let state: BookingState;
  if (
    booking.status === "confirmed" ||
    booking.status === "checked_in" ||
    fullyPaid
  ) {
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

  const fmtMoney = (n: number) =>
    `${currency} ${n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const firstName = guestName.trim().split(/\s+/)[0] || "Guest";
  const calendarUrl = `/api/booking/${slug}/calendar?reference=${reference}`;
  const checkInClock = fmtClockTime(hotel.check_in_time);
  const checkOutClock = fmtClockTime(hotel.check_out_time);

  const checkInDisplay = `${fmtShortDay(booking.check_in)}${
    checkInClock ? `, ${checkInClock}` : ""
  }`;
  const checkOutDisplay = `${fmtShortDay(booking.check_out)}${
    checkOutClock ? `, ${checkOutClock}` : ""
  }`;

  const roomRows = isGroup
    ? lines.map((l) => {
        const name = l.room_types?.name ?? "Room";
        const qty = Math.max(1, l.rooms_count ?? 1);
        const n = Math.max(1, l.nights ?? 1);
        return {
          id: l.id,
          name: qty > 1 ? `${qty} × ${name}` : name,
          imageUrl: firstImageUrl(l.room_types),
          meta: `${occupancyText(l.adults ?? 1, l.children ?? 0)} · ${n} ${
            n === 1 ? "night" : "nights"
          }`,
        };
      })
    : [
        {
          id: booking.id,
          name:
            Math.max(1, booking.rooms_count ?? 1) > 1
              ? `${Math.max(1, booking.rooms_count ?? 1)} × ${singleRoomName}`
              : singleRoomName,
          imageUrl: firstImageUrl(singleRoomRel),
          meta: `${occupancyText(
            booking.adults ?? 1,
            booking.children ?? 0
          )} · ${Math.max(1, booking.nights ?? 1)} ${
            Math.max(1, booking.nights ?? 1) === 1 ? "night" : "nights"
          }`,
        },
      ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F5F5F5]">
      <a href="#confirmation-main" className="booking-skip-link">
        Skip to confirmation
      </a>

      <BookingHeader
        hotelName={hotel.name}
        logoUrl={hotel.logo_url}
        currentStep={3}
        brandHref={`/${slug}`}
      />

      <main
        id="confirmation-main"
        className="flex-1 flex flex-col items-center booking-safe-x py-6 md:pt-10 md:pb-12 pb-[max(2rem,env(safe-area-inset-bottom))]"
      >
        <div className="w-full max-w-[720px] space-y-4 md:space-y-6">
          {/* ── Hero status header (`rHbwg` / `CXvyB`) ── */}
          {state === "awaiting_payment" ? (
            // Checks a returning payment before it ever asks for one.
            <AwaitingPayment
              slug={slug}
              reference={booking.reference}
              paymentRef={paymentRef}
              firstName={firstName}
              amountLabel={fmtMoney(sumTotal)}
              hotelPhone={hotel.phone ?? null}
            />
          ) : state === "confirmed" ? (
            <BookingStatusHero
              tone="success"
              icon={<Check className="size-6" strokeWidth={2.5} />}
              title={`You're booked, ${firstName}.`}
              subtitle={
                guestEmail
                  ? `Confirmation sent to ${guestEmail}`
                  : "Your reservation is confirmed."
              }
            />
          ) : (
            <BookingStatusHero
              tone="danger"
              icon={<XCircle className="size-6" strokeWidth={2} />}
              title={state === "expired" ? "Reservation expired" : "Reservation cancelled"}
              subtitle={
                state === "expired"
                  ? "Payment was not completed within the 30-minute hold window."
                  : "This reservation is no longer active."
              }
            />
          )}

          {/* ── Expired / Cancelled recovery cards ── */}
          {(state === "expired" || state === "cancelled") && (
            <div className="rounded-2xl md:rounded-3xl bg-white border border-[#E4E4E7] p-6 space-y-4 text-center">
              <p className="text-sm text-[#71717A] leading-relaxed max-w-md mx-auto">
                {state === "expired"
                  ? "The held rooms have been released back into inventory. Start a fresh search to check current availability."
                  : "If you believe you were charged in error, please reach out to the property with your booking reference."}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href={`/${slug}`}
                  className="booking-btn-primary h-10 px-6 text-sm inline-flex items-center justify-center w-full sm:w-auto touch-manipulation"
                >
                  Book a new stay
                </Link>
                {hotel.phone && (
                  <a
                    href={`tel:${hotel.phone}`}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-[#18181B] hover:bg-[#EBEBEC]/60 transition-colors"
                  >
                    <Phone className="size-4" />
                    <span>Questions? {hotel.phone}</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ── Booking Reference Tinted Banner (`DO9ze` / `tmpSX`) ── */}
          {state !== "expired" && state !== "cancelled" && (
            <div className="rounded-2xl md:rounded-3xl bg-[#0485F7]/15 px-4 py-4 md:px-6 md:py-6 flex flex-col items-center text-center gap-2">
              <p className="text-2xs md:text-xs font-medium tracking-[0.2px] text-[#18181B]">
                Booking reference
              </p>
              <div className="flex items-center justify-center gap-3 md:gap-3 max-w-full">
                <span className="booking-mono text-2xl md:text-[30px] font-semibold tracking-[-0.5px] text-[#0485F7] break-all">
                  {booking.reference}
                </span>
                <CopyButton text={booking.reference} />
              </div>
              <p className="text-2xs md:text-xs text-[#71717A]">
                Show this at the front desk
                {checkInClock
                  ? ` · check-in opens ${checkInClock}, ${fmtShortDay(
                      booking.check_in
                    )}`
                  : ` · ${fmtShortDay(booking.check_in)}`}
              </p>
            </div>
          )}

          {/* ── Stay & Payment Details Card (`EaZ1D` / `MyNzy`) ── */}
          {state !== "expired" && state !== "cancelled" && (
            <div className="rounded-2xl md:rounded-3xl bg-white border border-[#E4E4E7] p-4 md:px-6 md:py-6 space-y-3 md:space-y-4">
              {/* Check-in / Check-out */}
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-2xs font-medium text-[#71717A]">
                    Check-in
                  </p>
                  <p className="text-sm font-medium text-[#18181B]">
                    {checkInDisplay}
                  </p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-2xs font-medium text-[#71717A]">
                    Check-out
                  </p>
                  <p className="text-sm font-medium text-[#18181B]">
                    {checkOutDisplay}
                  </p>
                </div>
              </div>

              <div className="h-px bg-[#E4E4E7]" />

              {/* Booked rooms with thumbnails */}
              <div className="space-y-3">
                {roomRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-3 md:gap-3">
                    <div className="relative h-9 w-12 md:h-10 md:w-14 shrink-0 overflow-hidden rounded-xl bg-[#EBEBEC]">
                      {row.imageUrl ? (
                        <Image
                          src={row.imageUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-2xs font-semibold text-[#71717A]">
                          {row.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-semibold text-[#18181B] truncate">
                        {row.name}
                      </p>
                      <p className="text-2xs md:text-xs text-[#71717A]">
                        {row.meta}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="h-px bg-[#E4E4E7]" />

              {/* Payment chip + Total */}
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-2 md:space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {fullyPaid ? (
                      <>
                        <span className="inline-flex items-center rounded-full bg-[#17C964]/15 px-2 py-1 text-xs font-medium text-[#17C964]">
                          Paid
                        </span>
                        <span className="text-2xs md:text-xs text-[#71717A]">
                          Paid online
                        </span>
                      </>
                    ) : booking.payment_preference === "pay_now" ? (
                      <>
                        <span className="inline-flex items-center rounded-full bg-[#F5A524]/15 px-2 py-1 text-xs font-medium text-[#F5A524]">
                          Pending
                        </span>
                        <span className="text-2xs md:text-xs text-[#71717A]">
                          Awaiting online payment
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center rounded-full bg-[#0485F7]/15 px-2 py-1 text-xs font-medium text-[#0485F7]">
                          Pay on arrival
                        </span>
                        <span className="text-2xs md:text-xs text-[#71717A]">
                          Settle at check-in
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm md:text-md font-semibold text-[#18181B]">
                    Total
                  </p>
                </div>

                <p className="booking-mono text-xl md:text-2xl font-semibold tracking-[-0.4px] text-[#18181B]">
                  {fmtMoney(sumTotal)}
                </p>
              </div>
            </div>
          )}

          {/* ── Bottom Action Buttons (`EDLkf` Desktop / `KApnJ` Mobile) ── */}
          {state === "confirmed" && (
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-center gap-3 md:gap-3">
              <a
                href={calendarUrl}
                download={`booking-${reference}.ics`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#DEDEE0] bg-white hover:bg-[#EBEBEC]/45 px-4 text-sm font-medium text-[#18181B] transition-colors touch-manipulation"
              >
                <Plus className="size-4 text-[#18181B]" strokeWidth={2} />
                <span>Add to calendar</span>
              </a>

              {hotel.phone && (
                <a
                  href={`tel:${hotel.phone}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full hover:bg-[#EBEBEC]/55 px-4 text-sm font-medium text-[#18181B] transition-colors touch-manipulation"
                >
                  <Phone
                    className="size-4 text-[#18181B]"
                    strokeWidth={2}
                  />
                  <span>Questions? {hotel.phone}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
