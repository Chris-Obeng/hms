"use client";

import * as React from "react";
import Link from "next/link";
import {
  Search,
  Moon,
  Users,
  Sparkles,
  ChevronRight,
  MoreHorizontal,
  FileText,
  CreditCard,
  Eye,
  Edit,
  XCircle,
  BedDouble,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActivityTab } from "./activity-tabs";

// ── Types ──────────────────────────────────────────────────────

export interface ActivityBooking {
  id: string;
  reference: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  roomNumber: string | null;
  roomType: string | null;
  checkIn: string;
  checkOut: string;
  nights: number | null;
  adults: number | null;
  children: number | null;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  source: string;
  roomDirty?: boolean;
}

interface ActivityListProps {
  bookings: ActivityBooking[];
  activeTab: ActivityTab;
  loading?: boolean;
  currency?: string;
  onCheckIn?: (bookingId: string) => void;
  onCheckOut?: (bookingId: string) => void;
  onViewDetails?: (booking: ActivityBooking) => void;
}

// ── Helpers ─────────────────────────────────────────────────────

function formatCurrency(amount: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getStatusVariant(status: string): "default" | "secondary" | "outline" | "destructive" | "ghost" {
  switch (status) {
    case "confirmed": return "default";
    case "checked_in": return "secondary";
    case "checked_out": return "outline";
    case "cancelled":
    case "no_show": return "destructive";
    default: return "outline";
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    confirmed: "Confirmed",
    checked_in: "Checked In",
    checked_out: "Checked Out",
    cancelled: "Cancelled",
    no_show: "No Show",
    pending: "Pending",
  };
  return labels[status] || status;
}

function formatDate(dateStr: string): string {
  // Parse date string safely to avoid timezone shifts
  const parts = dateStr.split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getNights(checkIn: string, checkOut: string, nights?: number | null): number {
  if (nights) return nights;
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

// ── Main Component ─────────────────────────────────────────────

export function ActivityList({
  bookings,
  activeTab,
  loading = false,
  currency = "GHS",
  onCheckIn,
  onCheckOut,
  onViewDetails,
}: ActivityListProps) {
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);

  // Filter by search
  const filtered = React.useMemo(() => {
    if (!searchQuery.trim()) return bookings;
    const q = searchQuery.toLowerCase();
    return bookings.filter(
      (b) =>
        b.guestName.toLowerCase().includes(q) ||
        b.reference.toLowerCase().includes(q) ||
        (b.roomNumber && b.roomNumber.toLowerCase().includes(q))
    );
  }, [bookings, searchQuery]);

  // Filter by "remaining" vs "all"
  const displayBookings = React.useMemo(() => {
    if (showAll) return filtered;
    // For arrivals, show only unchecked-in (confirmed status)
    // For departures, show only not yet checked-out (confirmed, checked_in)
    if (activeTab === "arrivals") {
      return filtered.filter((b) => b.status === "confirmed");
    }
    if (activeTab === "departures") {
      return filtered.filter((b) => b.status !== "checked_out");
    }
    return filtered;
  }, [filtered, showAll, activeTab]);

  const label = getTabLabel(activeTab);

  // ── Loading State ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg ml-auto" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // ── Empty State ──────────────────────────────────────────────
  if (displayBookings.length === 0) {
    return (
      <div className="space-y-3">
        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
            <BedDouble className="size-5 text-muted-foreground/30" />
          </div>
          <h3 className="text-sm font-medium text-foreground">
            {searchQuery ? "No matching results" : getEmptyTitle(activeTab)}
          </h3>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-[260px]">
            {searchQuery
              ? "Try adjusting your search term."
              : getEmptyDescription(activeTab)}
          </p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Search + Toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
          <Input
            placeholder={`Search ${label.toLowerCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm rounded-lg"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground rounded-lg"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? `All (${displayBookings.length})` : "Remaining"}
        </Button>
      </div>

      {/* Mobile: Card list */}
      {isMobile ? (
        <div className="space-y-2">
          {displayBookings.map((booking) => (
            <MobileBookingCard
              key={booking.id}
              booking={booking}
              currency={currency}
              onCheckIn={onCheckIn}
              onCheckOut={onCheckOut}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      ) : (
        /* Desktop: Table */
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <Th>Guest</Th>
                <Th>Accommodation</Th>
                <Th>Stay</Th>
                <Th>Status</Th>
                <Th className="w-12">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {displayBookings.map((booking) => (
                <DesktopBookingRow
                  key={booking.id}
                  booking={booking}
                  currency={currency}
                  onCheckIn={onCheckIn}
                  onCheckOut={onCheckOut}
                  onViewDetails={onViewDetails}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub-Components ─────────────────────────────────────────────

function Th({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <td className={cn("px-4 py-3 text-sm", className)}>{children}</td>
  );
}

function DesktopBookingRow({
  booking,
  currency,
  onCheckIn,
  onCheckOut,
  onViewDetails,
}: {
  booking: ActivityBooking;
  currency: string;
  onCheckIn?: (id: string) => void;
  onCheckOut?: (id: string) => void;
  onViewDetails?: (booking: ActivityBooking) => void;
}) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);

  return (
    <tr
      className="border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
      onClick={() => onViewDetails?.(booking)}
    >
      {/* Guest */}
      <Td>
        <div className="flex flex-col">
          <span className="font-medium text-foreground text-sm">
            {booking.guestName}
          </span>
          <span className="text-[11px] text-muted-foreground/60 font-mono">
            {booking.reference}
          </span>
          {booking.guestPhone && (
            <span className="text-[11px] text-muted-foreground/50">
              {booking.guestPhone}
            </span>
          )}
        </div>
      </Td>

      {/* Accommodation */}
      <Td>
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <span className="text-sm text-foreground">
              {booking.roomNumber ? (
                <>
                  <span className="font-medium">{booking.roomNumber}</span>
                  {booking.roomType && (
                    <span className="text-muted-foreground">
                      {" "}– {booking.roomType}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground italic">
                  Unassigned
                </span>
              )}
            </span>
          </div>
          <ChevronRight className="size-3 text-muted-foreground/30 shrink-0" />
        </div>
      </Td>

      {/* Stay */}
      <Td>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <span>{formatDate(booking.checkIn)}</span>
            <span className="text-muted-foreground/40">→</span>
            <span>{formatDate(booking.checkOut)}</span>
          </div>
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground/60">
            <span className="flex items-center gap-1">
              <Moon className="size-3" />
              {nights} {nights === 1 ? "night" : "nights"}
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {booking.adults || 0}{booking.children ? `+${booking.children}` : ""}
            </span>
          </div>
        </div>
      </Td>

      {/* Status / Action button */}
      <Td>
        <div className="flex items-center gap-2">
          {booking.status === "confirmed" && onCheckIn && (
            <Button
              size="xs"
              className="rounded-lg text-xs h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onCheckIn(booking.id);
              }}
            >
              Check In
            </Button>
          )}
          {booking.status === "checked_in" && onCheckOut && (
            <Button
              size="xs"
              className="rounded-lg text-xs h-7 px-3 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onCheckOut(booking.id);
              }}
            >
              Check Out
            </Button>
          )}
          {booking.status === "checked_in" && !onCheckOut && (
            <Badge variant="secondary" className="text-[10px] px-2">
              Checked In
            </Badge>
          )}
          {booking.status === "checked_out" && (
            <Badge variant="outline" className="text-[10px] px-2">
              Checked Out
            </Badge>
          )}
          {booking.status === "cancelled" && (
            <Badge variant="destructive" className="text-[10px] px-2">
              Cancelled
            </Badge>
          )}
          {!["confirmed", "checked_in", "checked_out", "cancelled"].includes(booking.status) && (
            <Badge variant="outline" className="text-[10px] px-2">
              {getStatusLabel(booking.status)}
            </Badge>
          )}
          {booking.roomDirty && (
            <Badge variant="outline" className="text-[10px] px-1.5 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              Dirty
            </Badge>
          )}
        </div>
      </Td>

      {/* Actions */}
      <Td className="text-right">
        <DropdownMenu>              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 rounded-lg"
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  />
                }
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onViewDetails?.(booking);
              }}
            >
              <Eye className="size-3.5" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FileText className="size-3.5" />
              Notes
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CreditCard className="size-3.5" />
              Folio / Billing
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Edit className="size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <XCircle className="size-3.5" />
              Cancel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </tr>
  );
}

function MobileBookingCard({
  booking,
  currency,
  onCheckIn,
  onCheckOut,
  onViewDetails,
}: {
  booking: ActivityBooking;
  currency: string;
  onCheckIn?: (id: string) => void;
  onCheckOut?: (id: string) => void;
  onViewDetails?: (booking: ActivityBooking) => void;
}) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);

  return (
    <div
      className="rounded-xl border border-border/50 bg-card p-3 space-y-2.5 active:bg-muted/20 transition-colors cursor-pointer"
      onClick={() => onViewDetails?.(booking)}
    >
      {/* Guest + Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {booking.guestName}
          </p>
          <p className="text-[11px] text-muted-foreground/60 font-mono">
            {booking.reference}
          </p>
        </div>
        {booking.status === "confirmed" && onCheckIn && (
          <Button
            size="xs"
            className="rounded-lg text-xs h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onCheckIn(booking.id);
            }}
          >
            Check In
          </Button>
        )}
        {booking.status === "checked_in" && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            Checked In
          </Badge>
        )}
      </div>

      {/* Room + Dates */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {booking.roomNumber ? (
            <>
              <span className="font-medium text-foreground">Rm {booking.roomNumber}</span>
              {booking.roomType && <span> · {booking.roomType}</span>}
            </>
          ) : (
            <span className="italic">Unassigned</span>
          )}
        </span>
        <span className="tabular-nums">
          {nights} {nights === 1 ? "night" : "nights"}
        </span>
      </div>

      {/* Dates */}
      <div className="flex items-center justify-between text-xs text-muted-foreground/70">
        <div className="flex items-center gap-1">
          <span className="font-medium text-foreground">{formatDate(booking.checkIn)}</span>
          <span className="text-muted-foreground/40">→</span>
          <span className="font-medium text-foreground">{formatDate(booking.checkOut)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Users className="size-3" />
          {booking.adults || 0}{booking.children ? `+${booking.children}` : ""}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 pt-0.5">
        <Button
          variant="ghost"
          size="xs"
          className="h-7 text-xs rounded-lg text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails?.(booking);
          }}
        >
          Details
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="h-7 text-xs rounded-lg text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          Notes
        </Button>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 rounded-lg"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
              }
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Cancel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function SearchBar({
  searchQuery,
  onSearchChange,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  return (
    <div className="relative max-w-xs">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
      <Input
        placeholder="Search by guest name..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-8 pl-8 text-sm rounded-lg"
      />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function getTabLabel(tab: ActivityTab): string {
  const labels: Record<ActivityTab, string> = {
    arrivals: "Arrivals",
    departures: "Departures",
    in_house: "In-house",
    stayovers: "Stayovers",
    bookings: "Bookings",
    cancellations: "Cancellations",
    overbookings: "Overbookings",
  };
  return labels[tab] || "Bookings";
}

function getEmptyTitle(tab: ActivityTab): string {
  const titles: Record<ActivityTab, string> = {
    arrivals: "No arrivals today",
    departures: "No departures today",
    in_house: "No guests in-house",
    stayovers: "No stayovers",
    bookings: "No new bookings",
    cancellations: "No cancellations",
    overbookings: "No overbookings",
  };
  return titles[tab] || "No results";
}

function getEmptyDescription(tab: ActivityTab): string {
  const descriptions: Record<ActivityTab, string> = {
    arrivals: "Enjoy the quiet — no guests are scheduled to arrive today.",
    departures: "All guests are staying on — no departures scheduled.",
    in_house: "The property is currently empty. New arrivals will appear here.",
    stayovers: "No guests continuing their stay from previous days.",
    bookings: "New reservations made today will appear here.",
    cancellations: "No reservations have been cancelled today.",
    overbookings: "All good — no overbookings to flag.",
  };
  return descriptions[tab] || "";
}
