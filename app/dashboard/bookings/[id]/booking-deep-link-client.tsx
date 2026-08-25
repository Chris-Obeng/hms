"use client";

import * as React from "react";
import { toast, Skeleton } from "@heroui/react";
import { AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  getFullBookingDetail,
} from "@/app/actions/bookings-detail";
import { BookingActionBar } from "@/components/bookings/_components/booking-action-bar";
import { BookingOverviewPanel } from "@/components/bookings/_components/booking-overview-panel";
import { BookingPaymentsPanel } from "@/components/bookings/_components/booking-payments-panel";
import { BookingNotesPanel } from "@/components/bookings/_components/booking-notes-panel";
import { BookingGuestPanel } from "@/components/bookings/_components/booking-guest-panel";
import {
  BookingStatusPill,
  ReferenceChip,
} from "@/components/bookings/_components/booking-status-pill";
import { formatCurrency, formatDateFull, getNights } from "@/lib/format";

interface Props {
  bookingId: string;
  currency: string;
}

export function BookingDeepLinkClient({ bookingId, currency }: Props) {
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const {
    data: booking,
    isLoading: loading,
    refetch: loadBooking,
  } = useQuery({
    queryKey: ["bookingDetail", bookingId],
    queryFn: async () => {
      const result = await getFullBookingDetail(bookingId);
      if (!result.success) throw new Error(result.error);
      return result.booking;
    },
    retry: false,
  });

  React.useEffect(() => {
    if (!loading && !booking) {
      // Surface load failures once the first fetch settles.
      toast.danger("Failed to load reservation");
    }
  }, [loading, booking]);

  const handleAction = React.useCallback(
    async (
      action: string,
      _optimisticStatus: string,
      actionFn: () => Promise<{ success: boolean; error?: string }>
    ) => {
      setActionLoading(action);
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
          await loadBooking();
        } else {
          toast.danger(result.error ?? "Action failed");
        }
      } catch {
        toast.danger("Action failed");
      } finally {
        setActionLoading(null);
      }
    },
    [loadBooking]
  );

  if (loading && !booking) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Skeleton className="h-72 rounded-3xl" />
          <div className="space-y-4">
            <Skeleton className="h-40 rounded-3xl" />
            <Skeleton className="h-48 rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 py-20 text-center">
        <AlertCircle className="mb-3 size-8 text-muted-foreground/30" />
        <p className="text-sm font-semibold text-foreground">
          Reservation not found
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          It may have been removed, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);

  return (
    <div className="space-y-5">
      {/* ═══ Summary hero ═══ */}
      <section
        aria-label="Reservation summary"
        className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-xs"
      >
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <BookingStatusPill status={booking.status} />
            <ReferenceChip reference={booking.reference} />
          </div>

          <h2 className="mt-3 truncate text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
            {booking.guest?.fullName || "Unknown Guest"}
          </h2>

          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {formatDateFull(booking.checkIn)} → {formatDateFull(booking.checkOut)}
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            {nights} {nights === 1 ? "night" : "nights"}
            {booking.room?.roomNumber && (
              <>
                <span className="mx-1.5 text-muted-foreground/40">·</span>
                Room {booking.room.roomNumber}
              </>
            )}
          </p>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-border/50 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                Total
              </p>
              <p className="text-kpi text-foreground">
                {formatCurrency(booking.totalAmount, currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                Paid
              </p>
              <p className="text-kpi text-emerald-600 dark:text-emerald-400">
                {formatCurrency(booking.amountPaid || 0, currency)}
              </p>
            </div>
            {(booking.outstandingBalance ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                  Due
                </p>
                <p className="text-kpi text-destructive">
                  {formatCurrency(booking.outstandingBalance ?? 0, currency)}
                </p>
              </div>
            )}
          </div>
        </div>

        <BookingActionBar
          booking={booking}
          actionLoading={actionLoading}
          onAction={handleAction}
        />
      </section>

      {/* ═══ Detail grid ═══ */}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <CardShell title="Stay details">
            <BookingOverviewPanel booking={booking} />
          </CardShell>
          <CardShell title="Payments">
            <BookingPaymentsPanel
              booking={booking}
              currency={currency}
              onRefresh={loadBooking}
            />
          </CardShell>
        </div>

        <div className="space-y-5">
          <CardShell title="Guest">
            <BookingGuestPanel booking={booking} />
          </CardShell>
          <CardShell title="Notes">
            <BookingNotesPanel booking={booking} onRefresh={loadBooking} />
          </CardShell>
        </div>
      </div>
    </div>
  );
}

function CardShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-3xl border border-border/60 bg-card shadow-xs"
    >
      <h3 className="border-b border-border/40 px-5 py-3.5 text-section text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
