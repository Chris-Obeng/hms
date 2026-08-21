"use client";

import * as React from "react";
import { Chip, Drawer, Skeleton, Tabs, toast } from "@heroui/react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getFullBookingDetail,
  type FullBookingDetail,
} from "@/app/actions/bookings-detail";

import { getStatusLabel, STATUS_COLORS } from "@/lib/booking-status";
import { formatDateTime } from "@/lib/format";
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
      variant="blur"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog className="flex h-[min(92dvh,48rem)] max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg bg-background p-0 shadow-2xl md:h-dvh md:max-h-dvh md:max-w-md md:rounded-none">
          {isMobile && <Drawer.Handle />}
          <Drawer.CloseTrigger className="right-3 top-3 z-20" />
        {loading && !booking ? (
          <Drawer.Body className="flex min-h-0 flex-1 flex-col space-y-5 overflow-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:px-5">
            <Skeleton className="h-8 w-48 rounded-md" />
            <Skeleton className="h-11 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </Drawer.Body>
        ) : booking ? (
          <>
            {/* ═══ Header ═══ */}
            <Drawer.Header className="shrink-0 border-b border-border/40 px-4 pb-3 pt-6 pr-14 sm:px-5 sm:pb-4 sm:pt-5 sm:pr-14">
              <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2.5">
                    <Drawer.Heading className="truncate text-lg font-semibold text-foreground">
                      {booking.guest?.fullName || "Unknown Guest"}
                    </Drawer.Heading>
                    <span
                      className={cn(
                        "size-2 rounded-full shrink-0",
                        STATUS_COLORS[booking.status || ""] || "bg-slate-400"
                      )}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Chip
                      color={getStatusColor(booking.status)}
                      variant="soft"
                      size="sm"
                      className="shrink-0 capitalize"
                    >
                      {getStatusLabel(booking.status || "")}
                    </Chip>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {booking.reference}
                    </span>
                    <div className="text-[11px] text-muted-foreground/60">
                      <span>Created {formatDateTime(booking.createdAt)}</span>
                      {booking.createdBy?.fullName && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span>by {booking.createdBy.fullName}</span>
                        </>
                      )}
                    </div>
                  </div>
              </div>
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

function getStatusColor(status: string | null): "default" | "success" | "warning" | "danger" | "accent" {
  if (status === "checked_in" || status === "confirmed") return "success";
  if (status === "pending") return "warning";
  if (status === "cancelled" || status === "no_show") return "danger";
  if (status === "checked_out") return "accent";
  return "default";
}
