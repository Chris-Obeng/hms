"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  LayoutGrid,
  List,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HousekeepingBoard } from "@/components/housekeeping/kanban-board";
import { HousekeepingStatsBar } from "@/components/housekeeping/stats-bar";
import {
  getHousekeepingData,
  updateHousekeepingStatus,
  type HousekeepingData,
  type HousekeepingRoom,
} from "@/app/actions/housekeeping";
import { createClient } from "@/lib/supabase/client";

// ── Props ──────────────────────────────────────────────────────────

interface HousekeepingClientProps {
  initialData: HousekeepingData;
  hotelId: string;
}

// ── Component ──────────────────────────────────────────────────────

export function HousekeepingClient({ initialData, hotelId }: HousekeepingClientProps) {
  const [data, setData] = React.useState<HousekeepingData>(initialData);
  const [loading, setLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"board" | "compact">("board");

  // ── Fetch Data ──────────────────────────────────────────────────

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await getHousekeepingData();
      if (result.success) {
        setData(result.data);
      } else {
        toast.error(result.error || "Failed to load housekeeping data");
      }
    } catch {
      toast.error("Failed to load housekeeping data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 60 seconds
  React.useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Realtime subscription — refresh on any room or booking change for this hotel
  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`hotel:${hotelId}:housekeeping`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `hotel_id=eq.${hotelId}` },
        fetchData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        fetchData,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId, fetchData]);

  // ── Status Change Handler ──────────────────────────────────────

  const handleStatusChange = React.useCallback(
    async (roomId: string, newStatus: string) => {
      // Optimistic update
      setData((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) =>
          r.id === roomId ? { ...r, status: newStatus } : r
        ),
      }));

      const result = await updateHousekeepingStatus(roomId, newStatus);
      if (result.success) {
        toast.success("Room status updated");
        // Refresh to get accurate data
        fetchData();
      } else {
        toast.error(result.error || "Failed to update status");
        // Revert on failure
        fetchData();
      }
    },
    [fetchData]
  );

  // ── Filtering ─────────────────────────────────────────────────

  const filteredRooms = React.useMemo(() => {
    if (!searchQuery.trim()) return data.rooms;
    const q = searchQuery.toLowerCase();
    return data.rooms.filter(
      (r) =>
        r.roomNumber.toLowerCase().includes(q) ||
        r.roomTypeName.toLowerCase().includes(q) ||
        (r.floor || "").toLowerCase().includes(q) ||
        (r.guestName || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q)
    );
  }, [data.rooms, searchQuery]);

  // ── Derived Stats (recalculated after optimistic updates) ──────

  const liveStats = React.useMemo(() => {
    const rooms = data.rooms;
    return {
      dirty: rooms.filter((r) => r.status === "checkout_pending").length,
      cleaning: rooms.filter((r) => r.status === "cleaning").length,
      inspected: 0,
      ready: rooms.filter((r) => r.status === "available").length,
      occupied: rooms.filter((r) => r.status === "occupied").length,
      maintenance: rooms.filter((r) => r.status === "maintenance").length,
      outOfService: rooms.filter((r) => r.status === "out_of_service").length,
      totalRooms: rooms.length,
    };
  }, [data.rooms]);

  const liveDepartures = React.useMemo(
    () => data.rooms.filter((r) => r.hasDepartureToday).length,
    [data.rooms]
  );

  const liveArrivals = React.useMemo(
    () => data.rooms.filter((r) => r.hasArrivalToday).length,
    [data.rooms]
  );

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-page-title text-foreground">Housekeeping</h1>
          <p className="text-body text-muted-foreground mt-1">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
            <span className="mx-1.5 text-muted-foreground/30">·</span>
            {data.stats.totalRooms} rooms
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggles — size-9 for 36px tap target */}
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              "size-9 rounded-lg",
              viewMode === "board" && "bg-muted text-foreground"
            )}
            onClick={() => setViewMode("board")}
            aria-label="Board view"
            aria-pressed={viewMode === "board"}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              "size-9 rounded-lg",
              viewMode === "compact" && "bg-muted text-foreground"
            )}
            onClick={() => setViewMode("compact")}
            aria-label="Compact view"
            aria-pressed={viewMode === "compact"}
          >
            <List className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-9 rounded-lg"
            onClick={fetchData}
            disabled={loading}
            aria-label="Refresh housekeeping data"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <HousekeepingStatsBar
        stats={liveStats}
        todayDepartures={liveDepartures}
        todayArrivals={liveArrivals}
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
        <Input
          placeholder="Search room number, type, guest..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 pl-9 pr-9 text-sm rounded-xl border-border/60"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Kanban Board */}
      <div className="-mx-4 sm:mx-0">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
        <HousekeepingBoard
          rooms={filteredRooms}
          onStatusChange={handleStatusChange}
          compact={viewMode === "compact"}
        />
      </div>
    </div>
  );
}
