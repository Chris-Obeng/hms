"use client";

import * as React from "react";
import { Button, Drawer, Dropdown, Skeleton, Tabs, toast } from "@heroui/react";
import { ArrowUpRight, Ban, CalendarX2, Ellipsis, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useIsMobile } from "@/hooks/use-mobile";
import { useSnapshotPatch } from "@/hooks/use-snapshot-patch";
import { SegmentedTab } from "@/components/ui/segmented-tab";
import { canTransitionBooking, deriveReservationStatus } from "@/lib/booking-status";
import { formatRoomLabel } from "@/lib/format";
import type { FullBookingDetail } from "@/app/actions/bookings-detail";
import { updateBookingStatus } from "@/app/actions/bookings";
import { checkInBooking, checkOutBooking } from "@/app/dashboard/actions";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { takeBookingDetail } from "@/lib/detail-prefetch";

import { BookingStatusPill, ReferenceChip } from "./_components/booking-status-pill";
import { BookingPanelBoundary } from "./_components/booking-panel-boundary";
import { BookingOverviewPanel } from "./_components/booking-overview-panel";
import { BookingPaymentsPanel, getBookingPaymentAvailability } from "./_components/booking-payments-panel";

interface BookingDetailDrawerProps {
  bookingId: string | null;
  open: boolean;
  onClose: () => void;
  currency?: string;
  initialTab?: "overview" | "payments";
  onBookingChanged?: () => void;
}

type DrawerTab = "overview" | "payments";

