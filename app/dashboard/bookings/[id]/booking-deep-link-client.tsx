"use client";

import * as React from "react";
import Link from "next/link";
import { Alert, Avatar, Button, Chip, Disclosure, Skeleton, TextArea, toast } from "@heroui/react";
import { ArrowLeft, ArrowUpRight, CalendarX2, Mail, Pencil, Phone } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { FullBookingDetail } from "@/app/actions/bookings-detail";
import { updateBookingNotes } from "@/app/actions/bookings-detail";
import { BookingActionBar } from "@/components/bookings/_components/booking-action-bar";
import { useEarlyCheckoutGate } from "@/app/dashboard/_components/early-checkout-dialog";
import {
  earlyCheckoutToast,
  type CheckOutOptions,
  type EarlyDepartureResult,
} from "@/lib/bookings/early-departure";
import { BookingPaymentsPanel } from "@/components/bookings/_components/booking-payments-panel";
import { BookingFolioPrintButton } from "@/components/bookings/_components/booking-folio-print";
import { BookingStatusPill, ReferenceChip } from "@/components/bookings/_components/booking-status-pill";
import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { occupancyText } from "@/lib/bookings/cart";
import {
  canTransitionBooking,
  deriveReservationStatus,
  getSourceLabel,
  getStatusLabel,
} from "@/lib/booking-status";
import { formatCurrency, formatDate, formatDateTime, formatRoomLabel, getInitials, getNights } from "@/lib/format";
import { useSnapshotPatch } from "@/hooks/use-snapshot-patch";
import { cn } from "@/lib/utils";

interface Props {
  bookingId: string;
  currency: string;
  hotelName?: string;
  hotelAddress?: string;
  hotelPhone?: string;
}

const LINE_DOTS: Record<string, string> = {
  confirmed: "bg-primary",
  checked_in: "bg-emerald-500",
  checked_out: "bg-muted-foreground/40",
  cancelled: "bg-destructive",
  no_show: "bg-destructive",
  pending: "bg-amber-500",
};

const ENTER = "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-[var(--ease-out-ui)] motion-reduce:animate-none";

