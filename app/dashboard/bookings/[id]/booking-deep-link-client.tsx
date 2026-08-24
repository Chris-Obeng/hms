"use client";

import * as React from "react";
import { toast } from "@heroui/react";
import { Loader2, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getFullBookingDetail,
  type FullBookingDetail,
} from "@/app/actions/bookings-detail";
import { BookingActionBar } from "@/components/bookings/_components/booking-action-bar";
import { BookingOverviewPanel } from "@/components/bookings/_components/booking-overview-panel";
import { BookingPaymentsPanel } from "@/components/bookings/_components/booking-payments-panel";
import { BookingNotesPanel } from "@/components/bookings/_components/booking-notes-panel";
import { BookingGuestPanel } from "@/components/bookings/_components/booking-guest-panel";
import { getStatusLabel, STATUS_COLORS } from "@/lib/booking-status";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

interface Props {
  bookingId: string;
  currency: string;
}

export function BookingDeepLinkClient({ bookingId, currency }: Props) {
  const [booking, setBooking] = React.useState<FullBookingDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("overview");
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  async function loadBooking() {
    const result = await getFullBookingDetail(bookingId);
    if (result.success) {
      setBooking(result.booking);
    } else {
      toast.danger(result.error);
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    getFullBookingDetail(bookingId).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setBooking(result.booking);
      } else {
        toast.danger(result.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  function handleAction(
    action: string,
    _optimisticStatus: string,
    actionFn: () => Promise<{ success: boolean; error?: string }>
  ) {
    setActionLoading(action);
    actionFn()
      .then((result: { success: boolean; error?: string }) => {
        if (result?.success) {
          toast.success(
            action === "check_in" ? "Guest checked in" :
            action === "check_out" ? "Guest checked out" :
            action === "cancel" ? "Booking cancelled" :
            action === "reinstate" ? "Booking reinstated" :
            action === "confirm" ? "Booking confirmed" : "Status updated"
          );
          loadBooking();
        } else {
          toast.danger(result?.error ?? "Action failed");
        }
      })
      .catch(() => toast.danger("Action failed"))
      .finally(() => setActionLoading(null));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="size-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Booking not found or access denied.</p>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[booking.status ?? ""] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="space-y-4">
      {/* Status + action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border-0 ${statusColor}`}>
          {getStatusLabel(booking.status ?? "")}
        </Badge>
        <p className="text-xs text-muted-foreground">
          Created {formatDateTime(booking.createdAt)}
          {booking.createdBy?.fullName ? ` by ${booking.createdBy.fullName}` : ""}
        </p>
      </div>

      <BookingActionBar
        booking={booking}
        actionLoading={actionLoading}
        onAction={handleAction}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
        <TabsList className="h-9 rounded-xl bg-muted/50 p-1 w-full sm:w-auto">
          {["overview", "payments", "guest", "notes"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-lg px-3 text-xs capitalize data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4 rounded-xl border border-border/60 bg-card p-5">
          <TabsContent value="overview" className="mt-0">
            <BookingOverviewPanel booking={booking} />
          </TabsContent>
          <TabsContent value="payments" className="mt-0">
            <BookingPaymentsPanel
              booking={booking}
              currency={currency}
              onRefresh={loadBooking}
            />
          </TabsContent>
          <TabsContent value="guest" className="mt-0">
            <BookingGuestPanel booking={booking} />
          </TabsContent>
          <TabsContent value="notes" className="mt-0">
            <BookingNotesPanel booking={booking} onRefresh={loadBooking} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
