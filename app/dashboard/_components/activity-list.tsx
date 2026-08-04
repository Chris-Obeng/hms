"use client";

import * as React from "react";
import {
  Moon,
  User,
  Snowflake,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  FileText,
  CreditCard,
  MessageSquare,
  Search,
  ArrowUpDown,
  Calendar as CalendarIcon,
  Lock,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, getNights } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button, Dropdown, Skeleton } from "@heroui/react";
import { ActivityTab } from "./activity-tabs";

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
  createdAt?: string | null;
  hasConflict?: boolean;
  roomDirty?: boolean;
}

interface ActivityListProps {
  bookings: ActivityBooking[];
  activeTab: ActivityTab;
  loading?: boolean;
  currency?: string;
  onCheckIn?: (bookingId: string) => void;
  onCheckOut?: (bookingId: string) => void;
  onCancel?: (bookingId: string) => void;
  onNoShow?: (bookingId: string) => void;
  onViewDetails?: (booking: ActivityBooking) => void;
}

export function ActivityList({
  bookings,
  activeTab,
  loading = false,
  currency = "GHS",
  onCheckIn,
  onCheckOut,
  onCancel,
  onNoShow,
  onViewDetails,
}: ActivityListProps) {
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);

  const filteredBookings = React.useMemo(() => {
    let list = bookings;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.guestName.toLowerCase().includes(q) ||
          b.reference.toLowerCase().includes(q) ||
          (b.roomNumber && b.roomNumber.toLowerCase().includes(q)) ||
          (b.roomType && b.roomType.toLowerCase().includes(q))
      );
    }
    return list;
  }, [bookings, searchQuery]);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Activity Card Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <h2 className="text-lg font-bold text-foreground">Activity</h2>
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <input
              type="text"
              placeholder="Filter activity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              onBlur={() => {
                if (!searchQuery) setSearchOpen(false);
              }}
              className="h-8 px-3 rounded-lg border border-border/60 text-xs bg-background outline-none focus:ring-1 focus:ring-primary w-48"
            />
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              title="Search activity"
            >
              <Search className="size-4" />
            </button>
          )}

          <Dropdown>
            <Dropdown.Trigger
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer outline-none"
              aria-label="Options"
            >
              <MoreVertical className="size-4" />
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu className="w-40">
                <Dropdown.Item key="export">Export List</Dropdown.Item>
                <Dropdown.Item key="refresh">Refresh Table</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </div>

      {/* Empty State */}
      {filteredBookings.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          No records found for this view.
        </div>
      ) : isMobile ? (
        <div className="p-4 space-y-3">
          {filteredBookings.map((b) => (
            <MobileBookingRow
              key={b.id}
              booking={b}
              onCheckIn={onCheckIn}
              onCheckOut={onCheckOut}
              onCancel={onCancel}
              onNoShow={onNoShow}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      ) : (
        /* Desktop Table matching Cloudbeds */
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 bg-muted/10">
                <th className="py-3 px-6">
                  <div className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                    <span>Guest</span>
                    <ArrowUpDown className="size-3 text-muted-foreground/50" />
                  </div>
                </th>
                <th className="py-3 px-4">
                  <div className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                    <span>Accommodation</span>
                    <ArrowUpDown className="size-3 text-muted-foreground/50" />
                  </div>
                </th>
                <th className="py-3 px-4">Stay</th>
                <th className="py-3 px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 text-sm">
              {filteredBookings.map((b) => (
                <DesktopBookingRow
                  key={b.id}
                  booking={b}
                  onCheckIn={onCheckIn}
                  onCheckOut={onCheckOut}
                  onCancel={onCancel}
                  onNoShow={onNoShow}
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

function DesktopBookingRow({
  booking,
  onCheckIn,
  onCheckOut,
  onCancel,
  onNoShow,
  onViewDetails,
}: {
  booking: ActivityBooking;
  onCheckIn?: (id: string) => void;
  onCheckOut?: (id: string) => void;
  onCancel?: (id: string) => void;
  onNoShow?: (id: string) => void;
  onViewDetails?: (b: ActivityBooking) => void;
}) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const totalGuests = (booking.adults || 1) + (booking.children || 0);

  // Generate room code prefix like Cloudbeds e.g. QUE(2) or KIN(15)
  const roomCode = booking.roomType
    ? booking.roomType.substring(0, 3).toUpperCase()
    : "RM";
  const roomNumStr = booking.roomNumber ? `(${booking.roomNumber})` : "";
  const roomLabel = booking.roomType
    ? `${roomCode}${roomNumStr} - ${booking.roomType}`
    : "Unassigned Room";

  return (
    <tr
      onClick={() => onViewDetails?.(booking)}
      className="hover:bg-muted/20 transition-colors cursor-pointer group"
    >
      {/* Guest */}
      <td className="py-3.5 px-6 align-top">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-foreground text-sm">
              {booking.guestName}
            </span>
            <Lock className="size-3 text-muted-foreground/50 shrink-0" />
            <Users className="size-3 text-muted-foreground/50 shrink-0" />
          </div>
          <span className="text-[11px] font-mono text-muted-foreground/60 mt-0.5">
            {booking.reference}
          </span>
        </div>
      </td>

      {/* Accommodation */}
      <td className="py-3.5 px-4 align-top">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 text-sm font-medium text-foreground">
            <span>{roomLabel}</span>
            <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
          </div>
          <button
            type="button"
            className="p-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
            title="Room notes"
          >
            <CalendarIcon className="size-3.5" />
          </button>
        </div>
      </td>

      {/* Stay */}
      <td className="py-3.5 px-4 align-top">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-foreground font-mono">
            {formatDate(booking.checkIn, "MM/dd/yyyy")} - {formatDate(booking.checkOut, "MM/dd/yyyy")}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
            <span className="flex items-center gap-1">
              <span className="font-semibold text-foreground">{nights}</span>
              <Moon className="size-3" />
            </span>
            <span className="flex items-center gap-1">
              <span className="font-semibold text-foreground">{totalGuests}</span>
              <User className="size-3" />
            </span>
            <span className="flex items-center gap-1">
              <span className="font-semibold text-foreground">0</span>
              <Snowflake className="size-3" />
            </span>
          </div>
        </div>
      </td>

      {/* Status & Actions */}
      <td className="py-3.5 px-6 align-top">
        <div className="flex items-center justify-between gap-3">
          {/* Main Check-In / Check-Out split button matching Cloudbeds */}
          {booking.status === "confirmed" && onCheckIn ? (
            <div className="inline-flex rounded-lg overflow-hidden border border-blue-600 bg-blue-600 text-white text-xs font-semibold shadow-xs">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckIn(booking.id);
                }}
                className="px-3 py-1.5 hover:bg-blue-700 transition-colors"
              >
                Check-in
              </button>
              <div className="w-[1px] bg-blue-700" />
              <Dropdown>
                <Dropdown.Trigger
                  onClick={(e) => e.stopPropagation()}
                  className="px-1.5 py-1.5 hover:bg-blue-700 transition-colors cursor-pointer outline-none"
                  aria-label="Check-in options"
                >
                  <ChevronDown className="size-3.5" />
                </Dropdown.Trigger>
                <Dropdown.Popover placement="bottom end">
                  <Dropdown.Menu className="w-36 text-xs" onAction={(key) => {
                    if (key === "cancel" && window.confirm(`Cancel booking ${booking.reference}?`)) onCancel?.(booking.id);
                    if (key === "noshow" && window.confirm(`Mark booking ${booking.reference} as no-show?`)) onNoShow?.(booking.id);
                  }}>
                    <Dropdown.Item key="cancel">Cancel Booking</Dropdown.Item>
                    <Dropdown.Item key="noshow">Mark No-Show</Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </div>
          ) : booking.status === "checked_in" && onCheckOut ? (
            <div className="inline-flex rounded-lg overflow-hidden border border-amber-600 bg-amber-600 text-white text-xs font-semibold shadow-xs">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckOut(booking.id);
                }}
                className="px-3 py-1.5 hover:bg-amber-700 transition-colors"
              >
                Check-out
              </button>
              <div className="w-[1px] bg-amber-700" />
              <Dropdown>
                <Dropdown.Trigger
                  onClick={(e) => e.stopPropagation()}
                  className="px-1.5 py-1.5 hover:bg-amber-700 transition-colors cursor-pointer outline-none"
                  aria-label="Check-out options"
                >
                  <ChevronDown className="size-3.5" />
                </Dropdown.Trigger>
                <Dropdown.Popover placement="bottom end">
                  <Dropdown.Menu className="w-36 text-xs">
                    <Dropdown.Item key="extend">Extend Stay</Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </div>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground capitalize">
              {booking.status.replace("_", " ")}
            </span>
          )}

          {/* Icon strip next to button */}
          <div className="flex items-center gap-1.5 text-muted-foreground/60">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails?.(booking);
              }}
              title="Folio / Details"
              className="p-1 hover:text-foreground transition-colors"
            >
              <FileText className="size-4" />
            </button>

            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              title="Payment"
              className="p-1 hover:text-foreground transition-colors"
            >
              <CreditCard className="size-4" />
            </button>

            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              title="Message guest"
              className="p-1 hover:text-foreground transition-colors"
            >
              <MessageSquare className="size-4" />
            </button>

            <Dropdown>
              <Dropdown.Trigger
                onClick={(e) => e.stopPropagation()}
                className="p-1 hover:text-foreground transition-colors cursor-pointer outline-none"
                aria-label="More actions"
              >
                <MoreVertical className="size-4" />
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu className="w-40 text-xs">
                  <Dropdown.Item key="details">View Details</Dropdown.Item>
                  <Dropdown.Item key="edit">Edit Reservation</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </div>
      </td>
    </tr>
  );
}

