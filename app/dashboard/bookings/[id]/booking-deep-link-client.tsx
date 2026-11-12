"use client";

import * as React from "react";
import Link from "next/link";
import { toast, Skeleton } from "@heroui/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Mail,
  Pencil,
  Phone,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { FullBookingDetail } from "@/app/actions/bookings-detail";
import { updateBookingNotes } from "@/app/actions/bookings-detail";
import { BookingActionBar } from "@/components/bookings/_components/booking-action-bar";
import { BookingPaymentsPanel } from "@/components/bookings/_components/booking-payments-panel";
import { BookingFolioPrintButton } from "@/components/bookings/_components/booking-folio-print";
import {
  BookingStatusPill,
  ReferenceChip,
} from "@/components/bookings/_components/booking-status-pill";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { occupancyText } from "@/lib/bookings/cart";
import {
  canTransitionBooking,
  deriveReservationStatus,
  getSourceLabel,
  getStatusLabel,
} from "@/lib/booking-status";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRoomLabel,
  getInitials,
  getNights,
} from "@/lib/format";
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
  confirmed: "bg-[var(--pen-accent)]",
  checked_in: "bg-emerald-500",
  checked_out: "bg-muted-foreground/45",
  cancelled: "bg-destructive",
  no_show: "bg-destructive",
  pending: "bg-amber-500",
};

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

  const handleAction = React.useCallback(
    async (
      action: string,
      optimisticStatus: string,
      actionFn: () => Promise<{ success: boolean; error?: string }>
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
        if (result.success) {
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
          const r = kind === "check_in" ? await checkInBooking(id) : await checkOutBooking(id);
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
    [booking, bookingId, queryClient, refresh, setOptimisticPatch]
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
      <div className="mx-auto w-full max-w-6xl pt-2">
        <Link
          href="/dashboard/bookings"
          className="ui-press mb-4 inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Reservations
        </Link>
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-border/60 bg-card py-16 text-center">
          <AlertCircle className="mb-3 size-8 text-muted-foreground/35" />
          <p className="text-sm font-semibold text-foreground">Reservation not found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            It may have been removed or belongs to another property.
          </p>
        </div>
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
  const roomDisplay = booking.room?.roomNumber
    ? `${formatRoomLabel(booking.room.roomNumber)}${
        booking.room.floor ? ` · Floor ${booking.room.floor}` : ""
      }`
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pt-1">
      {/* ── Top Navigation & Print Bar ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard/bookings"
          className="ui-press -ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Reservations
        </Link>

        <BookingFolioPrintButton
          booking={booking}
          currency={currency}
          hotelName={hotelName}
          hotelAddress={hotelAddress}
          hotelPhone={hotelPhone}
        />
      </div>

      {/* ── Unified Identity & Action Header (Every Fact Said Once) ── */}
      <header className="flex flex-col gap-4 rounded-[20px] border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgb(0_0_0/0.04)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-3.5 sm:items-center">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          >
            {getInitials(guestName)}
          </span>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-2xl">
                {guestName}
              </h1>
              <BookingStatusPill status={reservationStatus} />
              <ReferenceChip reference={booking.reference} />
            </div>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">
                {formatDate(booking.checkIn, "EEE, MMM d")} →{" "}
                {formatDate(booking.checkOut, "EEE, MMM d, yyyy")}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {nights} {nights === 1 ? "night" : "nights"}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {group
                  ? `${group.totalRooms} rooms`
                  : roomDisplay ?? booking.roomType?.name ?? "Unassigned"}
              </span>
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <BookingActionBar
            inline
            booking={booking}
            actionLoading={actionLoading}
            onAction={handleAction}
          />
        </div>
      </header>

      {/* ── Two-Column Folio Workspace ─────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left column: Stay allocation + Folio & payments */}
        <div className="min-w-0 space-y-5">
          {/* 1. Stay & Room Allocation */}
          <section
            aria-label="Stay and room allocation"
            className="overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-[0_1px_3px_rgb(0_0_0/0.04)]"
          >
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5 sm:px-6">
              <h2 className="text-[15px] font-semibold text-foreground">
                {group ? `Rooms (${group.totalRooms})` : "Stay details"}
              </h2>
              <span className="text-xs capitalize text-muted-foreground">
                {getSourceLabel(booking.source)} booking
              </span>
            </div>

            {/* Schedule strip */}
            <div className="grid grid-cols-2 gap-4 border-b border-border/50 bg-muted/15 px-5 py-4 sm:grid-cols-3 sm:px-6">
              <div>
                <p className="text-xs text-muted-foreground">Check-in</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {formatDate(booking.checkIn, "MMM d, yyyy")}
                </p>
                {booking.checkInAt ? (
                  <p className="mt-0.5 text-[11px] tabular-nums text-emerald-600">
                    Arrived {formatDateTime(booking.checkInAt)}
                  </p>
                ) : booking.estimatedArrival ? (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                    <Clock className="size-3" aria-hidden="true" />
                    ETA {booking.estimatedArrival.slice(0, 5)}
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Check-out</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground">
                  <ArrowRight
                    className="hidden size-3.5 text-muted-foreground/50 sm:inline"
                    aria-hidden="true"
                  />
                  {formatDate(booking.checkOut, "MMM d, yyyy")}
                </p>
                {booking.checkOutAt && (
                  <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    Departed {formatDateTime(booking.checkOutAt)}
                  </p>
                )}
              </div>

              <div className="col-span-2 border-t border-border/40 pt-3 sm:col-span-1 sm:border-t-0 sm:pt-0">
                <p className="text-xs text-muted-foreground">Duration &amp; terms</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {nights} {nights === 1 ? "night" : "nights"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {booking.paymentPreference === "pay_now" ? "Pay online" : "Pay at property"}
                </p>
              </div>
            </div>

            {booking.status === "cancelled" && booking.cancelledAt && (
              <div className="border-b border-border/50 bg-destructive/[0.05] px-5 py-3 text-xs text-destructive sm:px-6">
                Cancelled {formatDateTime(booking.cancelledAt)}
                {booking.cancellationReason ? ` — ${booking.cancellationReason}` : ""}
              </div>
            )}

            {/* Room breakdown */}
            {group ? (
              <ul className="divide-y divide-border/50 px-5 sm:px-6">
                {group.lines.map((line) => {
                  const canIn = canTransitionBooking(line.status ?? "", "checked_in");
                  const canOut = canTransitionBooking(line.status ?? "", "checked_out");
                  return (
                    <li key={line.id} className="flex items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-[13px] font-semibold text-foreground">
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              LINE_DOTS[line.status ?? ""] ?? "bg-muted-foreground/45"
                            )}
                            aria-hidden="true"
                          />
                          <span className="truncate">{line.roomTypeName ?? "Room"}</span>
                          {line.roomNumber ? (
                            <span className="font-normal text-muted-foreground">
                              · {formatRoomLabel(line.roomNumber)}
                            </span>
                          ) : (
                            <span className="rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                              Unassigned
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {getStatusLabel(line.status ?? "")} ·{" "}
                          {occupancyText(line.adults ?? 1, line.children ?? 0)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                          {formatCurrency(line.totalAmount, currency)}
                        </span>
                        {canIn && (
                          <button
                            type="button"
                            disabled={actionLoading === "bulk:check_in"}
                            onClick={() =>
                              void handleRoomLineAction([line.id], "checked_in", "check_in")
                            }
                            className="ui-press h-8 cursor-pointer rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-55 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--accent-hover)]"
                          >
                            Check in
                          </button>
                        )}
                        {canOut && (
                          <button
                            type="button"
                            disabled={actionLoading === "bulk:check_out"}
                            onClick={() =>
                              void handleRoomLineAction([line.id], "checked_out", "check_out")
                            }
                            className="ui-press h-8 cursor-pointer rounded-lg border border-border/70 bg-card px-3 text-xs font-semibold text-foreground disabled:opacity-55 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60"
                          >
                            Check out
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <dl className="grid grid-cols-1 divide-y divide-border/45 px-5 sm:grid-cols-2 sm:divide-y-0 sm:gap-x-8 sm:px-6 sm:py-2">
                <SpecRow label="Room">
                  {roomDisplay ?? (
                    <span className="rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                      Unassigned
                    </span>
                  )}
                </SpecRow>
                <SpecRow label="Room type">{booking.roomType?.name ?? "—"}</SpecRow>
                <SpecRow label="Occupancy">{guestsLabel}</SpecRow>
                <SpecRow label="Rooms">
                  {(booking.roomsCount ?? 1) > 1 ? `${booking.roomsCount} rooms` : "1 room"}
                </SpecRow>
              </dl>
            )}
          </section>

          {/* 2. Folio & Payments */}
          <section
            aria-label="Folio and payments"
            className="overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-[0_1px_3px_rgb(0_0_0/0.04)]"
          >
            <div className="border-b border-border/50 px-5 py-3.5 sm:px-6">
              <h2 className="text-[15px] font-semibold text-foreground">Folio &amp; payments</h2>
            </div>
            <BookingPaymentsPanel
              booking={booking}
              currency={currency}
              onRefresh={refresh}
              onOptimisticPayment={handleOptimisticPayment}
            />
          </section>
        </div>

        {/* Right rail: Guest contact + Notes (flat, zero double headings) */}
        <div className="min-w-0 space-y-5">
          {/* Guest Card */}
          <section
            aria-label="Guest contact"
            className="overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-[0_1px_3px_rgb(0_0_0/0.04)]"
          >
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
              <h2 className="text-[15px] font-semibold text-foreground">Guest</h2>
              {booking.guest?.id && (
                <Link
                  href={`/dashboard/customers?guestId=${booking.guest.id}`}
                  className="ui-press inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-primary/[0.07]"
                >
                  Profile
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>

            <div className="divide-y divide-border/45 px-5">
              <div className="flex min-h-11 items-center gap-3 py-2.5 text-[13px]">
                <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {booking.guest?.phone ? (
                  <a
                    href={`tel:${booking.guest.phone}`}
                    className="truncate font-medium tabular-nums text-foreground underline-offset-2 [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
                  >
                    {booking.guest.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground/65">No phone recorded</span>
                )}
              </div>

              <div className="flex min-h-11 items-center gap-3 py-2.5 text-[13px]">
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {booking.guest?.email ? (
                  <a
                    href={`mailto:${booking.guest.email}`}
                    className="truncate text-foreground underline-offset-2 [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
                  >
                    {booking.guest.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground/65">No email recorded</span>
                )}
              </div>
            </div>
          </section>

          {/* Notes & Special Requests Card (optimistic save, flat layout) */}
          <FolioNotesCard
            booking={booking}
            onOptimisticNotes={(nextNotes) => {
              setOptimisticPatch({ internalNotes: nextNotes } as Partial<FullBookingDetail>);
              return () => setOptimisticPatch(null);
            }}
            onSaved={refresh}
          />
        </div>
      </div>
    </div>
  );
}

function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 sm:border-b sm:border-border/45 sm:nth-last-[-n+2]:border-b-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] font-medium text-foreground">
        {children}
      </dd>
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
  const [draftState, setDraftState] = React.useState({
    key: notesKey,
    value: booking.internalNotes ?? "",
  });
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

  return (
    <section
      aria-label="Notes and special requests"
      className="overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-[0_1px_3px_rgb(0_0_0/0.04)]"
    >
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">Notes</h2>
          {(booking.internalNotes || booking.specialRequests) && (
            <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(booking.internalNotes ?? "");
              setEditing(true);
            }}
            className="ui-press inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {booking.internalNotes ? "Edit" : "Add note"}
          </button>
        )}
      </div>

      <div className="space-y-4 p-5">
        {booking.specialRequests && (
          <div className="rounded-xl border border-border/60 bg-muted/25 px-3.5 py-3">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Guest request</p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
              {booking.specialRequests}
            </p>
          </div>
        )}

        {editing ? (
          <div className="space-y-2.5">
            <textarea
              rows={4}
              autoFocus
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                  setDraft(booking.internalNotes ?? "");
                }
              }}
              placeholder="Housekeeping, arrival, or front-desk note…"
              aria-label="Internal notes"
              className="w-full resize-none rounded-xl border border-border/70 bg-background px-3 py-2.5 text-base leading-relaxed text-foreground outline-none focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 sm:text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(booking.internalNotes ?? "");
                }}
                className="ui-press h-9 cursor-pointer rounded-xl border border-border/70 bg-card px-3.5 text-xs font-semibold text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                className="ui-press h-9 cursor-pointer rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--accent-hover)]"
              >
                Save note
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
            {booking.internalNotes || (
              <span className="text-xs text-muted-foreground/70">No internal notes recorded</span>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

function FolioSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pt-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-28 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
      <Skeleton className="h-24 w-full rounded-[20px]" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Skeleton className="h-56 w-full rounded-[20px]" />
          <Skeleton className="h-64 w-full rounded-[20px]" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-36 w-full rounded-[20px]" />
          <Skeleton className="h-44 w-full rounded-[20px]" />
        </div>
      </div>
    </div>
  );
}
