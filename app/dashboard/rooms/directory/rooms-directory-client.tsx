"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  Plus,
  Search,
  MoreHorizontal,
  Hammer,
  Wrench,
  CalendarX,
  DoorOpen,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type RoomInput, type AvailabilityBlockInput } from "@/app/actions/rooms";
import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { qk } from "@/lib/query-keys";
import { writeAuditLog } from "@/lib/audit";

// ── Types ──────────────────────────────────────────────────────────

export interface RoomRow {
  id: string;
  roomNumber: string;
  floor: string | null;
  status: string | null;
  isActive: boolean | null;
  notes: string | null;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeSlug: string;
  createdAt: string | null;
}

interface RoomsDirectoryProps {
  data: RoomRow[];
  roomTypes: { id: string; name: string }[];
  hotelId: string;
}

// ── Status Config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  available: { label: "Available", color: "text-emerald-600", bg: "bg-emerald-500/10" },
  occupied: { label: "Occupied", color: "text-blue-600", bg: "bg-blue-500/10" },
  checkout_pending: { label: "Checkout Pending", color: "text-orange-600", bg: "bg-orange-500/10" },
  maintenance: { label: "Maintenance", color: "text-slate-600", bg: "bg-slate-500/10" },
  out_of_service: { label: "Out of Service", color: "text-red-600", bg: "bg-red-500/10" },
  cleaning: { label: "Cleaning", color: "text-cyan-600", bg: "bg-cyan-500/10" },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  available: ["occupied", "maintenance", "cleaning"],
  occupied: ["checkout_pending", "maintenance"],
  checkout_pending: ["available", "cleaning", "occupied"],
  maintenance: ["available"],
  out_of_service: ["available"],
  cleaning: ["available"],
};

// ── Component ──────────────────────────────────────────────────────

