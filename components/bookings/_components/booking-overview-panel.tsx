"use client";

import * as React from "react";
import { ArrowUpRight, Mail, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { Alert, Button, Chip, Disclosure, TextArea, toast } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatDateTime, formatRoomLabel, getNights } from "@/lib/format";
import { occupancyText } from "@/lib/bookings/cart";
import { canTransitionBooking, getSourceLabel, getStatusLabel } from "@/lib/booking-status";
import type { FullBookingDetail } from "./booking-detail-types";
import { getBookingPaymentAvailability } from "./booking-payment-availability";

interface BookingOverviewPanelProps {
  booking: FullBookingDetail;
  actionLoading?: string | null;
  /** Per-room lifecycle actions ("Check in Room 204"), including single-room ones. */
  onBulkAction?: (
    ids: string[],
    targetStatus: string,
    kind: "check_in" | "check_out"
  ) => void;
  /** Persist the internal note; the drawer owns the server action so this panel stays render-pure. */
  onSaveNotes?: (notes: string) => Promise<{ success: boolean; error?: string }>;
}

const LINE_DOTS: Record<string, string> = {
  confirmed: "bg-primary",
  checked_in: "bg-emerald-500",
  checked_out: "bg-muted-foreground/40",
  cancelled: "bg-destructive",
  no_show: "bg-destructive",
  pending: "bg-amber-500",
};

/**
 * Overview: the stay, the room, the money and the guest's contact are visible
 * at a glance. Booking metadata (source, timestamps, who booked it) sits behind
 * a "More details" disclosure so the default view stays quiet.
 */