export function BookingDetailDrawer({
  bookingId,
  open,
  onClose,
  currency = "GHS",
  initialTab = "overview",
  onBookingChanged,
}: BookingDetailDrawerProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<DrawerTab>(initialTab);
  const [paymentFormOpen, setPaymentFormOpen] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<"cancel" | "reinstate" | null>(null);

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

  // Closing the drawer clears transient UI state (render-time reset, not an effect).
  if (!open && (paymentFormOpen || confirmAction !== null)) {
    setPaymentFormOpen(false);
    setConfirmAction(null);
  }

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
        setConfirmAction(null);
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
      let ok = 0;
      let lastError: string | undefined;
      for (const id of ids) {
        const fn = kind === "check_in" ? () => checkInBooking(id) : () => checkOutBooking(id);
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

  const anchorStatus = booking?.status ?? "";
  const anchorRoomNumber = booking?.room?.roomNumber ?? null;
  const roomLabel = formatRoomLabel(anchorRoomNumber) ?? "reservation";
  const canCancel = booking ? canTransitionBooking(anchorStatus, "cancelled") : false;
  const canReinstate = booking
    ? canTransitionBooking(anchorStatus, "confirmed") &&
      (anchorStatus === "cancelled" || anchorStatus === "no_show")
    : false;
  const paymentAvail = booking ? getBookingPaymentAvailability(booking) : null;
  const canRecordPayment = Boolean(paymentAvail?.canTakePayment && !paymentAvail?.isFullyPaid);
  const footerAction = booking
    ? canTransitionBooking(anchorStatus, "checked_in")
      ? { key: "check_in", label: `Check in ${roomLabel}`, run: () => handleAction("check_in", "checked_in", () => checkInBooking(booking.id)) }
      : canTransitionBooking(anchorStatus, "checked_out")
        ? { key: "check_out", label: `Check out ${roomLabel}`, run: () => handleAction("check_out", "checked_out", () => checkOutBooking(booking.id)) }
        : canTransitionBooking(anchorStatus, "confirmed") && anchorStatus === "pending"
          ? { key: "confirm", label: "Confirm reservation", run: () => handleAction("confirm", "confirmed", () => updateBookingStatus(booking.id, "confirmed")) }
          : null
    : null;

  return (
    <Drawer.Backdrop isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} variant="opaque" className="bg-black/40">
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          className={`
            flex w-full flex-col overflow-hidden rounded-t-3xl bg-card p-0 shadow-[0_-24px_80px_rgb(0_0_0/0.35)]
            h-[min(94dvh,56rem)] max-h-[94dvh]
            md:h-dvh md:max-h-dvh md:w-[min(30rem,100vw)]
            md:rounded-l-3xl md:rounded-r-none
            md:border-l md:border-border/70 md:shadow-[-32px_0_90px_rgb(0_0_0/0.16)]
          `}
        >
          {isMobile && <Drawer.Handle className="mt-3 shrink-0" />}

          {isPending ? (
            <DrawerSkeleton />
          ) : isErrorEmpty || !booking ? (
            <Drawer.Body className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
              <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-muted/50">
                <CalendarX2 className="size-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-semibold text-foreground">Reservation not found</p>
              <p className="mt-1 max-w-[15rem] text-xs text-muted-foreground">It may have been removed, or you don&apos;t have access to it.</p>
            </Drawer.Body>
          ) : (
            <>
              {/* Header band */}
              <Drawer.Header className="shrink-0 flex-col items-start gap-3 border-b border-border/60 bg-card px-6 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-[max(1.25rem,4.5rem)]">
                <div className="flex w-full min-w-0 items-center gap-2">
                  <BookingStatusPill status={reservationStatus} className="shrink-0" />
                  <ReferenceChip reference={booking.reference} className="min-w-0" />
                  <span className="min-w-0 flex-1" aria-hidden="true" />
                  {(booking.group?.totalRooms ?? booking.roomsCount ?? 0) > 1 && (
                    <span className="shrink-0 rounded-lg bg-muted/70 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                      {booking.group?.totalRooms ?? booking.roomsCount} rooms
                    </span>
                  )}
                  <Dropdown>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="tertiary"
                      aria-label="Reservation actions"
                      className="ui-press size-9 min-w-9 shrink-0 rounded-xl bg-muted/70 p-0 text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                    >
                      <Ellipsis className="size-4" aria-hidden="true" />
                    </Button>
                    <Dropdown.Popover placement="bottom end">
                      <Dropdown.Menu
                        onAction={(key) => {
                          if (key === "open-page") {
                            onClose();
                            router.push(`/dashboard/bookings/${booking.id}`);
                          } else if (key === "reinstate" && canReinstate) {
                            setConfirmAction("reinstate");
                          } else if (key === "cancel" && canCancel) {
                            setConfirmAction("cancel");
                          }
                        }}
                      >
                        <Dropdown.Item id="open-page" textValue="Open full folio" className="text-foreground">
                          <ArrowUpRight className="size-4 text-muted-foreground" />
                          <span>Open full folio</span>
                        </Dropdown.Item>
                        {canReinstate ? (
                          <Dropdown.Item id="reinstate" textValue="Reinstate reservation" className="text-foreground">
                            <RotateCcw className="size-4 text-muted-foreground" />
                            <span>Reinstate reservation</span>
                          </Dropdown.Item>
                        ) : (
                          <Dropdown.Item id="cancel" textValue="Cancel reservation" isDisabled={!canCancel} className="text-[var(--danger)] data-[hovered=true]:bg-[var(--danger)]/10">
                            <Ban className="size-4 text-[var(--danger)]" />
                            <span>Cancel reservation</span>
                          </Dropdown.Item>
                        )}
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                  <button
                    type="button"
                    aria-label="Close reservation drawer"
                    onClick={onClose}
                    className="ui-press hidden size-9 shrink-0 place-items-center rounded-xl bg-muted/70 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <Drawer.Heading className="w-full truncate text-xl font-semibold leading-tight tracking-[-0.3px] text-foreground">
                  {booking.guest?.fullName || "Unknown Guest"}
                </Drawer.Heading>
              </Drawer.Header>

              <Tabs
                key={`${open ? bookingId : "closed"}:${initialTab}`}
                selectedKey={tab}
                onSelectionChange={(key) => setTab(key as DrawerTab)}
                className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
              >
                <div className="shrink-0 border-b border-border/60 bg-card px-6 py-3">
                  <Tabs.ListContainer>
                    <Tabs.List aria-label="Reservation sections" className="grid w-full grid-cols-2">
                      <SegmentedTab id="overview">Overview</SegmentedTab>
                      <SegmentedTab id="payments">Payment</SegmentedTab>
                    </Tabs.List>
                  </Tabs.ListContainer>
                </div>

                <ScrollArea>
                  <BookingPanelBoundary label="overview">
                    <Tabs.Panel id="overview" className="flex min-h-full flex-col">
                      <BookingOverviewPanel booking={booking} actionLoading={actionLoading} onBulkAction={handleBulkAction}
                        onSaveNotes={async (notes) => {
                          setOptimisticPatch({ internalNotes: notes || null } as Partial<FullBookingDetail>);
                          const { updateBookingNotes } = await import("@/app/actions/bookings-detail");
                          const res = await updateBookingNotes(booking.id, { notes });
                          if (res.success) refresh();
                          else setOptimisticPatch(null);
                          return res;
                        }} />
                    </Tabs.Panel>
                  </BookingPanelBoundary>

                  <BookingPanelBoundary label="payments">
                    <Tabs.Panel id="payments" className="flex min-h-full flex-col">
                      <BookingPaymentsPanel
                        booking={booking}
                        currency={booking.currency ?? currency}
                        onBookingChanged={onBookingChanged}
                        onRefresh={refresh}
                        onOptimisticPayment={(entry) => {
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
                            setOptimisticPatch({
                              payments: [optimisticRecord, ...booking.payments],
                              group: {
                                ...booking.group,
                                amountPaid: nextPaid,
                                outstanding: Math.max(0, booking.group.total - nextPaid),
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
                        }}
                        formOpen={paymentFormOpen}
                        onFormOpenChange={setPaymentFormOpen}
                      />
                    </Tabs.Panel>
                  </BookingPanelBoundary>
                </ScrollArea>

                {/* Footer CTA: lifecycle on Overview, Record payment on Payment */}
                <div className="shrink-0 border-t border-border/60 bg-card px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 max-md:pt-3">
                  {tab === "payments" ? (
                    canRecordPayment || paymentFormOpen ? (
                      <button type="button"
                        onClick={() => setPaymentFormOpen((prev) => !prev)}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[var(--pen-accent)] text-[13px] font-semibold text-white transition-transform active:scale-[0.99]">
                        {paymentFormOpen ? "Close form" : "Record payment"}
                      </button>
                    ) : (
                      <button type="button" disabled
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-muted text-[13px] font-semibold text-muted-foreground">
                        {paymentAvail?.isFullyPaid
                          ? "Paid in full"
                          : anchorStatus === "cancelled"
                            ? "Cancelled"
                            : anchorStatus === "checked_out"
                              ? "Checked out"
                              : "No payment due"}
                      </button>
                    )
                  ) : footerAction ? (
                    <button type="button"
                      disabled={actionLoading !== null}
                      onClick={() => footerAction?.run()}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[var(--pen-accent)] text-[13px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60">
                      {actionLoading === footerAction.key ? "Working…" : footerAction.label}
                    </button>
                  ) : (
                    <button type="button" disabled
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-muted text-[13px] font-semibold text-muted-foreground">
                      {anchorStatus === "checked_out" ? "Checked out" : anchorStatus === "cancelled" ? "Cancelled" : "No action needed"}
                    </button>
                  )}
                </div>
              </Tabs>

              <div aria-hidden className="h-[max(0.25rem,env(safe-area-inset-bottom))] shrink-0 md:hidden" />
            </>
          )}

          {/* Cancel / reinstate confirmation */}
          {booking && (
            <AlertDialogish
              open={confirmAction !== null}
              mode={confirmAction ?? "cancel"}
              busy={actionLoading === "cancel" || actionLoading === "reinstate"}
              onClose={() => setConfirmAction(null)}
              onConfirm={() => {
                if (!booking) return;
                if (confirmAction === "reinstate") {
                  void handleAction("reinstate", "confirmed", () => updateBookingStatus(booking.id, "confirmed"));
                } else {
                  void handleAction("cancel", "cancelled", () => updateBookingStatus(booking.id, "cancelled"));
                }
              }}
            />
          )}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

/** Minimal confirm dialog for the overflow actions (danger styling on cancel). */
function AlertDialogish({ open, mode, busy, onClose, onConfirm }: {
  open: boolean;
  mode: "cancel" | "reinstate";
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  const cancel = mode === "cancel";
  return (
    <div
      role="presentation"
      className="absolute inset-0 z-50 bg-black/40 px-4 transition-opacity opacity-100"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={cancel ? "Cancel reservation" : "Reinstate reservation"}
        className="mx-auto mt-[35vh] w-[min(22rem,90vw)] rounded-2xl border border-border/60 bg-card p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}>
        <h2 className="text-sm font-semibold text-foreground">{cancel ? "Cancel this reservation?" : "Reinstate this reservation?"}</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {cancel
            ? "The rooms are released and the guest is notified by email. Other rooms in the reservation are not affected."
            : "The reservation returns to confirmed and its rooms are held again."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" autoFocus onClick={onClose}
            className="h-9 rounded-full px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Keep reservation
          </button>
          <button type="button" disabled={busy} onClick={onConfirm}
            className={`h-9 rounded-full px-4 text-xs font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60 ${cancel ? "bg-[var(--danger)]" : "bg-[var(--pen-accent)]"}`}>
            {cancel ? "Cancel reservation" : "Reinstate"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hairline-band loading skeleton per the design, not a stack of cards. */
function DrawerSkeleton() {
  return (
    <Drawer.Body className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,4.5rem)]">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-7 w-44 rounded-lg" />
      <Skeleton className="mt-4 h-10 w-full rounded-full" />
      <div className="mt-4 border-b border-border/60 pb-5">
        <Skeleton className="h-6 w-40 rounded" />
        <Skeleton className="mt-2 h-4 w-56 rounded" />
      </div>
      <div className="border-b border-border/60 py-2">
        <Skeleton className="my-2 h-10 w-full rounded" />
        <Skeleton className="my-2 h-10 w-full rounded" />
      </div>
      <div className="border-b border-border/60 py-2">
        <Skeleton className="my-2 h-5 w-full rounded" />
        <Skeleton className="my-2 h-5 w-3/4 rounded" />
      </div>
    </Drawer.Body>
  );
}

function ScrollArea({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {children}
    </div>
  );
}
