"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  CalendarX,
  DoorOpen,
  Plus,
  Wrench,
} from "lucide-react";
import {
  Button,
  Chip,
  Dropdown,
  Input,
  Label,
  Modal,
  SearchField,
  Table,
  TextArea,
  toast,
} from "@heroui/react";

import { cn } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { HeroTablePagination } from "@/components/ui/hero-table-pagination";
import { type RoomInput } from "@/app/actions/rooms";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { qk } from "@/lib/query-keys";
import { writeAuditLog } from "@/lib/audit";
import { BlockRoomSheet } from "@/app/dashboard/calendar/_components/block-room-sheet";

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

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; dot: string }
> = {
  available: {
    label: "Available",
    color: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    dot: "bg-emerald-500",
  },
  occupied: {
    label: "Occupied",
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-500/10",
    dot: "bg-blue-500",
  },
  maintenance: {
    label: "Maintenance",
    color: "text-slate-600 dark:text-slate-300",
    bg: "bg-slate-500/10",
    dot: "bg-slate-500",
  },
  out_of_service: {
    label: "Out of Service",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    dot: "bg-red-500",
  },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  available: ["occupied", "maintenance"],
  occupied: ["available", "maintenance"],
  maintenance: ["available"],
  out_of_service: ["available"],
};

function getStatusConfig(status: string | null) {
  return STATUS_CONFIG[status || "available"] || STATUS_CONFIG.available;
}

// ── Status cell: chip that opens allowed transitions ───────────────