export function BookingDeepLinkClient({
  bookingId,
  currency,
  hotelName,
  hotelAddress,
  hotelPhone,
}: Props) {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const query = useQuery(bookingDetailCache.options(bookingId));
  const rawBooking = query.data ?? null;

  const [optimisticPatch, setOptimisticPatch] = useSnapshotPatch<
    FullBookingDetail | null,
    Partial<FullBookingDetail>
  >(rawBooking, true);

  const booking: FullBookingDetail | null = React.useMemo(() => {
    if (!rawBooking) return null;
    return optimisticPatch
      ? ({ ...rawBooking, ...optimisticPatch } as FullBookingDetail)
      : rawBooking;
  }, [rawBooking, optimisticPatch]);

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: bookingDetailCache.key(bookingId) });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
  }, [bookingId, queryClient]);

  const { confirm: confirmEarlyCheckout, dialog: earlyCheckoutDialog } = useEarlyCheckoutGate();

  const handleAction = React.useCallback(
    async (
      action: string,
      optimisticStatus: string,
      actionFn: () => Promise<{ success: boolean; error?: string; early?: EarlyDepartureResult }>
    ) => {
      if (!booking) return;
      const previous = booking;
      const now = new Date().toISOString();
      setActionLoading(action);
      setOptimisticPatch({
        status: optimisticStatus,
        checkInAt: action === "check_in" ? now : booking.checkInAt,
        checkOutAt: action === "check_out" ? now : booking.checkOutAt,
        cancelledAt:
          action === "cancel" ? now : action === "reinstate" ? null : booking.cancelledAt,
      } as Partial<FullBookingDetail>);

      try {
        const result = await actionFn();
        if (result.success && result.early) {
          const message = earlyCheckoutToast(result.early);
          if (message.tone === "warning") toast.warning(message.text);
          else toast.success(message.text);
          refresh();
        } else if (result.success) {
          toast.success(
            action === "check_in"
              ? "Guest checked in"
              : action === "check_out"
                ? "Guest checked out"
                : action === "cancel"
                  ? "Reservation cancelled"
                  : action === "reinstate"
                    ? "Reservation reinstated"
                    : "Reservation confirmed"
          );
          refresh();
        } else {
          setOptimisticPatch(null);
          queryClient.setQueryData(bookingDetailCache.key(bookingId), previous);
          toast.danger(result.error ?? "Action failed");
        }
      } catch {
        setOptimisticPatch(null);
        queryClient.setQueryData(bookingDetailCache.key(bookingId), previous);
        toast.danger("Action failed");
      } finally {
        setActionLoading(null);
      }
    },
    [booking, bookingId, queryClient, refresh, setOptimisticPatch]
  );

  const handleRoomLineAction = React.useCallback(
    async (ids: string[], targetStatus: string, kind: "check_in" | "check_out") => {
      if (!booking?.group || ids.length === 0) return;
      let optionsFor: (id: string) => CheckOutOptions = () => ({});
      if (kind === "check_out") {
        // Leaving before the booked date shortens the stay: ask first.
        const gate = await confirmEarlyCheckout({
          bookingIds: ids,
          guestName: booking.guest?.fullName ?? "The guest",
          checkOut: booking.group.lines.find((l) => l.id === ids[0])?.checkOut ?? booking.checkOut,
        });
        if (!gate.ok) return;
        optionsFor = gate.optionsFor;
      }
      const previous = booking;
      setActionLoading(`bulk:${kind}`);
      setOptimisticPatch({
        group: {
          ...booking.group,
          lines: booking.group.lines.map((l) =>
            ids.includes(l.id) ? { ...l, status: targetStatus } : l
          ),
        },
      } as Partial<FullBookingDetail>);

      try {
        const { checkInBooking, checkOutBooking } = await import("@/app/dashboard/actions");
        let ok = 0;
        let lastError: string | undefined;
        for (const id of ids) {
          const r =
            kind === "check_in"
              ? await checkInBooking(id)
              : await checkOutBooking(id, optionsFor(id));
          if (r.success) ok += 1;
          else lastError = r.error;
        }
        if (ok === ids.length) {
          toast.success(
            kind === "check_in"
              ? ok === 1
                ? "Room checked in"
                : `Checked in ${ok} rooms`
              : ok === 1
                ? "Room checked out"
                : `Checked out ${ok} rooms`
          );
        } else if (ok > 0) {
          toast.warning(
            `${ok}/${ids.length} rooms ${kind === "check_in" ? "checked in" : "checked out"}${
              lastError ? ` — ${lastError}` : ""
            }`
          );
        } else {
          setOptimisticPatch(null);
          queryClient.setQueryData(bookingDetailCache.key(bookingId), previous);
          toast.danger(lastError || `${kind.replace("_", " ")} failed`);
          return;
        }
        refresh();
      } catch {
        setOptimisticPatch(null);
        queryClient.setQueryData(bookingDetailCache.key(bookingId), previous);
        toast.danger(`${kind.replace("_", " ")} failed`);
      } finally {
        setActionLoading(null);
      }
    },
    [booking, bookingId, confirmEarlyCheckout, queryClient, refresh, setOptimisticPatch]
  );

  const handleOptimisticPayment = React.useCallback(
    (entry: { bookingId: string; amount: number; method: string; notes: string }) => {
      if (!booking) return () => {};
      const nowIso = new Date().toISOString();
      const optimisticRecord = {
        id: `optimistic-${nowIso}`,
        bookingId: entry.bookingId,
        amount: entry.amount,
        method: entry.method,
        status: "success",
        paidAt: nowIso,
        createdAt: nowIso,
        notes: entry.notes || null,
        recordedByName: null,
        roomLabel: null,
      };

      if (booking.group) {
        const nextPaid = booking.group.amountPaid + entry.amount;
        const nextOut = Math.max(0, booking.group.total - nextPaid);
        setOptimisticPatch({
          payments: [optimisticRecord, ...booking.payments],
          group: {
            ...booking.group,
            amountPaid: nextPaid,
            outstanding: nextOut,
            lines: booking.group.lines.map((l) =>
              l.id === entry.bookingId
                ? {
                    ...l,
                    amountPaid: l.amountPaid + entry.amount,
                    outstanding: Math.max(0, l.outstanding - entry.amount),
                  }
                : l
            ),
          },
        } as Partial<FullBookingDetail>);
      } else {
        const nextPaid = (booking.amountPaid || 0) + entry.amount;
        const nextOut = Math.max(0, booking.totalAmount - nextPaid);
        setOptimisticPatch({
          amountPaid: nextPaid,
          outstandingBalance: nextOut,
          paymentStatus: nextOut <= 0 ? "paid" : "partial",
          payments: [optimisticRecord, ...booking.payments],
        } as Partial<FullBookingDetail>);
      }

      return () => setOptimisticPatch(null);
    },
    [booking, setOptimisticPatch]
  );

  if (query.isPending && !booking) {
    return <FolioSkeleton />;
  }

  if (!booking) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 pt-6 md:pt-8">
        <BackLink />
        <PenCard className="items-center gap-3 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
            <CalendarX2 className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-foreground">Reservation not found</p>
        </PenCard>
      </div>
    );
  }

  const group = booking.group;
  const reservationStatus =
    group && group.lines.length > 0
      ? deriveReservationStatus(group.lines.map((l) => l.status))
      : booking.status ?? "";
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const guestsLabel = occupancyText(booking.adults ?? 1, booking.children ?? 0);
  const guestName = booking.guest?.fullName || "Guest";
  const roomLabel = formatRoomLabel(booking.room?.roomNumber);
  const roomDisplay = roomLabel ? `${roomLabel}${booking.room?.floor ? ` · Floor ${booking.room.floor}` : ""}` : null;
  const totalRooms = group?.totalRooms ?? booking.roomsCount ?? 1;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pt-6 md:pt-8">
      <BackLink />
      {earlyCheckoutDialog}

      {/* Identity + the one lifecycle action */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar size="lg" className="shrink-0" aria-hidden="true">
            <Avatar.Fallback className="font-semibold">{getInitials(guestName)}</Avatar.Fallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-foreground">{guestName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <BookingStatusPill status={reservationStatus} />
              <ReferenceChip reference={booking.reference} />
              {totalRooms > 1 && (
                <Chip size="sm" variant="secondary" className="font-medium">
                  {totalRooms} rooms
                </Chip>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BookingFolioPrintButton
            booking={booking}
            currency={currency}
            hotelName={hotelName}
            hotelAddress={hotelAddress}
            hotelPhone={hotelPhone}
          />
          <BookingActionBar inline booking={booking} actionLoading={actionLoading} onAction={handleAction} />
        </div>
      </header>

      {booking.status === "cancelled" && booking.cancelledAt && (
        <Alert status="danger" className="rounded-2xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Cancelled {formatDateTime(booking.cancelledAt)}</Alert.Title>
            {booking.cancellationReason && <Alert.Description>{booking.cancellationReason}</Alert.Description>}
          </Alert.Content>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {/* Stay */}
          <PenCard className={ENTER}>
            <PenCardHead title={group ? `Rooms · ${group.totalRooms}` : "Stay"} />
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-secondary/60 p-4">
              <StayDate label="Check-in" date={booking.checkIn} at={booking.checkInAt} doneLabel="In"
                eta={!booking.checkInAt ? booking.estimatedArrival : null} />
              <Chip size="sm" variant="secondary" className="bg-card font-medium tabular-nums">
                {nights} {nights === 1 ? "night" : "nights"}
              </Chip>
              <StayDate label="Check-out" date={booking.checkOut} at={booking.checkOutAt} doneLabel="Out" align="end" />
            </div>

            {group ? (
              <ul className="divide-y divide-border/60 rounded-2xl border border-border/60">
                {group.lines.map((line) => {
                  const canIn = canTransitionBooking(line.status ?? "", "checked_in");
                  const canOut = canTransitionBooking(line.status ?? "", "checked_out");
                  return (
                    <li key={line.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", LINE_DOTS[line.status ?? ""] ?? "bg-muted-foreground/40")} />
                          <span className="min-w-0 truncate">
                            {line.roomTypeName ?? "Room"}
                            {line.roomNumber ? (
                              <span className="font-normal text-muted-foreground"> · {formatRoomLabel(line.roomNumber)}</span>
                            ) : (
                              <span className="font-normal text-amber-700"> · Unassigned</span>
                            )}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {getStatusLabel(line.status ?? "")} · {occupancyText(line.adults ?? 1, line.children ?? 0)} ·{" "}
                          <span className="tabular-nums">{formatCurrency(line.totalAmount, currency)}</span>
                        </p>
                      </div>
                      {canIn && (
                        <Button
                          size="sm"
                          variant="primary"
                          isDisabled={actionLoading === "bulk:check_in"}
                          onPress={() => void handleRoomLineAction([line.id], "checked_in", "check_in")}
                          className="shrink-0 rounded-lg font-semibold max-md:h-11"
                        >
                          Check in
                        </Button>
                      )}
                      {canOut && (
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={actionLoading === "bulk:check_out"}
                          onPress={() => void handleRoomLineAction([line.id], "checked_out", "check_out")}
                          className="shrink-0 rounded-lg font-semibold max-md:h-11"
                        >
                          Check out
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <dl className="grid grid-cols-2 gap-4">
                <Spec label="Room">
                  {roomDisplay ?? <span className="text-amber-700">Not assigned</span>}
                  <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">{booking.roomType?.name ?? "—"}</span>
                </Spec>
                <Spec label="Guests" align="end">{guestsLabel}</Spec>
              </dl>
            )}
          </PenCard>

          {/* Payments: the panel owns its balance, ledger and record form */}
          <PenCard className="gap-0 p-0 sm:p-0">
            <div className="px-6 pt-4 sm:pt-6">
              <PenCardHead title="Payments" />
            </div>
            <BookingPaymentsPanel
              booking={booking}
              currency={currency}
              onRefresh={refresh}
              onOptimisticPayment={handleOptimisticPayment}
            />
          </PenCard>
        </div>

        {/* Right rail */}
        <div className="min-w-0 space-y-6">
          <PenCard>
            <PenCardHead
              title="Guest"
              actions={
                booking.guest?.id ? (
                  <Link
                    href={`/dashboard/customers?guestId=${booking.guest.id}`}
                    className="-my-3 inline-flex min-h-11 items-center gap-1 rounded-lg text-xs font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring md:-my-2 md:min-h-8"
                  >
                    Profile
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : undefined
              }
            />
            <div className="space-y-1">
              <ContactLink href={booking.guest?.phone ? `tel:${booking.guest.phone}` : undefined} icon={<Phone className="size-4" />}>
                {booking.guest?.phone || "No phone"}
              </ContactLink>
              <ContactLink href={booking.guest?.email ? `mailto:${booking.guest.email}` : undefined} icon={<Mail className="size-4" />}>
                {booking.guest?.email || "No email"}
              </ContactLink>
            </div>
          </PenCard>

          <FolioNotesCard
            booking={booking}
            onOptimisticNotes={(nextNotes) => {
              setOptimisticPatch({ internalNotes: nextNotes } as Partial<FullBookingDetail>);
              return () => setOptimisticPatch(null);
            }}
            onSaved={refresh}
          />

          <PenCard className="gap-0 py-2 sm:py-2">
            <Disclosure>
              <Disclosure.Heading>
                <Button
                  slot="trigger"
                  variant="ghost"
                  fullWidth
                  className="justify-between rounded-lg px-0 text-sm font-medium text-muted-foreground max-md:h-11 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-transparent [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                >
                  More details
                  <Disclosure.Indicator />
                </Button>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body className="px-0">
                  <dl className="divide-y divide-border/50">
                    <Fact label="Source">{getSourceLabel(booking.source)}</Fact>
                    <Fact label="Payment">{booking.paymentPreference === "pay_now" ? "Pay online" : "Pay at property"}</Fact>
                    {booking.estimatedArrival && <Fact label="Expected arrival">{booking.estimatedArrival.slice(0, 5)}</Fact>}
                    {booking.createdAt && <Fact label="Booked">{formatDateTime(booking.createdAt)}</Fact>}
                    {booking.createdBy?.fullName && <Fact label="Booked by">{booking.createdBy.fullName}</Fact>}
                    {booking.checkInAt && <Fact label="Checked in">{formatDateTime(booking.checkInAt)}</Fact>}
                    {booking.checkOutAt && <Fact label="Checked out">{formatDateTime(booking.checkOutAt)}</Fact>}
                  </dl>
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
          </PenCard>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/bookings"
      className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Reservations
    </Link>
  );
}

function StayDate({ label, date, at, doneLabel, eta, align = "start" }: {
  label: string;
  date: string;
  at: string | null;
  doneLabel: string;
  eta?: string | null;
  align?: "start" | "end";
}) {
  return (
    <div className={cn("min-w-0", align === "end" && "text-right")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-md font-semibold tracking-tight text-foreground">{formatDate(date, "EEE, d MMM")}</p>
      {at ? (
        <p className="truncate text-2xs tabular-nums text-emerald-700">{doneLabel} at {formatDate(at, "HH:mm")}</p>
      ) : eta ? (
        <p className="truncate text-2xs tabular-nums text-muted-foreground">Arriving {eta.slice(0, 5)}</p>
      ) : null}
    </div>
  );
}

function Spec({ label, children, align = "start" }: { label: string; children: React.ReactNode; align?: "start" | "end" }) {
  return (
    <div className={cn("min-w-0", align === "end" && "text-right")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}

function ContactLink({ href, icon, children }: { href?: string; icon: React.ReactNode; children: React.ReactNode }) {
  const inner = (
    <>
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </>
  );
  if (!href) return <p className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground md:min-h-10">{inner}</p>;
  return (
    <a
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-lg text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 [@media(hover:hover)_and_(pointer:fine)]:hover:text-primary"
    >
      {inner}
    </a>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-xs font-medium text-foreground">{children}</dd>
    </div>
  );
}

function FolioNotesCard({
  booking,
  onOptimisticNotes,
  onSaved,
}: {
  booking: FullBookingDetail;
  onOptimisticNotes: (notes: string | null) => () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const notesKey = `${booking.id}|${booking.internalNotes ?? ""}`;
  const [draftState, setDraftState] = React.useState({ key: notesKey, value: booking.internalNotes ?? "" });
  if (draftState.key !== notesKey && !editing) {
    setDraftState({ key: notesKey, value: booking.internalNotes ?? "" });
  }

  const draft = draftState.value;
  const setDraft = (value: string) => setDraftState((prev) => ({ ...prev, value }));

  const handleSave = async () => {
    const cleaned = draft.trim();
    const rollback = onOptimisticNotes(cleaned || null);
    setEditing(false);
    const result = await updateBookingNotes(booking.id, { notes: cleaned });
    if (result.success) {
      toast.success("Notes updated");
      onSaved();
    } else {
      rollback();
      toast.danger(result.error || "Failed to update notes");
    }
  };

  const cancel = () => {
    setEditing(false);
    setDraft(booking.internalNotes ?? "");
  };

  return (
    <PenCard>
      <PenCardHead
        title="Notes"
        actions={
          !editing && (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                setDraft(booking.internalNotes ?? "");
                setEditing(true);
              }}
              className="-my-3 h-11 gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground md:-my-2 md:h-8"
            >
              <Pencil className="size-3" aria-hidden="true" />
              {booking.internalNotes ? "Edit" : "Add note"}
            </Button>
          )
        }
      />

      {booking.specialRequests && (
        <p className="rounded-xl bg-amber-500/[0.08] px-3 py-2 text-sm leading-relaxed text-foreground">
          <span className="font-medium text-amber-800">Guest request · </span>
          {booking.specialRequests}
        </p>
      )}

      {editing ? (
        <div className={cn("space-y-3", ENTER)}>
          <TextArea
            aria-label="Internal notes"
            rows={4}
            autoFocus
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            placeholder="Housekeeping, arrival or front desk note"
            className="w-full resize-none rounded-xl text-base sm:text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="tertiary" onPress={cancel} className="rounded-lg max-md:h-11">
              Cancel
            </Button>
            <Button size="sm" variant="primary" onPress={() => void handleSave()} className="rounded-lg font-semibold max-md:h-11">
              Save
            </Button>
          </div>
        </div>
      ) : booking.internalNotes ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{booking.internalNotes}</p>
      ) : !booking.specialRequests ? (
        <p className="text-sm text-muted-foreground">No notes</p>
      ) : null}
    </PenCard>
  );
}

function FolioSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pt-6 md:pt-8" aria-busy="true">
      <Skeleton className="h-6 w-28 rounded-lg" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-5 w-36 rounded-md" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-36 w-full rounded-3xl" />
          <Skeleton className="h-32 w-full rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
