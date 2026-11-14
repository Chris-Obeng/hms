"use client";

import * as React from "react";
import {
  AlertDialog,
  Avatar,
  Button,
  Chip,
  Drawer,
  Dropdown,
  Label,
  Skeleton,
  Tabs,
  toast,
} from "@heroui/react";
import { ArrowUpRight, Ban, CalendarX2, Ellipsis, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useIsMobile } from "@/hooks/use-mobile";
import { useSnapshotPatch } from "@/hooks/use-snapshot-patch";
import { SegmentedTab } from "@/components/ui/segmented-tab";
import { canTransitionBooking, deriveReservationStatus } from "@/lib/booking-status";
import { formatRoomLabel, getInitials } from "@/lib/format";
import type { FullBookingDetail } from "@/app/actions/bookings-detail";
import { updateBookingStatus } from "@/app/actions/bookings";
import { checkInBooking, checkOutBooking } from "@/app/dashboard/actions";
import { useEarlyCheckoutGate } from "@/app/dashboard/_components/early-checkout-dialog";
import { earlyCheckoutToast, type EarlyDepartureResult } from "@/lib/bookings/early-departure";
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
  const earlyCheckout = useEarlyCheckoutGate();

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
      cancelledAt: action === "cancel" ? now : action === "reinstate" ? null : booking.cancelledAt,
    } as Partial<FullBookingDetail>);
    try {
      const result: { success: boolean; error?: string; early?: EarlyDepartureResult } = await actionFn();
      if (result.success && result.early) {
        const message = earlyCheckoutToast(result.early);
        if (message.tone === "warning") toast.warning(message.text);
        else toast.success(message.text);
        setConfirmAction(null);
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

  // Every check-out asks first when the guest leaves before the booked date:
  // shortening a stay deletes nights and can change the bill.
  const confirmCheckOut = async (ids: string[]) => {
    if (!booking) return { ok: false as const };
    return earlyCheckout.confirm({
      bookingIds: ids,
      guestName: booking.guest?.fullName ?? "The guest",
      checkOut: booking.group?.lines.find((l) => l.id === ids[0])?.checkOut ?? booking.checkOut,
    });
  };

  const handleCheckOut = async (ids: string[]) => {
    const gate = await confirmCheckOut(ids);
    if (!gate.ok) return;
    const unusedNights = gate.unusedNights;
    await handleAction("check_out", "checked_out", () =>
      checkOutBooking(ids[0], unusedNights ? { unusedNights } : {})
    );
  };

  const handleBulkAction = async (ids: string[], targetStatus: string, kind: "check_in" | "check_out") => {
    if (!booking?.group || !bookingId || ids.length === 0) return;
    let unusedNights: "charge" | "release" | undefined;
    if (kind === "check_out") {
      const gate = await confirmCheckOut(ids);
      if (!gate.ok) return;
      unusedNights = gate.unusedNights;
    }
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
        const fn =
          kind === "check_in"
            ? () => checkInBooking(id)
            : () => checkOutBooking(id, unusedNights ? { unusedNights } : {});
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
        ? { key: "check_out", label: `Check out ${roomLabel}`, run: () => void handleCheckOut([booking.id]) }
        : canTransitionBooking(anchorStatus, "confirmed") && anchorStatus === "pending"
          ? { key: "confirm", label: "Confirm reservation", run: () => handleAction("confirm", "confirmed", () => updateBookingStatus(booking.id, "confirmed")) }
          : null
    : null;

  const guestName = booking?.guest?.fullName || "Unknown guest";
  const totalRooms = booking?.group?.totalRooms ?? booking?.roomsCount ?? 0;
  const idleFooterLabel =
    anchorStatus === "checked_out"
      ? "Checked out"
      : anchorStatus === "cancelled"
        ? "Cancelled"
        : anchorStatus === "no_show"
          ? "No-show"
          : "No action needed";

  return (
    <Drawer.Backdrop isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} variant="opaque" className="bg-black/30">
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          className={`
            flex w-full flex-col overflow-hidden rounded-t-3xl bg-card p-0 shadow-[0_-24px_80px_rgb(0_0_0/0.25)]
            h-[min(94dvh,56rem)] max-h-[94dvh]
            md:h-dvh md:max-h-dvh md:w-[min(28rem,100vw)]
            md:rounded-none md:border-l md:border-border/60 md:shadow-[-24px_0_80px_rgb(15_23_42/0.12)]
          `}
        >
          {isMobile && <Drawer.Handle className="mt-3 shrink-0" />}

          {isPending ? (
            <DrawerSkeleton />
          ) : isErrorEmpty || !booking ? (
            <Drawer.Body className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
              <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-secondary">
                <CalendarX2 className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">Reservation not found</p>
              <p className="mt-1 max-w-[15rem] text-xs text-muted-foreground">It may have been removed, or you don&apos;t have access to it.</p>
              <Button variant="secondary" size="sm" onPress={onClose} className="mt-4 rounded-xl">
                Close
              </Button>
            </Drawer.Body>
          ) : (
            <>
              <Drawer.Header className="shrink-0 flex-row items-start gap-3 px-6 pb-4 pt-4 md:pt-6">
                <Avatar size="lg" className="shrink-0" aria-hidden="true">
                  <Avatar.Fallback className="font-semibold">{getInitials(guestName)}</Avatar.Fallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <Drawer.Heading className="truncate text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground">
                    {guestName}
                  </Drawer.Heading>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
                    <BookingStatusPill status={reservationStatus} className="shrink-0" />
                    <ReferenceChip reference={booking.reference} className="min-w-0" />
                    {totalRooms > 1 && (
                      <Chip size="sm" variant="secondary" className="shrink-0 font-medium">
                        {totalRooms} rooms
                      </Chip>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Dropdown>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label="Reservation actions"
                      className="rounded-lg text-muted-foreground max-md:size-11"
                    >
                      <Ellipsis className="size-4" aria-hidden="true" />
                    </Button>
                    <Dropdown.Popover placement="bottom end">
                      <Dropdown.Menu
                        aria-label="Reservation actions"
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
                        <Dropdown.Item id="open-page" textValue="Open full folio">
                          <ArrowUpRight className="size-4 text-muted-foreground" />
                          <Label>Open full folio</Label>
                        </Dropdown.Item>
                        {canReinstate ? (
                          <Dropdown.Item id="reinstate" textValue="Reinstate reservation">
                            <RotateCcw className="size-4 text-muted-foreground" />
                            <Label>Reinstate reservation</Label>
                          </Dropdown.Item>
                        ) : (
                          <Dropdown.Item id="cancel" textValue="Cancel reservation" variant="danger" isDisabled={!canCancel}>
                            <Ban className="size-4" />
                            <Label>Cancel reservation</Label>
                          </Dropdown.Item>
                        )}
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label="Close reservation drawer"
                    onPress={onClose}
                    className="hidden rounded-lg text-muted-foreground md:inline-flex"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </Drawer.Header>

              <Tabs
                key={`${open ? bookingId : "closed"}:${initialTab}`}
                selectedKey={tab}
                onSelectionChange={(key) => setTab(key as DrawerTab)}
                className="flex min-h-0 w-full flex-1 flex-col gap-0 overflow-hidden"
              >
                <div className="shrink-0 border-b border-border/60 px-6 pb-4">
                  <Tabs.ListContainer>
                    <Tabs.List aria-label="Reservation sections" className="grid w-full grid-cols-2">
                      <SegmentedTab id="overview">Overview</SegmentedTab>
                      <SegmentedTab id="payments">Payment</SegmentedTab>
                    </Tabs.List>
                  </Tabs.ListContainer>
                </div>

                <ScrollArea>
                  <BookingPanelBoundary label="overview">
                    <Tabs.Panel id="overview" className="mt-0 flex min-h-full flex-col p-0">
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
                    <Tabs.Panel id="payments" className="mt-0 flex min-h-full flex-col p-0">
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

                {/* Footer: lifecycle step on Overview, record payment on Payment */}
                <div className="shrink-0 border-t border-border/60 bg-card px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                  {tab === "payments" ? (
                    canRecordPayment || paymentFormOpen ? (
                      <Button
                        size="lg"
                        fullWidth
                        variant={paymentFormOpen ? "secondary" : "primary"}
                        onPress={() => setPaymentFormOpen((prev) => !prev)}
                        className="rounded-xl font-semibold"
                      >
                        {paymentFormOpen ? "Close form" : "Record payment"}
                      </Button>
                    ) : (
                      <Button size="lg" fullWidth variant="secondary" isDisabled className="rounded-xl font-semibold">
                        {paymentAvail?.isFullyPaid ? "Paid in full" : idleFooterLabel === "No action needed" ? "No payment due" : idleFooterLabel}
                      </Button>
                    )
                  ) : footerAction ? (
                    <Button
                      size="lg"
                      fullWidth
                      variant={footerAction.key === "check_out" ? "secondary" : "primary"}
                      isPending={actionLoading === footerAction.key}
                      isDisabled={actionLoading !== null && actionLoading !== footerAction.key}
                      onPress={() => footerAction.run()}
                      className="rounded-xl font-semibold"
                    >
                      {footerAction.label}
                    </Button>
                  ) : (
                    <Button size="lg" fullWidth variant="secondary" isDisabled className="rounded-xl font-semibold">
                      {idleFooterLabel}
                    </Button>
                  )}
                </div>
              </Tabs>
            </>
          )}

          {/* Cancel / reinstate confirmation */}
          {booking && (
            <ConfirmLifecycleDialog
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
          {earlyCheckout.dialog}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

/** Confirmation for the overflow lifecycle actions (danger styling on cancel). */
function ConfirmLifecycleDialog({ open, mode, busy, onClose, onConfirm }: {
  open: boolean;
  mode: "cancel" | "reinstate";
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cancel = mode === "cancel";
  return (
    <AlertDialog.Backdrop isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialog.Container placement="center" size="sm">
        <AlertDialog.Dialog className="rounded-3xl sm:max-w-[400px]">
          <AlertDialog.Header>
            <AlertDialog.Icon status={cancel ? "danger" : "accent"} />
            <AlertDialog.Heading className="text-base font-semibold text-foreground">
              {cancel ? "Cancel this reservation?" : "Reinstate this reservation?"}
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {cancel
                ? "The rooms are released and the guest is notified by email. Other rooms in the reservation are not affected."
                : "The reservation returns to confirmed and its rooms are held again."}
            </p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button slot="close" variant="tertiary" autoFocus className="rounded-xl">
              Keep reservation
            </Button>
            <Button
              variant={cancel ? "danger" : "primary"}
              isPending={busy}
              onPress={onConfirm}
              className="rounded-xl font-semibold"
            >
              {cancel ? "Cancel reservation" : "Reinstate"}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

function DrawerSkeleton() {
  return (
    <Drawer.Body className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:pt-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 shrink-0 rounded-3xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-44 rounded-lg" />
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-6 w-40 rounded-md" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-3/4 rounded-lg" />
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