export function RoomsDirectory({ data, roomTypes, hotelId }: RoomsDirectoryProps) {
  const queryClient = useQueryClient();
  const { orgId, userId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "roomNumber", desc: false },
  ]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // Sync search query param to table global filter
  React.useEffect(() => {
    const q = searchParams.get("search");
    if (q) {
      setGlobalFilter(q);
    }
  }, [searchParams]);

  // Add Room Sheet State
  const [addRoomOpen, setAddRoomOpen] = React.useState(false);
  const [newRoomNumber, setNewRoomNumber] = React.useState("");
  const [newRoomTypeId, setNewRoomTypeId] = React.useState("");
  const [newFloor, setNewFloor] = React.useState("");
  const [newNotes, setNewNotes] = React.useState("");

  // Block Room Sheet State
  const [blockOpen, setBlockOpen] = React.useState(false);
  const [blockRoomId, setBlockRoomId] = React.useState("");
  const [blockStartDate, setBlockStartDate] = React.useState("");
  const [blockEndDate, setBlockEndDate] = React.useState("");
  const [blockReason, setBlockReason] = React.useState<"maintenance" | "deep_cleaning" | "owner_use" | "renovation" | "other">("maintenance");
  const [blockNotes, setBlockNotes] = React.useState("");

  // Query staff profile for audit logs
  const { data: staffProfile } = useQuery({
    queryKey: qk.staffProfile(orgId || "", userId || ""),
    queryFn: async () => {
      if (!orgId || !userId) return null;
      const supabase = createClient();
      const { data: profile, error } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .eq("clerk_user_id", userId)
        .eq("clerk_org_id", orgId)
        .single();
      if (error) throw error;
      return profile;
    },
    enabled: !!orgId && !!userId,
  });

  // Rooms Query
  const { data: localData = data, isLoading: loading } = useQuery({
    queryKey: qk.rooms(orgId || "", hotelId),
    queryFn: async () => {
      const supabase = createClient();
      const { data: roomsData, error } = await supabase
        .from("rooms")
        .select(`
          id, room_number, floor, status, is_active, notes, created_at,
          room_types!inner(id, name, slug)
        `)
        .eq("hotel_id", hotelId)
        .order("room_number", { ascending: true });
      
      if (error) throw error;
      
      return (roomsData || []).map((r) => ({
        id: r.id,
        roomNumber: r.room_number,
        floor: r.floor,
        status: r.status,
        isActive: r.is_active,
        notes: r.notes,
        roomTypeId: r.room_types.id,
        roomTypeName: r.room_types.name,
        roomTypeSlug: r.room_types.slug,
        createdAt: r.created_at,
      }));
    },
    enabled: !!orgId,
  });

  // Realtime subscription — refresh on any room change for this hotel
  React.useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`hotel:${hotelId}:rooms-directory`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `hotel_id=eq.${hotelId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: qk.rooms(orgId, hotelId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId, orgId, queryClient]);

  // Filtered data
  const filteredData = React.useMemo(() => {
    let result = localData;
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (globalFilter) {
      const search = globalFilter.toLowerCase();
      result = result.filter(
        (r) =>
          r.roomNumber.toLowerCase().includes(search) ||
          r.roomTypeName.toLowerCase().includes(search) ||
          (r.floor || "").toLowerCase().includes(search)
      );
    }
    return result;
  }, [localData, statusFilter, globalFilter]);

  // ── Mutations ──────────────────────────────────────────────────

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
      const queryKey = qk.rooms(orgId || "", hotelId);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return old.map((r: any) =>
          r.id === roomId ? { ...r, status: newStatus } : r
        );
      });

      return { previousData };
    },
    onError: (err, variables, context: any) => {
      const queryKey = qk.rooms(orgId || "", hotelId);
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    },
    onSuccess: (res) => {
      const config = STATUS_CONFIG[res.newStatus];
      toast.success(`Room status changed to ${config?.label || res.newStatus}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.rooms(orgId || "", hotelId) });
    }
  });

  const createRoomMutation = useMutation({
    mutationFn: async (input: RoomInput) => {
      const supabase = createClient();
      
      const { error, data: newRoom } = await supabase.from("rooms").insert({
        hotel_id: hotelId,
        room_type_id: input.roomTypeId,
        room_number: input.roomNumber,
        floor: input.floor || null,
        notes: input.notes || null,
        status: input.status,
        is_active: input.isActive,
      }).select("id").single();

      if (error) throw error;
      return newRoom;
    },
    onSuccess: () => {
      toast.success(`Room ${newRoomNumber} added`);
      setAddRoomOpen(false);
      setNewRoomNumber("");
      setNewRoomTypeId("");
      setNewFloor("");
      setNewNotes("");
      queryClient.invalidateQueries({ queryKey: qk.rooms(orgId || "", hotelId) });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to add room");
    }
  });

  const createBlockMutation = useMutation({
    mutationFn: async (input: AvailabilityBlockInput) => {
      const supabase = createClient();
      
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("room_number")
        .eq("id", input.roomId)
        .single();
      
      if (roomError) throw roomError;

      const { error, data: block } = await supabase.from("availability_blocks").insert({
        hotel_id: hotelId,
        room_id: input.roomId,
        start_date: input.startDate,
        end_date: input.endDate,
        reason: input.reason,
        notes: input.notes || null,
      }).select("id").single();

      if (error) throw error;

      const statusToSet = input.reason === "maintenance" || input.reason === "deep_cleaning" ? "maintenance" : "out_of_service";
      const { error: roomUpdateError } = await supabase
        .from("rooms")
        .update({ status: statusToSet })
        .eq("id", input.roomId);

      if (roomUpdateError) throw roomUpdateError;

      if (staffProfile) {
        await writeAuditLog(supabase, {
          hotelId,
          staffId: staffProfile.id,
          staffName: staffProfile.full_name,
          action: "room.block_created",
          entityType: "room",
          entityId: input.roomId,
          afterState: {
            room_number: roomData?.room_number,
            start_date: input.startDate,
            end_date: input.endDate,
            reason: input.reason,
          },
        });
      }

      return block;
    },
    onSuccess: () => {
      toast.success("Room blocked for selected dates");
      setBlockOpen(false);
      setBlockRoomId("");
      setBlockStartDate("");
      setBlockEndDate("");
      setBlockReason("maintenance");
      setBlockNotes("");
      queryClient.invalidateQueries({ queryKey: qk.rooms(orgId || "", hotelId) });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to block room");
    }
  });

  const handleStatusChange = (roomId: string, newStatus: string) => {
    updateStatusMutation.mutate({ roomId, newStatus });
  };

  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomNumber || !newRoomTypeId) return;

    createRoomMutation.mutate({
      roomTypeId: newRoomTypeId,
      roomNumber: newRoomNumber,
      floor: newFloor,
      notes: newNotes,
      status: "available",
      isActive: true,
    });
  };

  const handleBlockRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockRoomId || !blockStartDate || !blockEndDate) return;

    createBlockMutation.mutate({
      roomId: blockRoomId,
      startDate: blockStartDate,
      endDate: blockEndDate,
      reason: blockReason,
      notes: blockNotes,
    });
  };

  // ── Columns ───────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<RoomRow>[]>(
    () => [
      {
        accessorKey: "roomNumber",
        header: "Room",
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0 ring-1 ring-border/20">
              <DoorOpen className="size-3.5 text-muted-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground font-mono">
                {row.original.roomNumber}
              </span>
              {row.original.floor && (
                <span className="text-[10px] text-muted-foreground">
                  Floor {row.original.floor}
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "roomTypeName",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[11px] font-medium">
            {row.original.roomTypeName}
          </Badge>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status || "available";
          const config = STATUS_CONFIG[status] || STATUS_CONFIG.available;
          return (
            <select
              value={status}
              onChange={(e) => handleStatusChange(row.original.id, e.target.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border-0 px-2 py-1 text-xs font-medium outline-none cursor-pointer transition-colors",
                config.bg,
                config.color
              )}
            >
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key} className="bg-background text-foreground">
                  {cfg.label}
                </option>
              ))}
            </select>
          );
        },
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const room = row.original;
          const transitions = STATUS_TRANSITIONS[room.status || "available"] || [];
          return (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                <MoreHorizontal className="size-3.5" />
                <span className="sr-only">Actions</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                  Rm {room.roomNumber}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {transitions.map((transition) => (
                  <DropdownMenuItem
                    key={transition}
                    onClick={() => handleStatusChange(room.id, transition)}
                  >
                    <span className="size-3.5 mr-2 flex items-center justify-center">→</span>
                    Mark as {STATUS_CONFIG[transition]?.label || transition}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setBlockRoomId(room.id);
                    setBlockStartDate(format(new Date(), "yyyy-MM-dd"));
                    setBlockEndDate(format(new Date(Date.now() + 86400000), "yyyy-MM-dd"));
                    setBlockOpen(true);
                  }}
                >
                  <CalendarX className="size-3.5 mr-2" />
                  Block Dates
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 50 },
    },
  });

  const totalCount = data.length;

  // ── Status counts ─────────────────────────────────────────────
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach((r) => {
      const s = r.status || "available";
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [data]);

  return (
    <>
      <div className="space-y-4">
        {/* Status summary bar */}
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = statusCounts[key] || 0;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                  statusFilter === key
                    ? "border-foreground/30 bg-foreground/5"
                    : "border-border/50 hover:border-border",
                  cfg.color
                )}
              >
                <span className={cn("size-1.5 rounded-full", cfg.bg.replace("/10", "/60").replace("/20", "/60"))} />
                {cfg.label}
                <span className="text-muted-foreground font-normal">{count}</span>
              </button>
            );
          })}
          {statusFilter !== "all" && (
            <button
              onClick={() => setStatusFilter("all")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
            >
              Clear
            </button>
          )}
        </div>

        {/* Search + Add */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
            <Input
              placeholder="Search room number, type, floor..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-9 pl-9 text-sm rounded-xl border-border/60"
            />
          </div>
          <Button
            size="sm"
            className="h-9 text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90 shrink-0"
            onClick={() => setAddRoomOpen(true)}
          >
            <Plus className="size-3.5 mr-1.5" />
            Add Room
          </Button>
        </div>

        {/* DataTable */}
        <Card className="border-border/60 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder ? null : (
                          <button
                            className={cn(
                              "flex items-center gap-1 select-none",
                              header.column.getCanSort() && "cursor-pointer hover:text-foreground"
                            )}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <ChevronDown className="size-3 rotate-180 text-muted-foreground/60" />,
                              desc: <ChevronDown className="size-3 text-muted-foreground/60" />,
                            }[header.column.getIsSorted() as string] ?? null}
                          </button>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className="group">
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <DoorOpen className="size-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">
                          {globalFilter || statusFilter !== "all"
                            ? "No rooms match your filters"
                            : "No rooms yet"}
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px]">
                          {globalFilter || statusFilter !== "all"
                            ? "Try adjusting your search or filters"
                            : "Add your first room to get started."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {table.getRowModel().rows.length > 0
                ? `Showing ${table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} - ${Math.min(
                    (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                    table.getRowModel().rows.length
                  )} of ${table.getRowModel().rows.length}`
                : "No results"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs rounded-lg"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs rounded-lg"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Add Room Sheet ── */}
      <Sheet open={addRoomOpen} onOpenChange={setAddRoomOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Add Room</SheetTitle>
            <SheetDescription>Add a new physical room to your hotel.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddRoom} className="space-y-4 mt-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Room number *
              </label>
              <Input
                placeholder="e.g. 101"
                value={newRoomNumber}
                onChange={(e) => setNewRoomNumber(e.target.value)}
                className="h-9 rounded-xl"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Room type *
              </label>
              <select
                value={newRoomTypeId}
                onChange={(e) => setNewRoomTypeId(e.target.value)}
                className="h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                required
              >
                <option value="">Select room type...</option>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>{rt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Floor
              </label>
              <Input
                placeholder="e.g. Ground, 1, 2"
                value={newFloor}
                onChange={(e) => setNewFloor(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Notes
              </label>
              <textarea
                placeholder="Optional notes about this room..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground resize-none"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                type="button"
                className="text-sm rounded-xl"
                onClick={() => setAddRoomOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !newRoomNumber || !newRoomTypeId}
                className="text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90"
              >
                {loading ? "Adding..." : "Add Room"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Block Room Sheet ── */}
      <Sheet open={blockOpen} onOpenChange={setBlockOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Block Room Dates</SheetTitle>
            <SheetDescription>
              Block this room from being booked for maintenance, cleaning, or owner use.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleBlockRoom} className="space-y-4 mt-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Reason
              </label>
              <select
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value as typeof blockReason)}
                className="h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="maintenance">Maintenance</option>
                <option value="deep_cleaning">Deep Cleaning</option>
                <option value="owner_use">Owner Use</option>
                <option value="renovation">Renovation</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Start date *
              </label>
              <Input
                type="date"
                value={blockStartDate}
                onChange={(e) => setBlockStartDate(e.target.value)}
                className="h-9 rounded-xl"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                End date *
              </label>
              <Input
                type="date"
                value={blockEndDate}
                onChange={(e) => setBlockEndDate(e.target.value)}
                className="h-9 rounded-xl"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Notes (optional)
              </label>
              <textarea
                placeholder="Reason for blocking..."
                value={blockNotes}
                onChange={(e) => setBlockNotes(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground resize-none"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                type="button"
                className="text-sm rounded-xl"
                onClick={() => setBlockOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !blockStartDate || !blockEndDate}
                className="text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90"
              >
                {loading ? "Blocking..." : "Block Dates"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
