"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { parseISO } from "date-fns";
import {
  AlertDialog,
  Button,
  Dropdown,
  Input,
  Modal,
  SearchField,
  TextArea,
  toast,
} from "@heroui/react";
import {
  ArrowUpDown,
  BedDouble,
  CalendarOff,
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  GripVertical,
  NotebookPen,
  Pencil,
  Plus,
  Power,
  Tag,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { HeroSelectField } from "@/components/ui/hero-select";
import { EmptyStatePanel, PageHeader } from "@/components/ui/page-header";
import {
  createRoom,
  createRoomType,
  deleteRoomType,
  reorderRoomTypes,
  toggleRoomTypeActive,
  updateRoom,
  updateRoomStatus,
} from "@/app/actions/rooms";
import { toAmenityObjects } from "@/lib/amenities";

import { RoomTypeForm, type RoomTypeFormValues } from "./_components/room-type-form";
import { BlockRoomSheet } from "../calendar/_components/block-room-sheet";

type RoomStatus = "available" | "occupied" | "maintenance" | "out_of_service";

const STATUS_CONFIG: Record<RoomStatus, { label: string; dot: string }> = {
  available: { label: "Available", dot: "bg-emerald-500" },
  occupied: { label: "Occupied", dot: "bg-[var(--pen-accent)]" },
  maintenance: { label: "Maintenance", dot: "bg-amber-500" },
  out_of_service: { label: "Out of service", dot: "bg-destructive" },
};

const STATUS_TRANSITIONS: Record<RoomStatus, RoomStatus[]> = {
  available: ["occupied", "maintenance", "out_of_service"],
  occupied: ["available", "maintenance"],
  maintenance: ["available", "out_of_service"],
  out_of_service: ["available", "maintenance"],
};

export interface RoomItem {
  id: string;
  roomNumber: string;
  floor: string | null;
  status: string | null;
  isActive: boolean | null;
  notes: string | null;
  stay: { guestName: string; checkOut: string } | null;
}

export interface RoomTypeGroup {
  id: string;
  name: string;
  bedConfiguration: string | null;
  maxAdults: number | null;
  maxChildren: number | null;
  basePrice: number;
  isActive: boolean | null;
  rooms: RoomItem[];
  availableRooms: number;
}

interface VisibleType {
  type: RoomTypeGroup;
  rooms: RoomItem[];
}

interface RoomsClientProps {
  roomTypes: RoomTypeGroup[];
  currency: string;
  hotelId: string;
  propertyToday?: string;
  canEditStatus?: boolean;
  canBlockRooms?: boolean;
  canManageRooms?: boolean;
  canDeleteRoomTypes?: boolean;
  initialSearch?: string;
}

type OptimisticRoomsAction =
  | { kind: "room_status"; roomId: string; status: RoomStatus }
  | { kind: "room_notes"; roomId: string; notes: string | null }
  | {
      kind: "room_details";
      roomId: string;
      toTypeId: string;
      roomNumber: string;
      floor: string | null;
      notes: string | null;
    }
  | { kind: "type_active"; typeId: string; isActive: boolean }
  | { kind: "type_delete"; typeId: string }
  | { kind: "reorder"; ids: string[] };

function recountAvailable(rooms: RoomItem[]): number {
  return rooms.filter((r) => r.isActive !== false && (r.status ?? "available") === "available")
    .length;
}

function applyOptimisticRooms(
  state: RoomTypeGroup[],
  action: OptimisticRoomsAction
): RoomTypeGroup[] {
  switch (action.kind) {
    case "room_status":
      return state.map((group) => {
        if (!group.rooms.some((r) => r.id === action.roomId)) return group;
        const rooms = group.rooms.map((r) =>
          r.id === action.roomId ? { ...r, status: action.status } : r
        );
        return { ...group, rooms, availableRooms: recountAvailable(rooms) };
      });
    case "room_notes":
      return state.map((group) =>
        group.rooms.some((r) => r.id === action.roomId)
          ? {
              ...group,
              rooms: group.rooms.map((r) =>
                r.id === action.roomId ? { ...r, notes: action.notes } : r
              ),
            }
          : group
      );
    case "room_details": {
      let movedRoom: RoomItem | null = null;
      const stripped = state.map((group) => {
        const found = group.rooms.find((r) => r.id === action.roomId);
        if (!found) return group;
        movedRoom = {
          ...found,
          roomNumber: action.roomNumber,
          floor: action.floor,
          notes: action.notes,
        };
        if (group.id === action.toTypeId) {
          const rooms = group.rooms.map((r) => (r.id === action.roomId ? movedRoom! : r));
          return { ...group, rooms, availableRooms: recountAvailable(rooms) };
        }
        const rooms = group.rooms.filter((r) => r.id !== action.roomId);
        return { ...group, rooms, availableRooms: recountAvailable(rooms) };
      });
      if (!movedRoom) return state;
      return stripped.map((group) => {
        if (group.id !== action.toTypeId || group.rooms.some((r) => r.id === action.roomId)) {
          return group;
        }
        const rooms = [...group.rooms, movedRoom!];
        return { ...group, rooms, availableRooms: recountAvailable(rooms) };
      });
    }
    case "type_active":
      return state.map((group) =>
        group.id === action.typeId ? { ...group, isActive: action.isActive } : group
      );
    case "type_delete":
      return state.filter((group) => group.id !== action.typeId);
    case "reorder": {
      const byId = new Map(state.map((g) => [g.id, g]));
      const ordered = action.ids
        .map((id) => byId.get(id))
        .filter((g): g is RoomTypeGroup => Boolean(g));
      return ordered.length === state.length ? ordered : state;
    }
  }
}

export function RoomsClient({
  roomTypes,
  currency,
  hotelId,
  propertyToday,
  canEditStatus = true,
  canBlockRooms = true,
  canManageRooms = true,
  canDeleteRoomTypes = true,
  initialSearch,
}: RoomsClientProps) {
  const router = useRouter();
  const supabase = React.useMemo(() => createBrowserClient(), []);
  const [, startTransition] = React.useTransition();
  const [optimisticRoomTypes, dispatchOptimistic] = React.useOptimistic(
    roomTypes,
    applyOptimisticRooms
  );

  const [query, setQuery] = React.useState(initialSearch ?? "");

  const [isAddTypeOpen, setIsAddTypeOpen] = React.useState(false);
  const [addTypeErrors, setAddTypeErrors] = React.useState<Record<string, string>>({});

  const [isAddRoomOpen, setIsAddRoomOpen] = React.useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = React.useState(false);
  const [newRoomTypeId, setNewRoomTypeId] = React.useState("");
  const [newRoomNumber, setNewRoomNumber] = React.useState("");
  const [newRoomFloor, setNewRoomFloor] = React.useState("");
  const [newRoomNotes, setNewRoomNotes] = React.useState("");
  const [roomNumberError, setRoomNumberError] = React.useState("");

  const [notesRoom, setNotesRoom] = React.useState<RoomItem | null>(null);
  const [notesDraft, setNotesDraft] = React.useState("");
  const [isSavingNotes, setIsSavingNotes] = React.useState(false);

  const [blockRoomId, setBlockRoomId] = React.useState<string | null>(null);

  const [editingRoom, setEditingRoom] = React.useState<RoomItem | null>(null);
  const [isSavingRoom, setIsSavingRoom] = React.useState(false);
  const [editRoomTypeId, setEditRoomTypeId] = React.useState("");
  const [editRoomNumber, setEditRoomNumber] = React.useState("");
  const [editRoomFloor, setEditRoomFloor] = React.useState("");
  const [editRoomNotes, setEditRoomNotes] = React.useState("");
  const [editRoomError, setEditRoomError] = React.useState("");

  const [isReorderOpen, setIsReorderOpen] = React.useState(false);
  const [reorderIds, setReorderIds] = React.useState<string[]>([]);
  const [reorderDragIndex, setReorderDragIndex] = React.useState<number | null>(null);
  const [reorderOverIndex, setReorderOverIndex] = React.useState<number | null>(null);

  const [typeToDelete, setTypeToDelete] = React.useState<RoomTypeGroup | null>(null);

  const totalRooms = React.useMemo(
    () => optimisticRoomTypes.reduce((sum, type) => sum + type.rooms.length, 0),
    [optimisticRoomTypes]
  );

  const totalAvailable = React.useMemo(
    () => optimisticRoomTypes.reduce((sum, type) => sum + type.availableRooms, 0),
    [optimisticRoomTypes]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0;

  const visibleTypes = React.useMemo<VisibleType[]>(() => {
    if (!isFiltering) {
      return optimisticRoomTypes.map((type) => ({ type, rooms: type.rooms }));
    }
    return optimisticRoomTypes
      .map((type) => {
        if (type.name.toLowerCase().includes(normalizedQuery)) {
          return { type, rooms: type.rooms };
        }
        return {
          type,
          rooms: type.rooms.filter((room) =>
            room.roomNumber.toLowerCase().includes(normalizedQuery)
          ),
        };
      })
      .filter(
        (entry) =>
          entry.rooms.length > 0 || entry.type.name.toLowerCase().includes(normalizedQuery)
      );
  }, [optimisticRoomTypes, normalizedQuery, isFiltering]);

  const blockSheetRooms = React.useMemo(
    () =>
      optimisticRoomTypes.flatMap((type) =>
        type.rooms.map((room) => ({
          id: room.id,
          roomNumber: room.roomNumber,
          roomTypeName: type.name,
        }))
      ),
    [optimisticRoomTypes]
  );

  React.useEffect(() => {
    const channel = supabase
      .channel("dashboard-rooms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `hotel_id=eq.${hotelId}` },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_types", filter: `hotel_id=eq.${hotelId}` },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, hotelId, router]);

  const rowRefs = React.useRef(new Map<string, HTMLLIElement>());
  const didScrollToMatch = React.useRef(false);
  React.useEffect(() => {
    if (didScrollToMatch.current || !initialSearch) return;
    const needle = initialSearch.trim().toLowerCase();
    const match = optimisticRoomTypes
      .flatMap((type) => type.rooms)
      .find((room) => room.roomNumber.toLowerCase().includes(needle));
    const element = match ? rowRefs.current.get(match.id) : undefined;
    if (!element) return;
    didScrollToMatch.current = true;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () =>
        element.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "center",
        }),
      250
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Optimistic Mutations -------------------------------------------------

  const handleStatusChange = (room: RoomItem, newStatus: RoomStatus) => {
    if (!canEditStatus || room.status === newStatus) return;
    startTransition(async () => {
      dispatchOptimistic({ kind: "room_status", roomId: room.id, status: newStatus });
      const result = await updateRoomStatus(room.id, newStatus);
      if (!result.success) {
        toast.danger("Couldn't update room status", { description: result.error });
        router.refresh();
        return;
      }
      router.refresh();
    });
  };

  const openNotesEditor = (room: RoomItem) => {
    setNotesRoom(room);
    setNotesDraft(room.notes ?? "");
  };

  const handleSaveNotes = () => {
    if (!notesRoom || isSavingNotes) return;
    const target = notesRoom;
    const cleaned = notesDraft.trim();
    setNotesRoom(null);
    setIsSavingNotes(true);
    startTransition(async () => {
      dispatchOptimistic({
        kind: "room_notes",
        roomId: target.id,
        notes: cleaned || null,
      });
      try {
        const result = await updateRoom(target.id, { notes: cleaned });
        if (!result.success) {
          toast.danger("Couldn't save notes", { description: result.error });
          router.refresh();
          return;
        }
        toast.success(`Notes saved for room ${target.roomNumber}`);
        router.refresh();
      } catch {
        toast.danger("Couldn't save notes — check your connection and try again");
        router.refresh();
      } finally {
        setIsSavingNotes(false);
      }
    });
  };

  const openAddRoom = (typeId?: string) => {
    setNewRoomNumber("");
    setNewRoomFloor("");
    setNewRoomNotes("");
    setRoomNumberError("");
    setNewRoomTypeId(typeId ?? optimisticRoomTypes[0]?.id ?? "");
    setIsAddRoomOpen(true);
  };

  const handleCreateRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newRoomNumber.trim()) {
      setRoomNumberError("Room number is required");
      return;
    }
    if (!newRoomTypeId) {
      toast.danger("Create a room type first");
      return;
    }
    setIsCreatingRoom(true);
    try {
      const payload: Parameters<typeof createRoom>[0] = {
        roomNumber: newRoomNumber.trim(),
        roomTypeId: newRoomTypeId,
        floor: newRoomFloor.trim(),
        notes: newRoomNotes.trim(),
        status: "available",
        isActive: true,
      };
      const result = await createRoom(payload);
      if (!result.success) {
        if (result.error.toLowerCase().includes("already exists")) {
          setRoomNumberError(result.error);
        } else {
          toast.danger("Failed to add room", { description: result.error });
        }
        return;
      }
      toast.success(`Room ${payload.roomNumber} added`);
      setIsAddRoomOpen(false);
      router.refresh();
    } catch {
      toast.danger("An unexpected error occurred");
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const openEditRoom = (room: RoomItem, typeId: string) => {
    setEditingRoom(room);
    setEditRoomTypeId(typeId);
    setEditRoomNumber(room.roomNumber);
    setEditRoomFloor(room.floor ?? "");
    setEditRoomNotes(room.notes ?? "");
    setEditRoomError("");
  };

  const handleSaveRoomDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingRoom || isSavingRoom) return;
    if (!editRoomNumber.trim()) {
      setEditRoomError("Room number is required");
      return;
    }
    if (!editRoomTypeId) {
      setEditRoomError("Select a room type");
      return;
    }
    const target = editingRoom;
    const nextNumber = editRoomNumber.trim();
    const nextFloor = editRoomFloor.trim();
    const nextNotes = editRoomNotes.trim();
    const nextTypeId = editRoomTypeId;

    setIsSavingRoom(true);
    setEditRoomError("");
    try {
      const result = await updateRoom(target.id, {
        roomTypeId: nextTypeId,
        roomNumber: nextNumber,
        floor: nextFloor,
        notes: nextNotes,
      });
      if (!result.success) {
        setEditRoomError(result.error);
        toast.danger("Couldn't update room", { description: result.error });
        return;
      }
      setEditingRoom(null);
      startTransition(() => {
        dispatchOptimistic({
          kind: "room_details",
          roomId: target.id,
          toTypeId: nextTypeId,
          roomNumber: nextNumber,
          floor: nextFloor || null,
          notes: nextNotes || null,
        });
        router.refresh();
      });
      toast.success(`Room ${nextNumber} updated`);
    } catch {
      toast.danger("Couldn't update room — check your connection and try again");
    } finally {
      setIsSavingRoom(false);
    }
  };

  const openReorder = () => {
    setReorderIds(optimisticRoomTypes.map((type) => type.id));
    setIsReorderOpen(true);
  };

  const moveReorderItem = (index: number, delta: -1 | 1) => {
    setReorderIds((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const item = prev[index];
      if (item === undefined) return prev;
      const next = [...prev];
      next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handleReorderDragStart = (index: number) => {
    requestAnimationFrame(() => {
      setReorderDragIndex(index);
    });
  };

  const handleReorderDrop = (targetIndex: number) => {
    if (reorderDragIndex === null || reorderDragIndex === targetIndex) return;
    setReorderIds((prev) => {
      const item = prev[reorderDragIndex];
      if (item === undefined) return prev;
      const next = [...prev];
      next.splice(reorderDragIndex, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
    setReorderDragIndex(null);
    setReorderOverIndex(null);
  };

  const isReorderDirty =
    reorderIds.length === optimisticRoomTypes.length &&
    reorderIds.some((id, index) => id !== optimisticRoomTypes[index]?.id);

  const handleSaveReorder = () => {
    if (!isReorderDirty) return;
    const ids = [...reorderIds];
    setIsReorderOpen(false);
    startTransition(async () => {
      dispatchOptimistic({ kind: "reorder", ids });
      const result = await reorderRoomTypes(ids);
      if (!result.success) {
        toast.danger("Couldn't save order", { description: result.error });
        router.refresh();
        return;
      }
      toast.success("Room type order updated");
      router.refresh();
    });
  };

  const handleAddType = async (values: RoomTypeFormValues) => {
    const result = await createRoomType({
      name: values.name,
      slug: values.slug,
      shortDescription: values.shortDescription,
      description: values.description,
      bedConfiguration: values.bedConfiguration,
      maxAdults: values.maxAdults,
      maxChildren: values.maxChildren,
      basePrice: Number(values.basePrice),
      weekendPrice: values.weekendPrice ? Number(values.weekendPrice) : undefined,
      amenities: toAmenityObjects(values.selectedAmenities),
      isActive: values.isActive,
    });

    if (result.success) {
      setAddTypeErrors({});
      setIsAddTypeOpen(false);
      toast.success("Room type created");
      router.push(`/dashboard/rooms/types/${result.id}?new=1`);
      return { success: true };
    }

    if ("fieldErrors" in result && result.fieldErrors) {
      const fieldErrors: Record<string, string> = {};
      for (const [key, messages] of Object.entries(result.fieldErrors)) {
        if (messages[0]) fieldErrors[key] = messages[0];
      }
      setAddTypeErrors(fieldErrors);
    }
    toast.danger("Failed to create room type", { description: result.error });
    return { success: false, error: result.error };
  };

  const handleToggleTypeActive = (type: RoomTypeGroup) => {
    const nextActive = !type.isActive;
    startTransition(async () => {
      dispatchOptimistic({ kind: "type_active", typeId: type.id, isActive: nextActive });
      const result = await toggleRoomTypeActive(type.id, nextActive);
      if (!result.success) {
        toast.danger("Failed to update status", { description: result.error });
        router.refresh();
        return;
      }
      toast.success(`${type.name} ${nextActive ? "activated" : "deactivated"}`);
      router.refresh();
    });
  };

  const handleDeleteType = () => {
    if (!typeToDelete) return;
    const target = typeToDelete;
    setTypeToDelete(null);
    startTransition(async () => {
      dispatchOptimistic({ kind: "type_delete", typeId: target.id });
      const result = await deleteRoomType(target.id);
      if (!result.success) {
        toast.danger("Failed to delete room type", { description: result.error });
        router.refresh();
        return;
      }
      toast.success(`${target.name} removed`);
      router.refresh();
    });
  };

  const modalInputCn =
    "h-11 rounded-xl border-border/70 bg-background text-base sm:h-10 sm:text-sm";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 pt-1 md:space-y-5">
      <PageHeader
        title="Rooms"
        subtitle={`${optimisticRoomTypes.length} ${optimisticRoomTypes.length === 1 ? "type" : "types"} · ${totalRooms} ${totalRooms === 1 ? "room" : "rooms"} · ${totalAvailable} available`}
        actions={
          <>
            {canManageRooms && optimisticRoomTypes.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onPress={() => openAddRoom()}
                className="ui-press h-11 gap-1.5 rounded-xl px-3.5 text-xs font-semibold shadow-2xs sm:h-9"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add room
              </Button>
            )}
            <Dropdown>
              <Button
                variant="outline"
                size="sm"
                aria-label="Room type actions"
                className="ui-press h-11 min-w-11 gap-1.5 rounded-xl px-3 text-xs font-semibold sm:h-9 sm:min-w-0"
              >
                <span className="hidden sm:inline">Room types</span>
                <EllipsisVertical className="size-4 sm:hidden" />
                <ChevronDown className="hidden size-3.5 text-muted-foreground sm:inline" />
              </Button>
              <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                  onAction={(key) => {
                    if (key === "add-type" && canManageRooms) setIsAddTypeOpen(true);
                    if (key === "reorder" && canManageRooms) openReorder();
                    if (key === "pricing") router.push("/dashboard/rooms/pricing?tab=seasons");
                  }}
                >
                  {canManageRooms && (
                    <Dropdown.Item id="add-type" textValue="New room type">
                      <Plus className="size-4 text-muted-foreground" />
                      <span>New room type</span>
                    </Dropdown.Item>
                  )}
                  {canManageRooms && optimisticRoomTypes.length > 1 && (
                    <Dropdown.Item id="reorder" textValue="Reorder room types">
                      <ArrowUpDown className="size-4 text-muted-foreground" />
                      <span>Reorder room types</span>
                    </Dropdown.Item>
                  )}
                  <Dropdown.Item id="pricing" textValue="Seasonal rates">
                    <Tag className="size-4 text-muted-foreground" />
                    <span>Seasonal rates</span>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </>
        }
      />

      {/* Search toolbar */}
      {optimisticRoomTypes.length > 0 && (
        <div className="flex items-center gap-3">
          <SearchField
            value={query}
            onChange={setQuery}
            aria-label="Search rooms"
            className="w-full sm:max-w-sm"
          >
            <SearchField.Group className="h-11 rounded-xl border-border/70 bg-card sm:h-9">
              <SearchField.SearchIcon className="size-3.5 text-muted-foreground/70" />
              <SearchField.Input
                placeholder="Search room number or type…"
                className="text-base sm:text-[13px]"
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </div>
      )}

      {/* Body — single responsive DOM tree */}
      {optimisticRoomTypes.length === 0 ? (
        <div className="rounded-[20px] border border-border/60 bg-card">
          <EmptyStatePanel
            icon={BedDouble}
            title="No room types yet"
            description={
              canManageRooms
                ? "Create a room type first, then add individual room numbers."
                : "A manager or super admin can configure room types for this property."
            }
            action={
              canManageRooms ? (
                <Button
                  variant="primary"
                  size="sm"
                  onPress={() => setIsAddTypeOpen(true)}
                  className="ui-press rounded-xl text-xs font-semibold"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  New room type
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : visibleTypes.length === 0 ? (
        <div className="rounded-[20px] border border-border/60 bg-card">
          <EmptyStatePanel
            icon={BedDouble}
            title={`No matches for “${query.trim()}”`}
            action={
              <Button
                variant="outline"
                size="sm"
                onPress={() => setQuery("")}
                className="ui-press rounded-xl text-xs font-semibold"
              >
                Clear search
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:gap-0 lg:overflow-hidden lg:rounded-[20px] lg:border lg:border-border/60 lg:bg-card lg:shadow-[0_1px_3px_rgb(0_0_0/0.04)]">
          {visibleTypes.map(({ type, rooms }) => (
            <div
              key={type.id}
              className="max-lg:overflow-hidden max-lg:rounded-[20px] max-lg:border max-lg:border-border/60 max-lg:bg-card max-lg:shadow-[0_1px_3px_rgb(0_0_0/0.04)] lg:border-b lg:border-border/60 lg:last:border-b-0"
            >
              <TypeSection
                type={type}
                rooms={rooms}
                isFiltering={isFiltering}
                currency={currency}
                canEditStatus={canEditStatus}
                canBlockRooms={canBlockRooms}
                canManageRooms={canManageRooms}
                canDeleteRoomTypes={canDeleteRoomTypes}
                registerRef={rowRefs}
                onTypeEdit={() => router.push("/dashboard/rooms/types/" + type.id)}
                onTypeToggleActive={() => handleToggleTypeActive(type)}
                onTypeDelete={() => setTypeToDelete(type)}
                onAddRoom={() => openAddRoom(type.id)}
                onStatusChange={handleStatusChange}
                onBlockDates={(id) => setBlockRoomId(id)}
                onEditNotes={openNotesEditor}
                onEditDetails={openEditRoom}
                isHighlighted={(room) =>
                  isFiltering && room.roomNumber.toLowerCase().includes(normalizedQuery)
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* Add Room Type Modal */}
      <Modal.Backdrop
        isOpen={isAddTypeOpen}
        onOpenChange={(open) => {
          setIsAddTypeOpen(open);
          if (!open) setAddTypeErrors({});
        }}
      >
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="sm:max-w-xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>New room type</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <RoomTypeForm
                isModal
                currency={currency}
                onSubmit={handleAddType}
                onCancel={() => setIsAddTypeOpen(false)}
                submitLabel="Create room type"
                submittingLabel="Creating…"
                title="New room type"
                subtitle="Photos can be added on the next screen."
                errors={addTypeErrors}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Add Room Modal */}
      <Modal.Backdrop isOpen={isAddRoomOpen} onOpenChange={setIsAddRoomOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Add room</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <form onSubmit={handleCreateRoom} className="flex flex-col gap-4">
                <HeroSelectField
                  label="Room type"
                  value={newRoomTypeId}
                  onValueChange={setNewRoomTypeId}
                  options={optimisticRoomTypes.map((type) => ({
                    value: type.id,
                    label: type.name,
                  }))}
                  placeholder="Select room type"
                  ariaLabel="Room type"
                />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new-room-number" className="text-xs font-medium text-muted-foreground">
                    Room number
                  </label>
                  <Input
                    id="new-room-number"
                    value={newRoomNumber}
                    onChange={(e) => {
                      setNewRoomNumber(e.target.value);
                      if (roomNumberError) setRoomNumberError("");
                    }}
                    placeholder="e.g. 101"
                    aria-invalid={!!roomNumberError}
                    aria-describedby={roomNumberError ? "new-room-number-error" : undefined}
                    className={modalInputCn}
                  />
                  {roomNumberError && (
                    <p id="new-room-number-error" className="text-xs text-destructive">
                      {roomNumberError}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new-room-floor" className="text-xs font-medium text-muted-foreground">
                    Floor <span className="font-normal text-muted-foreground/70">(optional)</span>
                  </label>
                  <Input
                    id="new-room-floor"
                    value={newRoomFloor}
                    onChange={(e) => setNewRoomFloor(e.target.value)}
                    placeholder="e.g. 1"
                    className={modalInputCn}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new-room-notes" className="text-xs font-medium text-muted-foreground">
                    Notes <span className="font-normal text-muted-foreground/70">(optional)</span>
                  </label>
                  <TextArea
                    id="new-room-notes"
                    value={newRoomNotes}
                    onChange={(e) => setNewRoomNotes(e.target.value)}
                    placeholder="Housekeeping or room note…"
                    rows={2}
                    className="rounded-xl border-border/70 bg-background text-base sm:text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" slot="close" className="ui-press rounded-xl">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isPending={isCreatingRoom}
                    isDisabled={isCreatingRoom || !newRoomNumber.trim() || !newRoomTypeId}
                    className="ui-press rounded-xl"
                  >
                    {isCreatingRoom ? "Adding…" : "Add room"}
                  </Button>
                </div>
              </form>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Edit Room Details Modal */}
      <Modal.Backdrop
        isOpen={editingRoom !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRoom(null);
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Edit room {editingRoom?.roomNumber}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <form onSubmit={handleSaveRoomDetails} className="flex flex-col gap-4">
                <HeroSelectField
                  label="Room type"
                  value={editRoomTypeId}
                  onValueChange={setEditRoomTypeId}
                  options={optimisticRoomTypes.map((type) => ({
                    value: type.id,
                    label: type.name,
                  }))}
                  placeholder="Select room type"
                  ariaLabel="Room type"
                />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="edit-room-number" className="text-xs font-medium text-muted-foreground">
                    Room number
                  </label>
                  <Input
                    id="edit-room-number"
                    value={editRoomNumber}
                    onChange={(e) => {
                      setEditRoomNumber(e.target.value);
                      if (editRoomError) setEditRoomError("");
                    }}
                    placeholder="e.g. 101"
                    aria-invalid={!!editRoomError}
                    className={modalInputCn}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="edit-room-floor" className="text-xs font-medium text-muted-foreground">
                    Floor <span className="font-normal text-muted-foreground/70">(optional)</span>
                  </label>
                  <Input
                    id="edit-room-floor"
                    value={editRoomFloor}
                    onChange={(e) => setEditRoomFloor(e.target.value)}
                    placeholder="e.g. 1"
                    className={modalInputCn}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="edit-room-notes" className="text-xs font-medium text-muted-foreground">
                    Notes <span className="font-normal text-muted-foreground/70">(optional)</span>
                  </label>
                  <TextArea
                    id="edit-room-notes"
                    value={editRoomNotes}
                    onChange={(e) => setEditRoomNotes(e.target.value)}
                    placeholder="Housekeeping or room note…"
                    rows={2}
                    className="rounded-xl border-border/70 bg-background text-base sm:text-sm"
                  />
                </div>
                {editRoomError && <p className="text-xs text-destructive">{editRoomError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    slot="close"
                    isDisabled={isSavingRoom}
                    className="ui-press rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isPending={isSavingRoom}
                    isDisabled={isSavingRoom || !editRoomNumber.trim() || !editRoomTypeId}
                    className="ui-press rounded-xl"
                  >
                    {isSavingRoom ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Edit Notes Modal */}
      <Modal.Backdrop
        isOpen={notesRoom !== null}
        onOpenChange={(open) => {
          if (!open && !isSavingNotes) setNotesRoom(null);
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Room {notesRoom?.roomNumber} notes</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextArea
                autoFocus
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Housekeeping or maintenance note…"
                rows={4}
                aria-label="Room notes"
                className="rounded-xl border-border/70 bg-background text-base sm:text-sm"
              />
            </Modal.Body>
            <Modal.Footer>
              <Button
                type="button"
                variant="outline"
                slot="close"
                isDisabled={isSavingNotes}
                className="ui-press rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onPress={() => void handleSaveNotes()}
                isPending={isSavingNotes}
                isDisabled={isSavingNotes}
                className="ui-press rounded-xl"
              >
                {isSavingNotes ? "Saving…" : "Save notes"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Delete Room Type Confirmation */}
      <AlertDialog.Backdrop
        variant="blur"
        isOpen={typeToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTypeToDelete(null);
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="rounded-[24px] border border-border/70 bg-card p-6 shadow-2xl sm:max-w-[380px]">
            <AlertDialog.Header>
              <AlertDialog.Heading className="text-base font-semibold text-foreground">
                Delete {typeToDelete?.name}?
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="py-2 text-[13px] text-muted-foreground">
              <p>This permanently deletes the room type and its pricing rules.</p>
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex justify-end gap-2 pt-3">
              <Button slot="close" variant="outline" className="ui-press rounded-xl">
                Cancel
              </Button>
              <Button variant="danger" onPress={handleDeleteType} className="ui-press rounded-xl">
                Delete
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      {/* Reorder Room Types Modal */}
      <Modal.Backdrop
        isOpen={isReorderOpen}
        onOpenChange={(open) => {
          if (!open) setIsReorderOpen(false);
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Reorder room types</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <ol className="flex flex-col gap-2">
                {reorderIds.map((id, index) => {
                  const type = optimisticRoomTypes.find((entry) => entry.id === id);
                  if (!type) return null;
                  return (
                    <li
                      key={id}
                      draggable
                      onDragStart={() => handleReorderDragStart(index)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setReorderOverIndex(index);
                      }}
                      onDrop={() => handleReorderDrop(index)}
                      onDragEnd={() => {
                        setReorderDragIndex(null);
                        setReorderOverIndex(null);
                      }}
                      className={cn(
                        "flex cursor-grab items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 transition-[border-color,opacity,background-color] duration-150 active:cursor-grabbing",
                        reorderDragIndex === index && "opacity-40",
                        reorderOverIndex === index &&
                          reorderDragIndex !== null &&
                          reorderDragIndex !== index &&
                          "border-primary bg-muted/40 ring-2 ring-primary/20"
                      )}
                    >
                      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="w-6 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {type.name}
                      </span>
                      <Button
                        variant="ghost"
                        isIconOnly
                        size="sm"
                        aria-label={`Move ${type.name} up`}
                        isDisabled={index === 0}
                        onPress={() => moveReorderItem(index, -1)}
                        className="ui-press size-9 min-w-9 rounded-lg text-muted-foreground"
                      >
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        isIconOnly
                        size="sm"
                        aria-label={`Move ${type.name} down`}
                        isDisabled={index === reorderIds.length - 1}
                        onPress={() => moveReorderItem(index, 1)}
                        className="ui-press size-9 min-w-9 rounded-lg text-muted-foreground"
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" variant="outline" slot="close" className="ui-press rounded-xl">
                Cancel
              </Button>
              <Button
                onPress={handleSaveReorder}
                isDisabled={!isReorderDirty}
                className="ui-press rounded-xl"
              >
                Save order
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Block Dates Sheet */}
      <BlockRoomSheet
        open={blockRoomId !== null}
        onOpenChange={(open) => {
          if (!open) setBlockRoomId(null);
        }}
        rooms={blockSheetRooms}
        prefillRoomId={blockRoomId ?? undefined}
        minDate={propertyToday ? parseISO(propertyToday) : undefined}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}

interface RoomRowProps {
  room: RoomItem;
  isHighlighted: boolean;
  canEditStatus: boolean;
  canBlockRooms: boolean;
  canManageRooms: boolean;
  registerRef: (element: HTMLLIElement | null) => void;
  onStatusChange: (status: RoomStatus) => void;
  onBlockDates: () => void;
  onEditNotes: () => void;
  onEditDetails: () => void;
}

function RoomRow({
  room,
  isHighlighted,
  canEditStatus,
  canBlockRooms,
  canManageRooms,
  registerRef,
  onStatusChange,
  onBlockDates,
  onEditNotes,
  onEditDetails,
}: RoomRowProps) {
  const status = (room.status ?? "available") as RoomStatus;
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.available;
  const transitions = STATUS_TRANSITIONS[status] ?? [];
  const hasRowActions = canManageRooms || canBlockRooms;
  const checkout = room.stay?.checkOut
    ? new Date(`${room.stay.checkOut}T00:00:00Z`).toLocaleDateString("en", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  return (
    <li
      ref={registerRef}
      className={cn(
        "flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-b-0 transition-colors duration-150 sm:px-5 sm:py-3",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/20",
        isHighlighted && "bg-[#0485F70A]"
      )}
    >
      <span className="w-12 shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">
        {room.roomNumber}
      </span>

      {room.floor && (
        <span className="hidden w-16 shrink-0 text-xs text-muted-foreground sm:inline">
          Floor {room.floor}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-muted-foreground">
          {room.floor && <span className="sm:hidden">Floor {room.floor} · </span>}
          {room.isActive === false && <span className="text-muted-foreground/70">Inactive · </span>}
          {room.stay ? (
            <span>
              <span className="font-medium text-foreground">{room.stay.guestName}</span>
              {checkout ? <span> · out {checkout}</span> : null}
            </span>
          ) : (
            room.notes || null
          )}
        </div>
      </div>

      {canEditStatus ? (
        <Dropdown>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Change status of room ${room.roomNumber}`}
            className="ui-press h-11 shrink-0 gap-1.5 rounded-lg px-2.5 sm:h-9"
          >
            <span className={cn("size-2 shrink-0 rounded-full", config.dot)} aria-hidden="true" />
            <span className="text-xs font-medium text-foreground">{config.label}</span>
            <ChevronDown className="size-3 text-muted-foreground/70" aria-hidden="true" />
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu onAction={(key) => onStatusChange(key as RoomStatus)}>
              {transitions.map((nextStatus) => (
                <Dropdown.Item
                  key={nextStatus}
                  id={nextStatus}
                  textValue={STATUS_CONFIG[nextStatus].label}
                >
                  <span
                    className={cn("size-2 rounded-full", STATUS_CONFIG[nextStatus].dot)}
                    aria-hidden="true"
                  />
                  <span>{STATUS_CONFIG[nextStatus].label}</span>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      ) : (
        <span className="inline-flex h-9 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium text-foreground">
          <span className={cn("size-2 shrink-0 rounded-full", config.dot)} aria-hidden="true" />
          {config.label}
        </span>
      )}

      {hasRowActions && (
        <Dropdown>
          <Button
            variant="ghost"
            isIconOnly
            aria-label={`Actions for room ${room.roomNumber}`}
            className="ui-press size-11 min-w-11 shrink-0 rounded-lg text-muted-foreground sm:size-9 sm:min-w-9"
          >
            <EllipsisVertical className="size-4" />
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              onAction={(key) => {
                if (key === "edit" && canManageRooms) onEditDetails();
                if (key === "block" && canBlockRooms) onBlockDates();
                if (key === "notes" && canManageRooms) onEditNotes();
              }}
            >
              {canManageRooms && (
                <Dropdown.Item id="edit" textValue="Edit details">
                  <Pencil className="size-4 text-muted-foreground" />
                  <span>Edit details</span>
                </Dropdown.Item>
              )}
              {canBlockRooms && (
                <Dropdown.Item id="block" textValue="Block dates">
                  <CalendarOff className="size-4 text-muted-foreground" />
                  <span>Block dates</span>
                </Dropdown.Item>
              )}
              {canManageRooms && (
                <Dropdown.Item id="notes" textValue="Edit notes">
                  <NotebookPen className="size-4 text-muted-foreground" />
                  <span>Edit notes</span>
                </Dropdown.Item>
              )}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      )}
    </li>
  );
}

interface TypeSectionProps {
  type: RoomTypeGroup;
  rooms: RoomItem[];
  isFiltering: boolean;
  currency: string;
  canEditStatus: boolean;
  canBlockRooms: boolean;
  canManageRooms: boolean;
  canDeleteRoomTypes: boolean;
  registerRef: React.RefObject<Map<string, HTMLLIElement>>;
  onTypeEdit: () => void;
  onTypeToggleActive: () => void;
  onTypeDelete: () => void;
  onAddRoom: () => void;
  onStatusChange: (room: RoomItem, status: RoomStatus) => void;
  onBlockDates: (id: string) => void;
  onEditNotes: (room: RoomItem) => void;
  onEditDetails: (room: RoomItem, typeId: string) => void;
  isHighlighted: (room: RoomItem) => boolean;
}

function TypeSection({
  type,
  rooms,
  isFiltering,
  currency,
  canEditStatus,
  canBlockRooms,
  canManageRooms,
  canDeleteRoomTypes,
  registerRef,
  onTypeEdit,
  onTypeToggleActive,
  onTypeDelete,
  onAddRoom,
  onStatusChange,
  onBlockDates,
  onEditNotes,
  onEditDetails,
  isHighlighted,
}: TypeSectionProps) {
  const facts = [
    type.bedConfiguration,
    type.maxAdults || type.maxChildren
      ? `Sleeps ${(type.maxAdults ?? 0) + (type.maxChildren ?? 0)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="border-b border-border/60 bg-secondary/70 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="truncate text-[14px] font-semibold text-foreground sm:text-[15px]">
            {type.name}
          </span>
          {type.isActive === false && (
            <span className="shrink-0 rounded-md border border-border/70 bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              Inactive
            </span>
          )}
          <span className="min-w-0 flex-1" aria-hidden="true" />
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground sm:text-sm">
            {formatCurrency(type.basePrice, currency)}
          </span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">/ night</span>
          {canManageRooms && (
            <TypeActionsDropdown
              type={type}
              canDelete={canDeleteRoomTypes}
              onEdit={onTypeEdit}
              onToggleActive={onTypeToggleActive}
              onDelete={onTypeDelete}
            />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="truncate">{facts}</span>
          <span className="min-w-0 flex-1" aria-hidden="true" />
          <span className="shrink-0 font-mono text-[11px] tabular-nums">
            {rooms.length} {rooms.length === 1 ? "room" : "rooms"} · {type.availableRooms} available
          </span>
        </div>
      </div>

      {rooms.length === 0 ? (
        <p className="px-4 py-5 text-xs text-muted-foreground sm:px-5">
          {isFiltering ? "No matching rooms in this type." : "No rooms added yet."}
        </p>
      ) : (
        <ul>
          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              isHighlighted={isHighlighted(room)}
              canEditStatus={canEditStatus}
              canBlockRooms={canBlockRooms}
              canManageRooms={canManageRooms}
              registerRef={(element) => {
                if (element) registerRef.current.set(room.id, element);
                else registerRef.current.delete(room.id);
              }}
              onStatusChange={(status) => onStatusChange(room, status)}
              onBlockDates={() => onBlockDates(room.id)}
              onEditNotes={() => onEditNotes(room)}
              onEditDetails={() => onEditDetails(room, type.id)}
            />
          ))}
        </ul>
      )}

      {canManageRooms && !isFiltering && (
        <button
          type="button"
          onClick={onAddRoom}
          className="ui-press flex min-h-11 w-full cursor-pointer items-center gap-1.5 border-t border-border/50 px-4 py-2.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-10 sm:px-5 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/20 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add room
        </button>
      )}
    </>
  );
}

interface TypeActionsDropdownProps {
  type: RoomTypeGroup;
  canDelete: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function TypeActionsDropdown({
  type,
  canDelete,
  onEdit,
  onToggleActive,
  onDelete,
}: TypeActionsDropdownProps) {
  const hasRooms = type.rooms.length > 0;

  return (
    <Dropdown>
      <Button
        variant="ghost"
        isIconOnly
        aria-label={`Actions for ${type.name}`}
        className="ui-press size-11 min-w-11 rounded-lg text-muted-foreground sm:size-9 sm:min-w-9"
      >
        <EllipsisVertical className="size-4" />
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          onAction={(key) => {
            if (key === "edit") onEdit();
            if (key === "toggle-active") onToggleActive();
            if (key === "delete" && canDelete) onDelete();
          }}
        >
          <Dropdown.Item id="edit" textValue="Edit details">
            <Pencil className="size-4 text-muted-foreground" />
            <span>Edit details</span>
          </Dropdown.Item>
          <Dropdown.Item
            id="toggle-active"
            textValue={type.isActive ? "Deactivate" : "Activate"}
          >
            <Power className="size-4 text-muted-foreground" />
            <span>{type.isActive ? "Deactivate" : "Activate"}</span>
          </Dropdown.Item>
          {canDelete && (
            <Dropdown.Item
              id="delete"
              textValue="Delete"
              isDisabled={hasRooms}
              className="text-danger"
            >
              <Trash2 className="size-4" />
              <span>{hasRooms ? "Delete (remove rooms first)" : "Delete"}</span>
            </Dropdown.Item>
          )}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
