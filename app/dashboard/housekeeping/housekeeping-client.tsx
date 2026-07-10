"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
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
  type HousekeepingData,
  type HousekeepingRoom,
} from "@/app/actions/housekeeping";
import { createClient } from "@/lib/supabase/client";
import { writeAuditLog } from "@/lib/audit";
import { qk } from "@/lib/query-keys";

// ── Props ──────────────────────────────────────────────────────────

interface HousekeepingClientProps {
  initialData: HousekeepingData;
  hotelId: string;
}

// ── Client-Side Fetcher ────────────────────────────────────────────

async function fetchHousekeepingClientData(supabase: any, hotelId: string): Promise<HousekeepingData> {
  const today = new Date().toISOString().split("T")[0];

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select(`
      id, room_number, floor, status, is_active, notes,
      room_types!inner(id, name)
    `)
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("room_number", { ascending: true });

  if (roomsError) throw roomsError;

  const { data: todayBookings, error: bookingsError } = await supabase
    .from("bookings")
    .select(`
      id, room_id, check_in, check_out, status,
      guests(full_name)
    `)
    .eq("hotel_id", hotelId)
    .in("status", ["confirmed", "checked_in"])
    .lte("check_in", today);

  if (bookingsError) throw bookingsError;

  const STATUS_PRIORITY: Record<string, number> = {
    checked_in: 2,
    confirmed: 1,
  };
  const bookingByRoom = new Map<string, { guestName: string | null; checkIn: string; checkOut: string; status: string | null }>();
  const arrivingTodayRooms = new Map<string, string | null>();

  for (const b of todayBookings || []) {
    if (b.room_id) {
      if (b.status === "confirmed" && b.check_in === today) {
        arrivingTodayRooms.set(b.room_id, (b.guests as any)?.full_name || null);
      }
      const existing = bookingByRoom.get(b.room_id);
      const newPriority = STATUS_PRIORITY[b.status || ""] || 0;
      const existingPriority = existing ? STATUS_PRIORITY[existing.status || ""] || 0 : 0;
      if (!existing || newPriority >= existingPriority) {
        bookingByRoom.set(b.room_id, {
          guestName: (b.guests as any)?.full_name || null,
          checkIn: b.check_in,
          checkOut: b.check_out,
          status: b.status,
        });
      }
    }
  }

  const mappedRooms: HousekeepingRoom[] = (rooms || []).map((r: any) => {
    const booking = bookingByRoom.get(r.id);
    return {
      id: r.id,
      roomNumber: r.room_number,
      floor: r.floor,
      roomTypeId: (r.room_types as any).id,
      roomTypeName: (r.room_types as any).name,
      status: r.status || "available",
      isActive: r.is_active || false,
      notes: r.notes,
      hasArrivalToday: arrivingTodayRooms.has(r.id),
      hasDepartureToday: booking?.checkOut === today && booking?.status === "checked_in",
      isVip: false,
      guestName: arrivingTodayRooms.has(r.id)
        ? (arrivingTodayRooms.get(r.id) ?? null)
        : booking?.status === "checked_in"
          ? (booking?.guestName ?? null)
          : null,
    };
  });

  const stats = {
    dirty: mappedRooms.filter((r) => r.status === "checkout_pending").length,
    cleaning: mappedRooms.filter((r) => r.status === "cleaning").length,
    inspected: 0,
    ready: mappedRooms.filter((r) => r.status === "available").length,
    occupied: mappedRooms.filter((r) => r.status === "occupied").length,
    maintenance: mappedRooms.filter((r) => r.status === "maintenance").length,
    outOfService: mappedRooms.filter((r) => r.status === "out_of_service").length,
    totalRooms: mappedRooms.length,
  };

  const todayDepartures = mappedRooms.filter((r) => r.hasDepartureToday).length;
  const todayArrivals = mappedRooms.filter((r) => r.hasArrivalToday).length;

  return {
    rooms: mappedRooms,
    stats,
    todayDepartures,
    todayArrivals,
  };
}

// ── Component ──────────────────────────────────────────────────────

export function HousekeepingClient({ initialData, hotelId }: HousekeepingClientProps) {
  const queryClient = useQueryClient();
  const { orgId, userId } = useAuth();
  
  const [searchQuery, setSearchQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"board" | "compact">("board");

  // Query staff profile for audit logging
  const { data: staffProfile } = useQuery({
    queryKey: qk.staffProfile(orgId || "", userId || ""),
    queryFn: async () => {
      if (!orgId || !userId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .eq("clerk_user_id", userId)
        .eq("clerk_org_id", orgId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && !!userId,
  });

  // Main housekeeping query
  const {
    data = initialData,
    isLoading: loading,
    refetch: fetchData
  } = useQuery({
    queryKey: qk.housekeeping(orgId || "", hotelId),
    queryFn: () => {
      const supabase = createClient();
      return fetchHousekeepingClientData(supabase, hotelId);
    },
    enabled: !!orgId,
    refetchInterval: 60000, // 60s auto-refresh
  });

  // Realtime subscription — refresh on any room or booking change for this hotel
  React.useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`hotel:${hotelId}:housekeeping`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `hotel_id=eq.${hotelId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: qk.housekeeping(orgId, hotelId) });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: qk.housekeeping(orgId, hotelId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId, orgId, queryClient]);

  // Mutation for updating status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ roomId, newStatus }: { roomId: string; newStatus: string }) => {
      const supabase = createClient();
      
      const { data: before, error: selectError } = await supabase
        .from("rooms")
        .select("room_number, status")
        .eq("id", roomId)
        .single();

      if (selectError) throw selectError;

      const { error: updateError } = await supabase
        .from("rooms")
        .update({ status: newStatus })
        .eq("id", roomId);

      if (updateError) throw updateError;

      if (staffProfile) {
        await writeAuditLog(supabase, {
          hotelId,
          staffId: staffProfile.id,
          staffName: staffProfile.full_name,
          action: "room.status_changed",
          entityType: "room",
          entityId: roomId,
          beforeState: { room_number: before?.room_number, status: before?.status },
          afterState: { room_number: before?.room_number, status: newStatus },
        });
      }

      return { roomId, newStatus };
    },
    onMutate: async ({ roomId, newStatus }) => {
      const queryKey = qk.housekeeping(orgId || "", hotelId);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          rooms: old.rooms.map((r: any) =>
            r.id === roomId ? { ...r, status: newStatus } : r
          ),
        };
      });

      return { previousData };
    },
    onError: (err, variables, context: any) => {
      const queryKey = qk.housekeeping(orgId || "", hotelId);
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    },
    onSuccess: () => {
      toast.success("Room status updated");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.housekeeping(orgId || "", hotelId) });
    }
  });

  const handleStatusChange = React.useCallback(
    (roomId: string, newStatus: string) => {
      updateStatusMutation.mutate({ roomId, newStatus });
    },
    [updateStatusMutation]
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
            onClick={() => fetchData()}
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