function MobileBookingRow({
  booking,
  onCheckIn,
  onCheckOut,
  onCancel,
  onNoShow,
  onViewDetails,
}: {
  booking: ActivityBooking;
  onCheckIn?: (id: string) => void;
  onCheckOut?: (id: string) => void;
  onCancel?: (id: string) => void;
  onNoShow?: (id: string) => void;
  onViewDetails?: (b: ActivityBooking) => void;
}) {
  return (
    <div
      onClick={() => onViewDetails?.(booking)}
      className="p-3 rounded-xl border border-border/50 bg-card space-y-2 cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-foreground text-sm">{booking.guestName}</span>
        <span className="text-xs font-mono text-muted-foreground">{booking.reference}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {booking.roomType || "Unassigned"} • {formatDate(booking.checkIn, "MM/dd/yyyy")} - {formatDate(booking.checkOut, "MM/dd/yyyy")}
      </div>
      <div className="flex items-center justify-between pt-1">
        {booking.status === "confirmed" && onCheckIn && (
          <Button size="sm" className="bg-blue-600 text-white text-xs h-7" onPress={() => onCheckIn(booking.id)}>
            Check-in
          </Button>
        )}
        {booking.status === "checked_in" && onCheckOut && (
          <Button size="sm" className="bg-amber-600 text-white text-xs h-7" onPress={() => onCheckOut(booking.id)}>
            Check-out
          </Button>
        )}
        {booking.status === "confirmed" && (
          <Dropdown>
            <Dropdown.Trigger className="ml-auto p-1.5 text-muted-foreground"><MoreVertical className="size-4" /></Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu onAction={(key) => {
                if (key === "cancel" && window.confirm(`Cancel booking ${booking.reference}?`)) onCancel?.(booking.id);
                if (key === "noshow" && window.confirm(`Mark booking ${booking.reference} as no-show?`)) onNoShow?.(booking.id);
              }}>
                <Dropdown.Item key="cancel">Cancel Booking</Dropdown.Item>
                <Dropdown.Item key="noshow">Mark No-Show</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        )}
      </div>
    </div>
  );
}
