"use client";

import * as React from "react";
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
import { ActivityBooking } from "./activity-list";
import {
  CalendarDays,
  Moon,
  Users,
  Phone,
  Mail,
  CreditCard,
  FileText,
  MapPin,
  Clock,
} from "lucide-react";

// ── Helpers ─────────────────────────────────────────────────────

function formatCurrency(amount: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getNights(checkIn: string, checkOut: string, nights?: number | null): number {
  if (nights) return nights;
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

interface ReservationDrawerProps {
  booking: ActivityBooking | null;
  open: boolean;
  onClose: () => void;
  currency?: string;
  onCheckIn?: (id: string) => void;
  onCheckOut?: (id: string) => void;
}

export function ReservationDrawer({
  booking,
  open,
  onClose,
  currency = "GHS",
  onCheckIn,
  onCheckOut,
}: ReservationDrawerProps) {
  if (!booking) return null;

  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="p-4 pb-3 border-b border-border/50">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold text-foreground truncate">
                {booking.guestName}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-0.5 font-mono">
                {booking.reference}
              </SheetDescription>
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {booking.status.replace("_", " ")}
            </Badge>
          </div>
        </SheetHeader>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/10">
          {booking.status === "confirmed" && onCheckIn && (
            <Button
              size="sm"
              className="rounded-lg text-xs h-8 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onCheckIn(booking.id)}
            >
              Check In
            </Button>
          )}
          {booking.status === "checked_in" && onCheckOut && (
            <Button
              size="sm"
              className="rounded-lg text-xs h-8 flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => onCheckOut(booking.id)}
            >
              Check Out
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-lg text-xs h-8 flex-1">
            <CreditCard className="size-3 mr-1" />
            Payment
          </Button>
        </div>

        {/* Tabs Content */}
        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="overview" className="w-full">
            <div className="px-4 pt-3 sticky top-0 bg-background z-10 border-b border-border/30">
              <TabsList className="w-full h-9">
                <TabsTrigger value="overview" className="text-xs flex-1">Overview</TabsTrigger>
                <TabsTrigger value="folio" className="text-xs flex-1">Folio</TabsTrigger>
                <TabsTrigger value="notes" className="text-xs flex-1">Notes</TabsTrigger>
                <TabsTrigger value="guest" className="text-xs flex-1">Guest</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="p-4 space-y-4 mt-0">
              {/* Stay Details */}
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
                  value={`${booking.adults || 0} adults${booking.children ? `, ${booking.children} children` : ""}`}
                />
              </div>

              <Separator className="opacity-50" />

              {/* Room */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Accommodation
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="size-3.5 text-muted-foreground/50" />
                  <span className="font-medium text-foreground">
                    {booking.roomNumber ? `Room ${booking.roomNumber}` : "Not assigned"}
                  </span>
                  {booking.roomType && (
                    <span className="text-muted-foreground">– {booking.roomType}</span>
                  )}
                </div>
              </div>

              <Separator className="opacity-50" />

              {/* Payment Summary */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Payment
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(booking.totalAmount, currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className="text-[10px]">
                      {booking.paymentStatus}
                    </Badge>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="folio" className="p-4 mt-0">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CreditCard className="size-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Folio details</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Full folio with charges and payments coming soon.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="notes" className="p-4 mt-0">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="size-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No notes yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Internal notes and special requests will appear here.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="guest" className="p-4 mt-0 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Contact
                </p>
                <div className="space-y-2.5">
                  {booking.guestEmail && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <Mail className="size-3.5 text-muted-foreground/50" />
                      <span className="text-foreground">{booking.guestEmail}</span>
                    </div>
                  )}
                  {booking.guestPhone && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <Phone className="size-3.5 text-muted-foreground/50" />
                      <span className="text-foreground">{booking.guestPhone}</span>
                    </div>
                  )}
                  {!booking.guestEmail && !booking.guestPhone && (
                    <p className="text-sm text-muted-foreground">No contact info recorded.</p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Detail Card Sub-component ──────────────────────────────────

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
