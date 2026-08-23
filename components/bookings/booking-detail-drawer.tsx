"use client";

import * as React from "react";
import { Drawer, Skeleton, Tabs, toast } from "@heroui/react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getFullBookingDetail,
  type FullBookingDetail,
} from "@/app/actions/bookings-detail";

import { getStatusLabel, STATUS_COLORS } from "@/lib/booking-status";
import { formatDateFull } from "@/lib/format";
import { getNights } from "@/lib/format";
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
  const [activeTab, setActiveTab] = React.useState("overview");
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  // Fetch booking detail when opened
  const fetchBooking = React.useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const result = await getFullBookingDetail(bookingId);
      if (result.success) {
        setBooking(result.booking);
      } else {
        toast.danger(result.error || "Failed to load reservation details");
      }
    } catch {
      toast.danger("Failed to load reservation details");
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (open && bookingId) {
        setActiveTab(initialTab);
        void fetchBooking();
      } else {
        setBooking(null);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, bookingId, fetchBooking, initialTab]);

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
      cancelledAt: action === "cancel" ? now : action === "reinstate" ? null : booking.cancelledAt,
    });
    try {
      const result = await actionFn();
      if (result.success) {
        toast.success(
          action === "check_in"
            ? "Guest checked in successfully"
            : action === "check_out"
              ? "Guest checked out successfully"
              : action === "cancel"
                ? "Reservation cancelled"
                : action === "reinstate"
                  ? "Reservation reinstated"
                  : "Reservation updated"
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
      className="bg-black/40 dark:bg-black/60"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog className="flex h-[min(92dvh,52rem)] max-h-[92dvh] w-full flex-col overflow-hidden bg-background p-0 shadow-[0_-24px_80px_rgb(0_0_0/0.35)] md:h-dvh md:max-h-dvh md:w-[min(30rem,100vw)] md:rounded-none md:border-l md:border-border/70 md:shadow-[-24px_0_80px_rgb(0_0_0/0.18)] rounded-t-2xl">
          {isMobile && <Drawer.Handle className="mt-2.5" />}
          <Drawer.CloseTrigger className="absolute right-3.5 top-3.5 z-20 inline-flex size-8 items-center justify-center rounded-full bg-muted/70 text-muted-foreground shadow-xs backdrop-blur transition-all hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        {loading && !booking ? (
          <Drawer.Body className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-14 sm:px-6">
            <Skeleton className="h-7 w-44 rounded-lg" />
            <Skeleton className="h-4 w-64 rounded-md" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
            <Skeleton className="h-28 rounded-xl" />
          </Drawer.Body>
        ) : booking ? (
          <>
            {/* ═══ Header — guest identity, status, stay window ═══ */}
            <Drawer.Header className="shrink-0 flex-col items-start gap-2 border-b border-border/50 px-5 pb-4 pt-14 pr-14 sm:px-6">
              <div className="flex w-full min-w-0 items-center gap-2.5">
                <Drawer.Heading className="min-w-0 truncate text-[19px] font-semibold leading-tight tracking-tight text-foreground">
                  {booking.guest?.fullName || "Unknown Guest"}
                </Drawer.Heading>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
                    getStatusPillClass(booking.status)
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", STATUS_COLORS[booking.status || ""] || "bg-slate-400")} />
                  {getStatusLabel(booking.status || "")}
                </span>
                <span className="rounded-md bg-muted/70 px-2 py-0.5 font-mono text-[11px] font-medium tracking-tight text-muted-foreground">
                  {booking.reference}
                </span>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatDateFull(booking.checkIn)} <span className="mx-1 text-muted-foreground/40">→</span> {formatDateFull(booking.checkOut)}
                <span className="mx-1.5 text-muted-foreground/40">·</span>
                {getNights(booking.checkIn, booking.checkOut, booking.nights)} nights
                {booking.createdBy?.fullName && (
                  <span className="ml-2 text-muted-foreground/60">· created by {booking.createdBy.fullName}</span>
                )}
              </p>
            </Drawer.Header>

            {/* ═══ Action Bar ═══ */}
            <BookingActionBar
              booking={booking}
              actionLoading={actionLoading}
              onAction={handleAction}
            />

            {/* ═══ Tabs ═══ */}
            <Drawer.Body className="min-h-0 flex-1 overscroll-contain p-0 pb-[env(safe-area-inset-bottom)]">
              <Tabs
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(String(key))}
                variant="secondary"
                className="w-full"
              >
                <div className="sticky top-0 z-10 border-b border-border/30 bg-background/95 px-4 backdrop-blur-md sm:px-5">
                  <Tabs.ListContainer>
                    <Tabs.List aria-label="Reservation details" className="w-full *:flex-1 *:text-xs">
                    {(["overview", "payments"] as const).map(
                      (tab) => (
                        <Tabs.Tab
                          key={tab}
                          id={tab}
                          className="h-11 px-1 font-medium capitalize !text-muted-foreground data-[selected=true]:!text-foreground aria-selected:!text-foreground"
                        >
                          {tab === "overview"
                            ? "Overview"
                            : tab === "payments"
                              ? "Payments"
                              : "Overview"}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                      )
                    )}
                    </Tabs.List>
                  </Tabs.ListContainer>
                </div>

                <Tabs.Panel id="overview" className="p-0">
                  <BookingOverviewPanel booking={booking} />
                  <BookingGuestPanel booking={booking} />
                  <BookingNotesPanel
                    booking={booking}
                    onRefresh={fetchBooking}
                  />
                </Tabs.Panel>

                <Tabs.Panel id="payments" className="p-0">
                  <BookingPaymentsPanel
                    booking={booking}
                    currency={currency}
                    onBookingChanged={onBookingChanged}
                    onRefresh={fetchBooking}
                  />
                </Tabs.Panel>

              </Tabs>
            </Drawer.Body>
          </>
        ) : (
          <Drawer.Body className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <AlertCircle className="size-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Reservation not found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              This reservation could not be loaded.
            </p>
          </Drawer.Body>
        )}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function getStatusPillClass(status: string | null): string {
  switch (status) {
    case "checked_in":
      return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/25";
    case "confirmed":
      return "bg-sky-500/12 text-sky-700 dark:text-sky-400 ring-1 ring-sky-500/25";
    case "pending":
      return "bg-violet-500/12 text-violet-700 dark:text-violet-400 ring-1 ring-violet-500/25";
    case "cancelled":
    case "no_show":
      return "bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-red-500/25";
    case "checked_out":
      return "bg-slate-500/12 text-slate-600 dark:text-slate-400 ring-1 ring-slate-500/25";
    default:
      return "bg-muted text-muted-foreground ring-1 ring-border";
  }
}
