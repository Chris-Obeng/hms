"use client";

import * as React from "react";
import { Accordion, Drawer, ScrollShadow, Skeleton, Tabs, toast } from "@heroui/react";
import { CalendarX2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useIsMobile } from "@/hooks/use-mobile";
import { useSnapshotPatch } from "@/hooks/use-snapshot-patch";
import { SegmentedTab } from "@/components/ui/segmented-tab";
import { deriveReservationStatus } from "@/lib/booking-status";
import type { FullBookingDetail } from "@/app/actions/bookings-detail";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { takeBookingDetail } from "@/lib/detail-prefetch";

import { BookingStatusPill, ReferenceChip } from "./_components/booking-status-pill";
import { BookingPanelBoundary } from "./_components/booking-panel-boundary";
import { BookingActionBar } from "./_components/booking-action-bar";
import { BookingOverviewPanel } from "./_components/booking-overview-panel";
import { BookingPaymentsPanel } from "./_components/booking-payments-panel";
import { BookingNotesPanel } from "./_components/booking-notes-panel";
import { BookingGuestPanel } from "./_components/booking-guest-panel";

interface BookingDetailDrawerProps {
  bookingId: string | null;
  open: boolean;
  onClose: () => void;
  currency?: string;
  initialTab?: "overview" | "payments";
  onBookingChanged?: () => void;
}

