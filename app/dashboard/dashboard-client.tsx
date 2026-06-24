"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "./_components/dashboard-header";
import { ActivityTabs, buildActivityTabs, type ActivityTab } from "./_components/activity-tabs";
import { ActivityList, type ActivityBooking } from "./_components/activity-list";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { OccupancyCard } from "./_components/occupancy-card";
import { ForecastStrip } from "./_components/forecast-strip";
import { QuickStats, TodaySummary } from "./_components/quick-stats";
import { getDashboardData, checkInBooking, checkOutBooking, type DashboardData } from "./actions";
import { updateBookingStatus } from "@/app/actions/bookings";

// ── Props ──────────────────────────────────────────────────────

interface DashboardClientProps {
  hotelId: string;
  hotelName: string;
  currency: string;
}

const defaultEmptyStats = {
  arrivals: 0,
  uncheckedInArrivals: 0,
  departures: 0,
  pendingDepartures: 0,
  inHouse: 0,
  stayovers: 0,
  newBookings: 0,
  cancellations: 0,
  overbookings: 0,
};

// ── Main Component ─────────────────────────────────────────────

export function DashboardClient({ hotelId, hotelName, currency }: DashboardClientProps) {
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const [activeTab, setActiveTab] = React.useState<ActivityTab>("arrivals");
  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  // Data state
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Check-in/out loading states
  const [checkingIn, setCheckingIn] = React.useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = React.useState<Set<string>>(new Set());

  // Fetch data on mount and when date changes
  const fetchData = React.useCallback(async (date: Date) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDashboardData(format(date, "yyyy-MM-dd"));
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when booking changes (check-in/out/cancel from drawer)
  const handleBookingChanged = React.useCallback(() => {
    fetchData(selectedDate);
  }, [fetchData, selectedDate]);

  React.useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // Auto-refresh every 60 seconds
  React.useEffect(() => {
    const interval = setInterval(() => fetchData(selectedDate), 60000);
    return () => clearInterval(interval);
  }, [selectedDate, fetchData]);

  // Date change handler
  const handleDateChange = React.useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  // Day click on forecast
  const handleForecastDayClick = React.useCallback((iso: string) => {
    setSelectedDate(new Date(iso + "T00:00:00"));
  }, []);

  // View booking details
  const handleViewDetails = React.useCallback((booking: ActivityBooking) => {
    setSelectedBookingId(booking.id);
    setDetailOpen(true);
  }, []);

  // Check-in with optimistic UI
  const handleCheckIn = React.useCallback(async (bookingId: string) => {
    setCheckingIn((prev) => new Set(prev).add(bookingId));

    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        bookings: prev.bookings.map((b) =>
          b.id === bookingId ? { ...b, status: "checked_in" } : b
        ),
        stats: {
          ...prev.stats,
          arrivals: Math.max(0, prev.stats.arrivals - 1),
          inHouse: prev.stats.inHouse + 1,
          uncheckedInArrivals: Math.max(0, prev.stats.uncheckedInArrivals - 1),
        },
      };
    });

    const result = await checkInBooking(bookingId);
    setCheckingIn((prev) => {
      const next = new Set(prev);
      next.delete(bookingId);
      return next;
    });

    if (!result.success) {
      toast.error(result.error || "Check-in failed");
      // Revert optimistic update
      fetchData(selectedDate);
    } else {
      toast.success("Guest checked in successfully");
    }
  }, [fetchData, selectedDate]);

  // Check-out with optimistic UI
  const handleCheckOut = React.useCallback(async (bookingId: string) => {
    setCheckingOut((prev) => new Set(prev).add(bookingId));

    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        bookings: prev.bookings.map((b) =>
          b.id === bookingId ? { ...b, status: "checked_out" } : b
        ),
        stats: {
          ...prev.stats,
          departures: Math.max(0, prev.stats.departures + 1),
          inHouse: Math.max(0, prev.stats.inHouse - 1),
          pendingDepartures: Math.max(0, prev.stats.pendingDepartures - 1),
        },
      };
    });

    const result = await checkOutBooking(bookingId);
    setCheckingOut((prev) => {
      const next = new Set(prev);
      next.delete(bookingId);
      return next;
    });

    if (!result.success) {
      toast.error(result.error || "Check-out failed");
      fetchData(selectedDate);
    } else {
      toast.success("Guest checked out successfully");
    }
  }, [fetchData, selectedDate]);

  // ── Derived state (must be BEFORE early returns to avoid hook ordering violations) ──
  const tabs = data ? buildActivityTabs(data.stats) : buildActivityTabs(defaultEmptyStats);
  const dateStr = format(selectedDate, "EEEE, MMMM d, yyyy");

  // Filter bookings by active tab (unconditional hook call)
  const filteredBookings = React.useMemo(() => {
    if (!data) return [];
    switch (activeTab) {
      case "arrivals":
        return data.bookings.filter(
          (b) => b.checkIn === format(selectedDate, "yyyy-MM-dd") &&
            ["confirmed", "checked_in"].includes(b.status)
        );
      case "departures":
        return data.bookings.filter(
          (b) => b.checkOut === format(selectedDate, "yyyy-MM-dd") &&
            ["confirmed", "checked_in", "checked_out"].includes(b.status)
        );
      case "in_house":
        return data.bookings.filter((b) => b.status === "checked_in");
      case "stayovers":
        return data.bookings.filter(
          (b) => b.status === "checked_in" &&
            b.checkIn !== format(selectedDate, "yyyy-MM-dd") &&
            b.checkOut !== format(selectedDate, "yyyy-MM-dd")
        );
      default:
        return data.bookings;
    }
  }, [data?.bookings, activeTab, selectedDate]);

  // ── Loading State ────────────────────────────────────────────
  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  // ── Error State ──────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <svg className="size-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-foreground">Failed to load dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{error}</p>
        <Button variant="outline" size="sm" className="mt-4 rounded-lg" onClick={() => fetchData(selectedDate)}>
          Try again
        </Button>
      </div>
    );
  }

  // ── Null state ────────────────────────────────────────────────
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Page Header with Date Nav */}
      <DashboardHeader selectedDate={selectedDate} onDateChange={handleDateChange} />

      {/* Greeting + Hotel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 -mt-2">
        <div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground/70">{hotelName}</span>
            <span className="mx-1.5 text-muted-foreground/30">·</span>
            {dateStr}
          </p>
        </div>
      </div>

      {/* Activity Tabs Scoreboard */}
      <ActivityTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main Content: Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left: Activity List (3 cols) */}
        <div className="xl:col-span-3 space-y-6">
          <ActivityList
            bookings={filteredBookings}
            activeTab={activeTab}
            loading={loading}
            currency={currency}
            onCheckIn={(id) => {
              if (!checkingIn.has(id)) handleCheckIn(id);
            }}
            onCheckOut={(id) => {
              if (!checkingOut.has(id)) handleCheckOut(id);
            }}
            onViewDetails={handleViewDetails}
          />
        </div>

        {/* Right Panel: Occupancy + Forecast + Quick Stats (1 col) */}
        <div className="space-y-4">
          {/* Occupancy Card */}
          <OccupancyCard
            occupancyPercent={data.occupancy.percent}
            availableUnits={data.occupancy.availableRooms}
            bookedUnits={data.occupancy.occupiedRooms}
            outOfService={data.occupancy.outOfService}
            blockedDates={data.occupancy.blocked}
            totalRooms={data.occupancy.totalRooms}
          />

          {/* Quick Stats */}
          <QuickStats data={data.quickStats} currency={currency} />

          {/* Today's Summary */}
          <TodaySummary data={{ arrivals: data.stats.arrivals, departures: data.stats.departures, inHouse: data.stats.inHouse }} />
        </div>
      </div>

      {/* Forecast Strip - Full Width */}
      <ForecastStrip
        data={data.forecast}
        currency={currency}
        onDayClick={handleForecastDayClick}
      />

      {/* Booking Detail Drawer */}
      <BookingDetailDrawer
        bookingId={selectedBookingId}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedBookingId(null);
        }}
        currency={currency}
        onBookingChanged={handleBookingChanged}
      />
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-7 w-32 rounded-lg" />
          <Skeleton className="h-4 w-56 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-20 flex-1 rounded-xl" />
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-3">
          <Skeleton className="h-8 w-48 rounded-lg" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
