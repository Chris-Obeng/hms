"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  Moon,
  Users,
  Phone,
  Mail,
  MapPin,
  Clock,
  LogIn,
  LogOut,
  XCircle,
  RotateCcw,
  BedDouble,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateFull, getNights } from "@/lib/format";
import { getSourceLabel, getStatusLabel, getStatusVariant } from "@/lib/booking-status";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { getBookingById, type CalendarBooking } from "../actions";

type FullBooking = {
  id: string;
  reference: string;
  status?: string | null;
  payment_status?: string | null;
  source?: string | null;
  check_in: string;
  check_out: string;
  nights?: number | null;
  total_amount: number;
  amount_paid?: number | null;
  room_rate?: number | null;
  estimated_arrival?: string | null;
  special_requests?: string | null;
  guests?: { id?: string | null; full_name?: string | null; email?: string | null; phone?: string | null } | null;
};

// ── Props ──────────────────────────────────────────────────────────

interface BookingDetailPanelProps {
  booking: CalendarBooking | null;
  open: boolean;
  onClose: () => void;
  currency?: string;
  canEdit?: boolean;
  onCheckIn?: (bookingId: string) => void;
  onCheckOut?: (bookingId: string) => void;
  onCancel?: (bookingId: string) => void;
  onReinstate?: (bookingId: string) => void;
  onAssign?: (bookingId: string) => void;
  onConfirm?: (bookingId: string) => void;
  onBlockRoom?: (roomId: string) => void;
}

// ── Detail Card ───────────────────────────────────────────────────

function DetailCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3 text-muted-foreground/50" />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function BookingDetailPanel({
  booking,
  open,
  onClose,
  currency = "GHS",
  onCheckIn,
  onCheckOut,
  onCancel,
  onReinstate,
  onAssign,
  onConfirm,
  onBlockRoom,
}: BookingDetailPanelProps) {
  const [activeTab, setActiveTab] = React.useState("overview");
  const [fullBooking, setFullBooking] = React.useState<FullBooking | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Fetch full details when panel opens or active booking changes
  React.useEffect(() => {
    async function fetchDetails() {
      if (!booking?.id) return;
      setLoading(true);
      try {
        const res = await getBookingById(booking.id);
        if (res.success && res.booking) {
          setFullBooking(res.booking);
        } else {
          setFullBooking(null);
        }
      } catch (err) {
        console.error("Failed to fetch full booking details:", err);
      } finally {
        setLoading(false);
      }
    }

    if (open && booking?.id) {
      const timer = window.setTimeout(() => {
        setActiveTab("overview");
        fetchDetails();
      }, 0);
      return () => window.clearTimeout(timer);
    } else {
      const timer = window.setTimeout(() => setFullBooking(null), 0);
      return () => window.clearTimeout(timer);
    }
  }, [booking?.id, open]);

  if (!booking) return null;

  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const isAssigned = !!booking.roomId;

  // Use fullBooking properties if available, fallback to basic booking props
  const displayBooking = {
    ...booking,
    ...(fullBooking
      ? {
          amount_paid: fullBooking.amount_paid,
          room_rate: fullBooking.room_rate,
          totalAmount: fullBooking.total_amount ?? booking.totalAmount,
          paymentStatus: fullBooking.payment_status ?? booking.paymentStatus,
          source: fullBooking.source ?? booking.source,
          estimatedArrival: fullBooking.estimated_arrival ?? booking.estimatedArrival,
          specialRequests: fullBooking.special_requests ?? booking.specialRequests,
          guestEmail: fullBooking.guests?.email ?? booking.guestEmail,
          guestPhone: fullBooking.guests?.phone ?? booking.guestPhone,
        }
      : {}),
  };
  const amountPaid = displayBooking.amount_paid || 0;
  const outstandingBalance = displayBooking.totalAmount - amountPaid;

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col max-h-[92dvh] sm:max-h-none rounded-t-2xl sm:rounded-none data-[side=right]:inset-y-auto data-[side=right]:bottom-0 sm:data-[side=right]:inset-y-0 sm:data-[side=right]:bottom-auto"
      >
        {/* Header */}
        <SheetHeader className="p-4 pb-3 border-b border-border/50">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold text-foreground truncate">
                {booking.guestName || "Unknown Guest"}
              </SheetTitle>
              <div className="flex flex-col gap-1 mt-0.5">
                <SheetDescription className="text-xs text-muted-foreground font-mono">
                  {booking.reference}
                </SheetDescription>
                <Link
                  href={`/dashboard/bookings/${booking.id}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  View Full Booking <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
            <Badge variant={getStatusVariant(booking.status)} className="text-[10px] shrink-0">
              {getStatusLabel(booking.status)}
            </Badge>
          </div>
        </SheetHeader>

        {/* Action Buttons Bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/10 overflow-x-auto">
          {booking.status === "pending" && onConfirm && (
            <Button
              size="sm"
              className="rounded-lg text-xs h-8 flex-1 bg-blue-600 hover:bg-blue-700 text-white min-w-0"
              onClick={() => onConfirm(booking.id)}
            >
              <CheckCircle2 className="size-3 mr-1 shrink-0" />
              Confirm Booking
            </Button>
          )}
          {booking.status === "confirmed" && onCheckIn && (
            <Button
              size="sm"
              className="rounded-lg text-xs h-8 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white min-w-0"
              onClick={() => onCheckIn(booking.id)}
            >
              <LogIn className="size-3 mr-1 shrink-0" />
              Check In
            </Button>
          )}
          {booking.status === "checked_in" && onCheckOut && (
            <Button
              size="sm"
              className="rounded-lg text-xs h-8 flex-1 bg-amber-600 hover:bg-amber-700 text-white min-w-0"
              onClick={() => onCheckOut(booking.id)}
            >
              <LogOut className="size-3 mr-1 shrink-0" />
              Check Out
            </Button>
          )}
          {!isAssigned && onAssign && (
            <Button
              size="sm"
              className="rounded-lg text-xs h-8 flex-1 bg-blue-600 hover:bg-blue-700 text-white min-w-0"
              onClick={() => onAssign(booking.id)}
            >
              <BedDouble className="size-3 mr-1 shrink-0" />
              Assign Room
            </Button>
          )}
          {(booking.status === "confirmed" || booking.status === "checked_in" || booking.status === "pending") && onCancel && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg text-xs h-8 shrink-0 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => onCancel(booking.id)}
            >
              <XCircle className="size-3 mr-1" />
              Cancel
            </Button>
          )}
          {booking.status === "cancelled" && onReinstate && (
            <Button
              size="sm"
              className="rounded-lg text-xs h-8 shrink-0"
              onClick={() => onReinstate(booking.id)}
            >
              <RotateCcw className="size-3 mr-1" />
              Reinstate
            </Button>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="px-4 pt-3 sticky top-0 bg-background z-10 border-b border-border/30">
              <TabsList className="w-full h-9">
                <TabsTrigger value="overview" className="text-xs flex-1">Overview</TabsTrigger>
                <TabsTrigger value="guest" className="text-xs flex-1">Guest</TabsTrigger>
                <TabsTrigger value="payment" className="text-xs flex-1">Payment</TabsTrigger>
              </TabsList>
            </div>

            {loading ? (
              <div className="p-4 space-y-4">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : (
              <>
                {/* ── Overview Tab ── */}
                <TabsContent value="overview" className="p-4 space-y-4 mt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <DetailCard
                      icon={CalendarDays}
                      label="Check-in"
                      value={formatDateFull(booking.checkIn)}
                    />
                    <DetailCard
                      icon={CalendarDays}
                      label="Check-out"
                      value={formatDateFull(booking.checkOut)}
                    />
                    <DetailCard
                      icon={Moon}
                      label="Nights"
                      value={`${nights} ${nights === 1 ? "night" : "nights"}`}
                    />
                    <DetailCard
                      icon={Users}
                      label="Guests"
                      value={`${booking.adults || 0} adults${booking.children ? `, ${booking.children} child${booking.children !== 1 ? "ren" : ""}` : ""}`}
                    />
                  </div>

                  <Separator className="opacity-50" />

                  {/* Room Info */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        Accommodation
                      </p>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="size-3.5 text-muted-foreground/50 shrink-0" />
                        {isAssigned ? (
                          <span className="font-semibold text-foreground">
                            Room {booking.roomNumber}
                          </span>
                        ) : (
                          <span className="font-medium text-amber-600 flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full bg-amber-500" />
                            Not yet assigned
                          </span>
                        )}
                        {booking.roomTypeName && (
                          <span className="text-muted-foreground">– {booking.roomTypeName}</span>
                        )}
                      </div>
                    </div>

                    {isAssigned && onBlockRoom && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onBlockRoom(booking.roomId!)}
                        className="rounded-xl text-xs h-8"
                      >
                        Block Room
                      </Button>
                    )}
                  </div>

                  <Separator className="opacity-50" />

                  {/* Source */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Booking source</span>
                    <Badge variant="outline" className="font-semibold">
                      {getSourceLabel(booking.source)}
                    </Badge>
                  </div>
                </TabsContent>

                {/* ── Guest Tab ── */}
                <TabsContent value="guest" className="p-4 space-y-4 mt-0">
                  {/* Contact */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Contact Info
                      </p>
                      {fullBooking?.guests?.id && (
                        <Link
                          href={`/dashboard/guests/${fullBooking.guests.id}`}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          View Guest Profile →
                        </Link>
                      )}
                    </div>
                    <div className="space-y-2.5">
                      {displayBooking.guestEmail && (
                        <div className="flex items-center gap-2.5 text-sm">
                          <Mail className="size-3.5 text-muted-foreground/50 shrink-0" />
                          <span className="text-foreground">{displayBooking.guestEmail}</span>
                        </div>
                      )}
                      {displayBooking.guestPhone && (
                        <div className="flex items-center gap-2.5 text-sm">
                          <Phone className="size-3.5 text-muted-foreground/50 shrink-0" />
                          <span className="text-foreground">{displayBooking.guestPhone}</span>
                        </div>
                      )}
                      {!displayBooking.guestEmail && !displayBooking.guestPhone && (
                        <p className="text-sm text-muted-foreground italic">No contact info recorded.</p>
                      )}
                    </div>
                  </div>

                  <Separator className="opacity-50" />

                  {/* Additional Info */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                      Additional Info
                    </p>
                    <div className="space-y-2.5">
                      {displayBooking.estimatedArrival && (
                        <div className="flex items-center gap-2.5 text-sm">
                          <Clock className="size-3.5 text-muted-foreground/50 shrink-0" />
                          <span className="text-foreground">
                            ETA: {displayBooking.estimatedArrival.slice(0, 5)}
                          </span>
                        </div>
                      )}
                      {displayBooking.specialRequests && (
                        <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                              Special Requests
                            </span>
                          </div>
                          <p className="text-sm text-foreground">{displayBooking.specialRequests}</p>
                        </div>
                      )}
                      {!displayBooking.estimatedArrival && !displayBooking.specialRequests && (
                        <p className="text-sm text-muted-foreground italic">No additional info recorded.</p>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* ── Payment Tab ── */}
                <TabsContent value="payment" className="p-4 space-y-4 mt-0">
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Total Amount</span>
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(displayBooking.totalAmount, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Amount Paid</span>
                      <span className="text-sm font-semibold text-emerald-600">
                        {formatCurrency(amountPaid, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Outstanding Balance</span>
                      <span className={cn(
                        "text-sm font-semibold",
                        outstandingBalance > 0 ? "text-destructive" : "text-emerald-600"
                      )}>
                        {formatCurrency(outstandingBalance, currency)}
                      </span>
                    </div>

                    <Separator className="opacity-40" />

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Payment Status</span>
                      <Badge variant={outstandingBalance === 0 ? "secondary" : "outline"} className="text-[10px]">
                        {displayBooking.paymentStatus || (outstandingBalance === 0 ? "paid" : "unpaid")}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Room Rate</span>
                      <span className="text-sm text-foreground">
                        {displayBooking.room_rate
                          ? `${formatCurrency(displayBooking.room_rate, currency)}/night`
                          : `${formatCurrency(displayBooking.totalAmount / nights, currency)}/night`}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/bookings/${booking.id}`}
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border border-border bg-background hover:bg-muted hover:text-foreground text-xs py-2.5 font-medium shadow-sm transition-colors w-full text-center"
                  >
                    Record Payment / Manage Booking
                  </Link>
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
