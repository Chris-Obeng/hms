"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { checkInBooking, checkOutBooking } from "@/app/dashboard/actions";
import { updateBookingStatus } from "@/app/actions/bookings";
import {
  getFullBookingDetail,
  type FullBookingDetail,
} from "@/app/actions/bookings-detail";

import {
  getStatusVariant,
  getStatusLabel,
  STATUS_COLORS,
  formatDateTime,
} from "./_components/booking-detail-types";
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
  onBookingChanged?: () => void;
}

// ── Main Component ─────────────────────────────────────────────────

export function BookingDetailDrawer({
  bookingId,
  open,
  onClose,
  currency = "GHS",
  onBookingChanged,
}: BookingDetailDrawerProps) {
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
        toast.error(result.error || "Failed to load reservation details");
      }
    } catch {
      toast.error("Failed to load reservation details");
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  React.useEffect(() => {
    if (open && bookingId) {
      setActiveTab("overview");
      fetchBooking();
    } else if (!open) {
      setBooking(null);
    }
  }, [open, bookingId, fetchBooking]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleAction = async (action: string, actionFn: () => Promise<any>) => {
    setActionLoading(action);
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
        toast.error(result.error || `${action} failed`);
      }
    } catch {
      toast.error(`${action} failed`);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col"
      >
        {loading && !booking ? (
          <div className="flex flex-1 flex-col p-6 space-y-6">
            <Skeleton className="h-8 w-48 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : booking ? (
          <>
            {/* ═══ Header ═══ */}
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/40">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 mb-1">
                    <SheetTitle className="text-lg font-semibold text-foreground truncate">
                      {booking.guest?.fullName || "Unknown Guest"}
                    </SheetTitle>
                    <span
                      className={cn(
                        "size-2 rounded-full shrink-0",
                        STATUS_COLORS[booking.status || ""] || "bg-slate-400"
                      )}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <SheetDescription className="text-xs text-muted-foreground font-mono">
                      {booking.reference}
                    </SheetDescription>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
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
                <Badge
                  variant={getStatusVariant(booking.status || "")}
                  className="text-[10px] px-2 py-0.5 shrink-0 capitalize"
                >
                  {getStatusLabel(booking.status || "")}
                </Badge>
              </div>
            </SheetHeader>

            {/* ═══ Action Bar ═══ */}
            <BookingActionBar
              booking={booking}
              actionLoading={actionLoading}
              onAction={handleAction}
              onOpenPaymentForm={() => {
                // Switch to payments tab when opening payment form
                setActiveTab("payments");
              }}
            />

            {/* ═══ Tabs ═══ */}
            <div className="flex-1 overflow-y-auto">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="sticky top-0 z-10 border-b border-border/20 bg-background px-5 pt-2">
                  <TabsList className="w-full h-9 bg-transparent p-0 gap-0">
                    {(["overview", "payments", "notes", "guest"] as const).map(
                      (tab) => (
                        <TabsTrigger
                          key={tab}
                          value={tab}
                          className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2 pt-1 h-auto"
                        >
                          {tab === "overview"
                            ? "Overview"
                            : tab === "payments"
                              ? "Payments"
                              : tab === "notes"
                                ? "Notes"
                                : "Guest"}
                        </TabsTrigger>
                      )
                    )}
                  </TabsList>
                </div>

                <TabsContent value="overview" className="mt-0">
                  <BookingOverviewPanel booking={booking} currency={currency} />
                </TabsContent>

                <TabsContent value="payments" className="mt-0">
                  <BookingPaymentsPanel
                    booking={booking}
                    currency={currency}
                    onBookingChanged={onBookingChanged}
                    onRefresh={fetchBooking}
                  />
                </TabsContent>

                <TabsContent value="notes" className="mt-0">
                  <BookingNotesPanel
                    booking={booking}
                    onRefresh={fetchBooking}
                  />
                </TabsContent>

                <TabsContent value="guest" className="mt-0">
                  <BookingGuestPanel booking={booking} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
            <AlertCircle className="size-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Reservation not found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              This reservation could not be loaded.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