function RoomStatusCell({
  room,
  onStatusChange,
}: {
  room: RoomRow;
  onStatusChange: (roomId: string, newStatus: string) => void;
}) {
  const config = getStatusConfig(room.status);
  const transitions = STATUS_TRANSITIONS[room.status || "available"] || [];

  return (
    <Dropdown>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Change status for room ${room.roomNumber}, currently ${config.label}`}
        className={cn(
          "h-7 min-w-0 gap-1.5 rounded-lg px-2 text-caption font-medium",
          config.bg,
          config.color
        )}
      >
        <span className={cn("size-1.5 rounded-full", config.dot)} />
        {config.label}
      </Button>
      <Dropdown.Popover placement="bottom start">
        <Dropdown.Menu
          onAction={(key) => onStatusChange(room.id, String(key))}
        >
          <Dropdown.Section>
            <Label className="px-2 py-1 text-caption text-muted-foreground">
              Mark as
            </Label>
            {transitions.map((transition) => (
              <Dropdown.Item
                key={transition}
                id={transition}
                textValue={`Mark as ${STATUS_CONFIG[transition]?.label || transition}`}
              >
                <Label>{STATUS_CONFIG[transition]?.label || transition}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

// ── Component ──────────────────────────────────────────────────────

export function RoomsDirectory({ data, roomTypes, hotelId }: RoomsDirectoryProps) {
  const queryClient = useQueryClient();
  const { orgId, userId } = useAuth();
  const searchParams = useSearchParams();

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
    // Housekeeping sweeps and bulk status changes touch many rooms at once.
    const refresh = createCoalescer();
    const channel = supabase
      .channel(`hotel:${hotelId}:rooms-directory`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `hotel_id=eq.${hotelId}` },
        () => refresh.schedule(() => {
          queryClient.invalidateQueries({ queryKey: qk.rooms(orgId, hotelId) });
        }),
      )
      .subscribe(
        onRealtimeStatus({ label: "rooms-directory", hotelId, orgId, table: "rooms" }),
      );
    return () => {
      refresh.cancel();
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

      queryClient.setQueryData<RoomRow[]>(queryKey, (old) =>
        old?.map((r) => (r.id === roomId ? { ...r, status: newStatus } : r))
      );

      return { previousData };
    },
    onError: (err, _variables, context) => {
      const queryKey = qk.rooms(orgId || "", hotelId);
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.danger(err instanceof Error ? err.message : "Failed to update status");
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
      toast.danger(err instanceof Error ? err.message : "Failed to add room");
    }
  });

  const handleStatusChange = React.useCallback(
    (roomId: string, newStatus: string) => {
      updateStatusMutation.mutate({ roomId, newStatus });
    },
    [updateStatusMutation]
  );

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

  // ── Columns ───────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<RoomRow>[]>(
    () => [
      {
        accessorKey: "roomNumber",
        header: "Room",
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/30 ring-1 ring-border/20">
              <DoorOpen className="size-3.5 text-muted-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-body font-medium text-foreground">
                {row.original.roomNumber}
              </span>
              {row.original.floor && (
                <span className="text-caption text-muted-foreground">
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
          <Chip size="sm" variant="soft" className="max-w-[140px]">
            <span className="truncate">{row.original.roomTypeName}</span>
          </Chip>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <RoomStatusCell room={row.original} onStatusChange={handleStatusChange} />
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const room = row.original;
          return (
            <Dropdown>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={`Actions for room ${room.roomNumber}`}
                className="size-8 min-w-8 rounded-lg text-muted-foreground"
              >
                <Wrench className="size-4" />
              </Button>
              <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                  <Dropdown.Item
                    id="block"
                    textValue="Block dates"
                    onAction={() => {
                      setBlockRoomId(room.id);
                      setBlockOpen(true);
                    }}
                  >
                    <CalendarX className="size-3.5" />
                    <Label>Block dates…</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          );
        },
      },
    ],
    [handleStatusChange]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 20 },
    },
  });

  const totalCount = localData.length;

  // ── Status counts ─────────────────────────────────────────────
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    localData.forEach((r) => {
      const s = r.status || "available";
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [localData]);

  const rows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const isFiltered = statusFilter !== "all" || globalFilter.trim().length > 0;

  const emptyState = (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <DoorOpen className="mb-3 size-10 text-muted-foreground/30" />
      <p className="text-body font-medium text-muted-foreground">
        {isFiltered ? "No rooms match your filters" : "No rooms yet"}
      </p>
      <p className="text-caption mt-1 max-w-[260px] text-muted-foreground/60">
        {isFiltered
          ? "Try adjusting your search or filters."
          : "Add your first room to get started."}
      </p>
    </div>
  );

  return (
    <>
      <div className="space-y-4">
        {/* Status summary + filters */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Status chips */}
          <div className="-mx-1 no-scrollbar flex items-center gap-2 overflow-x-auto px-1 pb-1 lg:pb-0">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const count = statusCounts[key] || 0;
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(active ? "all" : key)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-foreground/30 bg-foreground/5"
                      : "border-border/50 hover:border-border hover:bg-muted/40",
                    cfg.color
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", cfg.dot)} />
                  {cfg.label}
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Search + add */}
          <div className="flex items-center gap-2">
            <SearchField
              aria-label="Search rooms"
              value={globalFilter}
              onChange={setGlobalFilter}
              className="flex-1 lg:max-w-xs"
            >
              <SearchField.Group className="h-9 rounded-xl border-border/60 bg-background">
                <SearchField.SearchIcon />
                <SearchField.Input
                  placeholder="Search room, type, floor..."
                  className="text-sm"
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <Button size="sm" onPress={() => setAddRoomOpen(true)} className="shrink-0">
              <Plus className="size-4" />
              Add Room
            </Button>
          </div>
        </div>

        {/* Desktop table */}
        <Table variant="secondary" className="hidden md:block">
          <Table.ScrollContainer>
            <Table.Content aria-label="Rooms" className="min-w-[640px]">
              <Table.Header>
                {table.getHeaderGroups()[0]?.headers.map((header) => (
                  <Table.Column
                    key={header.id}
                    id={header.id}
                    isRowHeader={header.id === "roomNumber"}
                  >
                    {header.id === "actions" ? null : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </Table.Column>
                ))}
              </Table.Header>
              <Table.Body renderEmptyState={() => emptyState}>
                {rows.map((row) => (
                  <Table.Row key={row.id} id={row.id} className={cn(loading && "opacity-60")}>
                    {row.getVisibleCells().map((cell) => (
                      <Table.Cell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
          <Table.Footer>
            <HeroTablePagination
              table={table}
              totalRows={totalCount}
              filteredRows={filteredCount}
            />
          </Table.Footer>
        </Table>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {rows.length > 0 ? (
            <>
              {rows.map(({ original: room }) => {
                const cfg = getStatusConfig(room.status);
                return (
                  <div
                    key={room.id}
                    className="rounded-xl border border-border/60 bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-body font-semibold text-foreground">
                            {room.roomNumber}
                          </span>
                          {room.floor && (
                            <span className="text-caption text-muted-foreground">
                              Fl {room.floor}
                            </span>
                          )}
                        </div>
                        <p className="text-caption mt-0.5 truncate text-muted-foreground">
                          {room.roomTypeName}
                        </p>
                      </div>
                      <RoomStatusCell room={room} onStatusChange={handleStatusChange} />
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                      <span className={cn("inline-flex items-center gap-1.5 text-caption font-medium", cfg.color)}>
                        <span className={cn("size-1.5 rounded-full", cfg.dot)} />
                        {cfg.label}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 rounded-lg px-2 text-caption text-muted-foreground"
                        onPress={() => {
                          setBlockRoomId(room.id);
                          setBlockOpen(true);
                        }}
                      >
                        <CalendarX className="size-3.5" />
                        Block dates
                      </Button>
                    </div>
                  </div>
                );
              })}
              <HeroTablePagination
                table={table}
                totalRows={totalCount}
                filteredRows={filteredCount}
              />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 p-4">
              {emptyState}
            </div>
          )}
        </div>
      </div>

      {/* ── Add Room Modal ── */}
      <Modal.Backdrop isOpen={addRoomOpen} onOpenChange={setAddRoomOpen}>
        <Modal.Container>
          <Modal.Dialog className="max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Add Room</Modal.Heading>
              <p className="text-caption text-muted-foreground">
                Add a new physical room to your hotel.
              </p>
            </Modal.Header>
            <Modal.Body>
              <form onSubmit={handleAddRoom} className="space-y-4" id="add-room-form">
                <div>
                  <label htmlFor="new-room-number" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Room number *
                  </label>
                  <Input
                    id="new-room-number"
                    placeholder="e.g. 101"
                    value={newRoomNumber}
                    onChange={(e) => setNewRoomNumber(e.target.value)}
                    className="h-9 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Room type *
                  </label>
                  <HeroSelectField
                    value={newRoomTypeId}
                    onValueChange={setNewRoomTypeId}
                    options={roomTypes.map((rt) => ({ value: rt.id, label: rt.name }))}
                    placeholder="Select room type..."
                    isRequired
                    ariaLabel="Room type"
                  />
                </div>
                <div>
                  <label htmlFor="new-room-floor" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Floor
                  </label>
                  <Input
                    id="new-room-floor"
                    placeholder="e.g. Ground, 1, 2"
                    value={newFloor}
                    onChange={(e) => setNewFloor(e.target.value)}
                    className="h-9 rounded-xl"
                  />
                </div>
                <div>
                  <label htmlFor="new-room-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Notes
                  </label>
                  <TextArea
                    id="new-room-notes"
                    placeholder="Optional notes about this room..."
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
              </form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" type="button" onPress={() => setAddRoomOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="add-room-form"
                isPending={createRoomMutation.isPending}
                isDisabled={!newRoomNumber || !newRoomTypeId}
              >
                {createRoomMutation.isPending ? "Adding..." : "Add Room"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* ── Block Room Sheet ── */}
      <BlockRoomSheet
        open={blockOpen}
        onOpenChange={setBlockOpen}
        rooms={localData}
        prefillRoomId={blockRoomId || undefined}
        prefillStartDate={new Date()}
        prefillEndDate={new Date()}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: qk.rooms(orgId || "", hotelId) })}
      />
    </>
  );
}
