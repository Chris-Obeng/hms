"use client";

import * as React from "react";
import { Accordion, Drawer, ScrollShadow, Skeleton, Tabs, toast } from "@heroui/react";
import { CalendarX2 } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { SegmentedTab } from "@/components/ui/segmented-tab";
import {
  getFullBookingDetail,
  type FullBookingDetail,
} from "@/app/actions/bookings-detail";
import { takeBookingDetail } from "@/lib/detail-prefetch";

import { BookingStatusPill, ReferenceChip } from "./_components/booking-status-pill";
import { BookingPanelBoundary } from "./_components/booking-panel-boundary";
import { BookingActionBar } from "./_components/booking-action-bar";
import { BookingOverviewPanel } from "./_components/booking-overview-panel";
import { BookingPaymentsPanel } from "./_components/booking-payments-panel";
import { BookingNotesPanel } from "./_components/booking-notes-panel";
import { BookingGuestPanel } from "./_components/booking-guest-panel";

// ── Props ──────────────────────────────────────────────────────────

interface BookingDetailDrawerProps {
  bookingId: string | null;
  open: boolean;
  onClose: () => void;
  currency?: string;
  initialTab?: "overview" | "payments";
  onBookingChanged?: () => void;
}

// ── Main Component ─────────────────────────────────────────────────

export function BookingDetailDrawer({
  bookingId,
  open,
  onClose,
  currency = "GHS",
  initialTab = "overview",
  onBookingChanged,
}: BookingDetailDrawerProps) {
  const isMobile = useIsMobile();
  const [booking, setBooking] = React.useState<FullBookingDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  // Fetch booking detail when opened. On the initial open we consume a
  // hover-warmed promise if one exists; refreshes after a mutation always
  // hit the server so post-write data is never stale.
  const fetchBooking = React.useCallback(
    async (preferCache = false) => {
      if (!bookingId) return;
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const warmed = preferCache ? takeBookingDetail(bookingId) : undefined;
        const result = await (warmed ?? getFullBookingDetail(bookingId));
        if (requestId !== requestIdRef.current) return; // stale response
        if (result.success) {
          setBooking(result.booking);
        } else {
          setBooking(null);
          toast.danger(result.error || "Failed to load reservation details");
        }
      } catch {
        if (requestId === requestIdRef.current) {
          setBooking(null);
          toast.danger("Failed to load reservation details");
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [bookingId]
  );

  React.useEffect(() => {
    if (open && bookingId) {
      const frame = window.requestAnimationFrame(() => {
        void fetchBooking(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    // Keep last content visible while the close animation plays out.
    const timer = window.setTimeout(() => {
      setBooking(null);
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, bookingId, fetchBooking]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleAction = async (
    action: string,
    optimisticStatus: string,
    actionFn: () => Promise<{ success: boolean; error?: string }>
  ) => {
    if (!booking) return;
    const previousBooking = booking;
    const now = new Date().toISOString();

    setActionLoading(action);
    setBooking({
      ...booking,
      status: optimisticStatus,
      checkInAt: action === "check_in" ? now : booking.checkInAt,
      checkOutAt: action === "check_out" ? now : booking.checkOutAt,
      cancelledAt:
        action === "cancel" ? now : action === "reinstate" ? null : booking.cancelledAt,
    });
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
        fetchBooking();
        if (onBookingChanged) onBookingChanged();
      } else {
        setBooking(previousBooking);
        toast.danger(result.error || `${action} failed`);
      }
    } catch {
      setBooking(previousBooking);
      toast.danger(`${action} failed`);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <Drawer.Backdrop
      isOpen={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      variant="opaque"
      className="bg-black/40"
    >
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

          {/* Close affordance floats above all states */}
          <Drawer.CloseTrigger
            className="
              absolute right-4 top-4 z-30 grid size-8 place-items-center rounded-full
              bg-muted/70 text-muted-foreground shadow-xs backdrop-blur transition-all
              hover:bg-muted hover:text-foreground active:scale-95
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
            "
          />

          {loading && !booking ? (
            <DrawerSkeleton />
          ) : booking ? (
            <>
              {/* ═══ Header ═══ */}
              <Drawer.Header
                className="
                  shrink-0 flex-col items-start gap-2.5 border-b border-border/50
                  bg-background px-4 pb-4 pr-14 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5
                  md:pt-14
                "
              >
                <div className="flex w-full min-w-0 items-center gap-2.5">
                  <BookingStatusPill status={booking.status} className="shrink-0" />
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

              {/* ═══ Actions ═══ */}
              <BookingActionBar
                booking={booking}
                actionLoading={actionLoading}
                onAction={handleAction}
              />

              {/* ═══ Content ═══ */}
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
                      <BookingOverviewPanel booking={booking} />
                      <div className="px-4 pb-5 sm:px-5">
                        <Accordion
                          variant="surface"
                          allowsMultipleExpanded
                          defaultExpandedKeys={["guest"]}
                          className="w-full"
                        >
                          <BookingGuestPanel booking={booking} />
                          <BookingNotesPanel booking={booking} onRefresh={() => fetchBooking()} />
                        </Accordion>
                      </div>
                    </Tabs.Panel>
                  </BookingPanelBoundary>

                  <BookingPanelBoundary label="payments">
                    <Tabs.Panel id="payments">
                      <BookingPaymentsPanel
                        booking={booking}
                        currency={booking.currency ?? currency}
                        onBookingChanged={onBookingChanged}
                        onRefresh={() => fetchBooking()}
                      />
                    </Tabs.Panel>
                  </BookingPanelBoundary>
                </ScrollShadow>
              </Tabs>

              {/* Safe-area spacer on phones */}
              <div
                aria-hidden
                className="h-[max(0.25rem,env(safe-area-inset-bottom))] shrink-0 md:hidden"
              />
            </>
          ) : (
            <Drawer.Body className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
              <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-muted/50">
                <CalendarX2 className="size-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                Reservation not found
              </p>
              <p className="mt-1 max-w-[15rem] text-xs text-muted-foreground">
                It may have been removed, or you don&apos;t have access to it.
              </p>
            </Drawer.Body>
          )}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────

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