export function BookingDetailDrawer({
  bookingId,
  open,
  onClose,
  currency = "GHS",
  initialTab = "overview",
  onBookingChanged,
}: BookingDetailDrawerProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  // Seed from legacy detail-prefetch Map on first open (one-shot migration) → instant if hover-warmed before hydration
  const seededRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open || !bookingId || seededRef.current === bookingId) return;
    seededRef.current = bookingId;
    const warmed = takeBookingDetail(bookingId);
    if (warmed) {
      void warmed
        .then((r) => {
          if (r.success) queryClient.setQueryData(bookingDetailCache.key(bookingId), r.booking);
        })
        .catch(() => {});
    }
  }, [open, bookingId, queryClient]);

  const query = useQuery({
    ...bookingDetailCache.options(bookingId ?? "__none__"),
    enabled: open && !!bookingId,
  });

  const rawBooking = query.data ?? null;
  // Optimistic local patch — layered over the TanStack snapshot, and dropped
  // with it (or with the closed drawer) by the hook's render-time reset.
  const [optimisticPatch, setOptimisticPatch] = useSnapshotPatch<
    FullBookingDetail | null,
    Partial<FullBookingDetail>
  >(rawBooking, open);

  const booking: FullBookingDetail | null = React.useMemo(() => {
    if (!rawBooking) return null;
    return optimisticPatch ? ({ ...rawBooking, ...optimisticPatch } as FullBookingDetail) : rawBooking;
  }, [rawBooking, optimisticPatch]);

  // The header speaks for the whole reservation: a multi-room booking stays
  // "Checked In" while any sibling room is still occupied, even when the room
  // this drawer was opened from (the anchor) has already checked out.
  const reservationStatus =
    booking?.group && booking.group.lines.length > 0
      ? deriveReservationStatus(booking.group.lines.map((l) => l.status))
      : booking?.status ?? "";

  const refresh = React.useCallback(() => {
    if (!bookingId) return;
    void queryClient.invalidateQueries({ queryKey: bookingDetailCache.key(bookingId) });
    if (onBookingChanged) onBookingChanged();
  }, [bookingId, queryClient, onBookingChanged]);

  // Error toast on query failure (no infinite loop)
  const errorMsg = query.error instanceof Error ? query.error.message : null;
  React.useEffect(() => {
    if (open && query.isError && errorMsg) toast.danger(errorMsg);
  }, [open, query.isError, errorMsg]);

  const handleAction = async (
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
      cancelledAt: action === "cancel" ? now : action === "reinstate" ? null : booking.cancelledAt,
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
        // rollback visual via patch clear — data still previous
        void queryClient.setQueryData(bookingDetailCache.key(previous.id), previous);
        toast.danger(result.error || `${action} failed`);
      }
    } catch {
      setOptimisticPatch(null);
      void queryClient.setQueryData(bookingDetailCache.key(previous.id), previous);
      toast.danger(`${action} failed`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkAction = async (ids: string[], targetStatus: string, kind: "check_in" | "check_out") => {
    if (!booking?.group || !bookingId || ids.length === 0) return;
    const prev = booking;
    const bulkKey = `bulk:${kind}`;
    setActionLoading(bulkKey);
    setOptimisticPatch({
      group: {
        ...booking.group,
        lines: booking.group.lines.map((l) => (ids.includes(l.id) ? { ...l, status: targetStatus } : l)),
      },
    } as unknown as Partial<FullBookingDetail>);
    try {
      const { checkInBooking: doIn, checkOutBooking: doOut } = await import("@/app/dashboard/actions");
      let ok = 0;
      let lastError: string | undefined;
      for (const id of ids) {
        const fn = kind === "check_in" ? () => doIn(id) : () => doOut(id);
        const r = await fn();
        if (r.success) ok += 1;
        else lastError = r.error;
      }
      if (ok === ids.length) {
        toast.success(kind === "check_in" ? `Checked in ${ok} rooms` : `Checked out ${ok} rooms`);
      } else if (ok > 0) {
        toast.warning(`${ok}/${ids.length} rooms ${kind === "check_in" ? "checked in" : "checked out"}${lastError ? ` — ${lastError}` : ""}`);
      } else {
        setOptimisticPatch(null);
        queryClient.setQueryData(bookingDetailCache.key(bookingId), prev);
        toast.danger(lastError || `Bulk ${kind.replace("_", " ")} failed`);
        return;
      }
      refresh();
    } catch {
      setOptimisticPatch(null);
      queryClient.setQueryData(bookingDetailCache.key(bookingId), prev);
      toast.danger(`Bulk ${kind.replace("_", " ")} failed`);
    } finally {
      setActionLoading(null);
    }
  };

  const isPending = open && !!bookingId && query.isPending;
  const isErrorEmpty = open && !!bookingId && query.isError && !booking;

  return (
    <Drawer.Backdrop isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} variant="opaque" className="bg-black/40">
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          className={`
            flex w-full flex-col overflow-hidden rounded-t-3xl bg-background p-0 shadow-[0_-24px_80px_rgb(0_0_0/0.35)]
            h-[min(94dvh,56rem)] max-h-[94dvh]
            md:h-dvh md:max-h-dvh md:w-[min(28rem,100vw)] md:rounded-none
            md:border-l md:border-border/60 md:shadow-[-32px_0_90px_rgb(0_0_0/0.16)]
          `}
        >
          {isMobile && <Drawer.Handle className="mt-2.5 shrink-0" />}

          <Drawer.CloseTrigger className="absolute right-4 top-4 z-30 grid size-8 place-items-center rounded-full bg-muted/70 text-muted-foreground shadow-xs backdrop-blur transition-all hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />

          {isPending ? (
            <DrawerSkeleton />
          ) : isErrorEmpty ? (
            <Drawer.Body className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
              <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-muted/50">
                <CalendarX2 className="size-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-semibold text-foreground">Reservation not found</p>
              <p className="mt-1 max-w-[15rem] text-xs text-muted-foreground">It may have been removed, or you don&apos;t have access to it.</p>
            </Drawer.Body>
          ) : booking ? (
            <>
              <Drawer.Header className="shrink-0 flex-col items-start gap-2.5 border-b border-border/50 bg-background px-4 pb-4 pr-14 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 md:pt-14">
                <div className="flex w-full min-w-0 items-center gap-2.5">
                  <BookingStatusPill status={reservationStatus} className="shrink-0" />
                  <ReferenceChip reference={booking.reference} className="min-w-0" />
                  {(booking.group?.totalRooms ?? booking.roomsCount ?? 0) > 1 && (
                    <span className="shrink-0 rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                      {booking.group?.totalRooms ?? booking.roomsCount} rooms
                    </span>
                  )}
                </div>
                <Drawer.Heading className="w-full truncate text-xl font-bold leading-tight tracking-tight text-foreground">
                  {booking.guest?.fullName || "Unknown Guest"}
                </Drawer.Heading>
              </Drawer.Header>

              <BookingActionBar
                booking={booking}
                actionLoading={actionLoading}
                onAction={handleAction}
              />

              <Tabs
                key={`${open ? bookingId : "closed"}:${initialTab}`}
                defaultSelectedKey={initialTab}
                className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
              >
                <ScrollShadow hideScrollBar className="min-h-0 flex-1 overscroll-contain">
                  <Tabs.ListContainer className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-4 py-2 backdrop-blur-md sm:px-5">
                    <Tabs.List aria-label="Reservation sections" className="grid w-full grid-cols-2">
                      <SegmentedTab id="overview">Overview</SegmentedTab>
                      <SegmentedTab id="payments">Payment</SegmentedTab>
                    </Tabs.List>
                  </Tabs.ListContainer>

                  <BookingPanelBoundary label="overview">
                    <Tabs.Panel id="overview">
                      <BookingOverviewPanel booking={booking} actionLoading={actionLoading} onBulkAction={handleBulkAction} />
                      <div className="px-4 pb-5 sm:px-5">
                        <Accordion variant="surface" allowsMultipleExpanded defaultExpandedKeys={["guest"]} className="w-full">
                          <BookingGuestPanel booking={booking} />
                          <BookingNotesPanel booking={booking} onRefresh={refresh} />
                        </Accordion>
                      </div>
                    </Tabs.Panel>
                  </BookingPanelBoundary>

                  <BookingPanelBoundary label="payments">
                    <Tabs.Panel id="payments">
                      <BookingPaymentsPanel booking={booking} currency={booking.currency ?? currency} onBookingChanged={onBookingChanged} onRefresh={refresh} />
                    </Tabs.Panel>
                  </BookingPanelBoundary>
                </ScrollShadow>
              </Tabs>

              <div aria-hidden className="h-[max(0.25rem,env(safe-area-inset-bottom))] shrink-0 md:hidden" />
            </>
          ) : (
            <Drawer.Body className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
              <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-muted/50">
                <CalendarX2 className="size-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-semibold text-foreground">Reservation not found</p>
              <p className="mt-1 max-w-[15rem] text-xs text-muted-foreground">It may have been removed, or you don&apos;t have access to it.</p>
            </Drawer.Body>
          )}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function DrawerSkeleton() {
  return (
    <Drawer.Body className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-14">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-48 rounded-lg" />
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <Skeleton className="h-36 rounded-2xl" />
    </Drawer.Body>
  );
}