export function BookingOverviewPanel({
  booking,
  actionLoading,
  onBulkAction,
  onSaveNotes,
}: BookingOverviewPanelProps) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const guestsLabel = occupancyText(booking.adults ?? 1, booking.children ?? 0);
  const group = booking.group;
  const currency = booking.currency ?? "GHS";
  const { totalDue, amountPaid, outstandingBalance, isFullyPaid } =
    getBookingPaymentAvailability(booking);
  const isCancelled = booking.status === "cancelled" || booking.status === "no_show";

  const roomLabel = formatRoomLabel(booking.room?.roomNumber);
  const roomValue = roomLabel
    ? `${roomLabel}${booking.room?.floor ? ` · Floor ${booking.room.floor}` : ""}`
    : null;

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none flex min-h-full flex-col gap-6 px-6 py-6">
      {booking.status === "cancelled" && booking.cancelledAt && (
        <Alert status="danger" className="rounded-2xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Cancelled {formatDateTime(booking.cancelledAt)}</Alert.Title>
            {booking.cancellationReason && (
              <Alert.Description>{booking.cancellationReason}</Alert.Description>
            )}
          </Alert.Content>
        </Alert>
      )}

      {/* Stay */}
      <section aria-label="Stay" className="rounded-2xl bg-secondary/60 p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <StayDate label="Check-in" date={booking.checkIn} at={booking.checkInAt} doneLabel="In" />
          <Chip size="sm" variant="secondary" className="bg-card font-medium tabular-nums">
            {nights} {nights === 1 ? "night" : "nights"}
          </Chip>
          <StayDate
            label="Check-out"
            date={booking.checkOut}
            at={booking.checkOutAt}
            doneLabel="Out"
            align="end"
          />
        </div>

        {!group && (
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Room</dt>
              <dd className="mt-1 truncate text-sm font-semibold text-foreground">
                {roomValue ?? <span className="text-amber-700">Not assigned</span>}
              </dd>
              <dd className="truncate text-xs text-muted-foreground">
                {booking.roomType?.name ?? "—"}
                {(booking.roomsCount ?? 0) > 1 && ` · ×${booking.roomsCount}`}
              </dd>
            </div>
            <div className="min-w-0 text-right">
              <dt className="text-xs text-muted-foreground">Guests</dt>
              <dd className="mt-1 truncate text-sm font-semibold text-foreground">{guestsLabel}</dd>
            </div>
          </dl>
        )}
      </section>

      {/* Rooms (multi-room reservations) */}
      {group && (
        <section aria-label="Rooms">
          <h3 className="text-xs font-medium text-muted-foreground">Rooms</h3>
          <ul className="mt-2 divide-y divide-border/60 rounded-2xl border border-border/60">
            {group.lines.map((l) => {
              const canIn = canTransitionBooking(l.status ?? "", "checked_in");
              const canOut = canTransitionBooking(l.status ?? "", "checked_out");
              return (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          LINE_DOTS[l.status ?? ""] ?? "bg-muted-foreground/40"
                        )}
                      />
                      {l.roomTypeName ?? "Room"}
                      {l.roomNumber ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {formatRoomLabel(l.roomNumber)}
                        </span>
                      ) : (
                        <span className="font-normal text-amber-700"> · Unassigned</span>
                      )}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {getStatusLabel(l.status ?? "")} · {occupancyText(l.adults ?? 1, l.children ?? 0)} ·{" "}
                      <span className="tabular-nums">{formatCurrency(l.totalAmount, currency)}</span>
                    </p>
                  </div>
                  {canIn && onBulkAction && (
                    <Button
                      size="sm"
                      variant="primary"
                      isDisabled={actionLoading === "bulk:check_in"}
                      onPress={() => onBulkAction([l.id], "checked_in", "check_in")}
                      className="shrink-0 rounded-lg font-semibold"
                    >
                      Check in
                    </Button>
                  )}
                  {canOut && onBulkAction && (
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={actionLoading === "bulk:check_out"}
                      onPress={() => onBulkAction([l.id], "checked_out", "check_out")}
                      className="shrink-0 rounded-lg font-semibold"
                    >
                      Check out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Money */}
      {!isCancelled && totalDue > 0 && (
        <section aria-label="Balance" className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {isFullyPaid ? "Paid in full" : "Balance due"}
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums text-foreground">
              {formatCurrency(isFullyPaid ? totalDue : outstandingBalance, currency)}
            </p>
          </div>
          <div className="text-right">
            <Chip
              size="sm"
              variant="soft"
              color={isFullyPaid ? "success" : amountPaid > 0 ? "warning" : "default"}
            >
              {isFullyPaid ? "Paid" : amountPaid > 0 ? "Partial" : "Unpaid"}
            </Chip>
            {!isFullyPaid && amountPaid > 0 && (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {formatCurrency(amountPaid, currency)} of {formatCurrency(totalDue, currency)} paid
              </p>
            )}
          </div>
        </section>
      )}

      {/* Guest contact */}
      {(booking.guest?.phone || booking.guest?.email || booking.guest?.id) && (
        <section aria-label="Guest" className="space-y-1">
          {booking.guest?.phone && (
            <ContactLink href={`tel:${booking.guest.phone}`} icon={<Phone className="size-4" />}>
              {booking.guest.phone}
            </ContactLink>
          )}
          {booking.guest?.email && (
            <ContactLink href={`mailto:${booking.guest.email}`} icon={<Mail className="size-4" />}>
              {booking.guest.email}
            </ContactLink>
          )}
          {booking.guest?.id && (
            <Link
              href={`/dashboard/customers?guestId=${booking.guest.id}`}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Guest profile
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </section>
      )}

      {/* Notes and requests */}
      <NotesSection booking={booking} onSaveNotes={onSaveNotes} />

      {/* Secondary booking facts */}
      <Disclosure className="border-t border-border/60 pt-2">
        <Disclosure.Heading>
          <Button
            slot="trigger"
            variant="ghost"
            fullWidth
            className="justify-between rounded-lg px-0 text-sm font-medium text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-transparent [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
          >
            More details
            <Disclosure.Indicator />
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="px-0">
            <dl className="divide-y divide-border/50">
              <Fact label="Reference" className="font-mono">
                {booking.reference}
              </Fact>
              <Fact label="Source">{getSourceLabel(booking.source)}</Fact>
              <Fact label="Payment preference">
                {booking.paymentPreference === "pay_now" ? "Pay now" : "Pay at check-in"}
              </Fact>
              {booking.estimatedArrival && (
                <Fact label="Expected arrival">{booking.estimatedArrival}</Fact>
              )}
              {booking.createdAt && <Fact label="Booked">{formatDateTime(booking.createdAt)}</Fact>}
              {booking.createdBy?.fullName && (
                <Fact label="Booked by">{booking.createdBy.fullName}</Fact>
              )}
              {booking.checkInAt && (
                <Fact label="Checked in">{formatDateTime(booking.checkInAt)}</Fact>
              )}
              {booking.checkOutAt && (
                <Fact label="Checked out">{formatDateTime(booking.checkOutAt)}</Fact>
              )}
            </dl>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}

function StayDate({
  label,
  date,
  at,
  doneLabel,
  align = "start",
}: {
  label: string;
  date: string;
  at: string | null;
  doneLabel: string;
  align?: "start" | "end";
}) {
  return (
    <div className={cn("min-w-0", align === "end" && "text-right")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-md font-semibold tracking-tight text-foreground">
        {formatDate(date, "EEE, d MMM")}
      </p>
      {at && (
        <p className="truncate text-2xs tabular-nums text-emerald-700">
          {doneLabel} at {formatDate(at, "HH:mm")}
        </p>
      )}
    </div>
  );
}

function ContactLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="flex min-h-10 items-center gap-3 rounded-lg text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:text-primary"
    >
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </a>
  );
}

function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right text-xs font-medium text-foreground", className)}>
        {children}
      </dd>
    </div>
  );
}

function NotesSection({
  booking,
  onSaveNotes,
}: {
  booking: FullBookingDetail;
  onSaveNotes?: (notes: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // Draft tracks the persisted note; a render-time reset follows a save or a
  // different booking without an effect.
  const notesKey = `${booking.id}|${booking.internalNotes ?? ""}`;
  const [draftState, setDraftState] = React.useState({ key: notesKey, value: booking.internalNotes ?? "" });
  if (draftState.key !== notesKey) setDraftState({ key: notesKey, value: booking.internalNotes ?? "" });
  const draft = draftState.value;
  const setDraft = (value: string) => setDraftState((prev) => ({ ...prev, value }));

  async function save() {
    if (!onSaveNotes) return;
    setSaving(true);
    const result = await onSaveNotes(draft.trim());
    setSaving(false);
    if (result.success) {
      toast.success("Notes saved");
      setEditing(false);
    } else {
      toast.danger(result.error || "Failed to save notes");
    }
  }

  const canEdit = typeof onSaveNotes === "function";
  const hasContent = Boolean(booking.internalNotes || booking.specialRequests);
  if (!hasContent && !canEdit) return null;

  return (
    <section aria-label="Notes" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">Notes</h3>
        {canEdit && !editing && (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setEditing(true)}
            className="h-8 gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground"
          >
            <Pencil className="size-3" aria-hidden="true" />
            {booking.internalNotes ? "Edit" : "Add note"}
          </Button>
        )}
      </div>

      {booking.specialRequests && (
        <p className="rounded-xl bg-amber-500/[0.08] px-3 py-2 text-sm leading-relaxed text-foreground">
          <span className="font-medium text-amber-800">Guest request · </span>
          {booking.specialRequests}
        </p>
      )}

      {editing ? (
        <div className="space-y-2">
          <TextArea
            aria-label="Internal notes"
            rows={4}
            value={draft}
            maxLength={2000}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Housekeeping requests, arrival notes…"
            className="w-full resize-none rounded-xl text-base sm:text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="tertiary"
              onPress={() => {
                setEditing(false);
                setDraft(booking.internalNotes ?? "");
              }}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              isPending={saving}
              onPress={() => void save()}
              className="rounded-lg font-semibold"
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        booking.internalNotes && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {booking.internalNotes}
          </p>
        )
      )}
    </section>
  );
}
