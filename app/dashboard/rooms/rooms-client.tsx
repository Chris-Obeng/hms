"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { parseISO } from "date-fns";
import {
  AlertDialog,
  Button,
  ButtonGroup,
  Card,
  Chip,
  Description,
  Dropdown,
  FieldError,
  Input,
  Label,
  Modal,
  SearchField,
  TextArea,
  TextField,
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
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { HeroSelectField } from "@/components/ui/hero-select";
import { ListEmpty } from "@/components/ui/list-card";
import { LIST_CARD } from "@/components/ui/list-styles";
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
import { RoomsTabs } from "./_components/rooms-tabs";
import { BlockRoomSheet } from "../calendar/_components/block-room-sheet";

type RoomStatus = "available" | "occupied" | "maintenance" | "out_of_service";

/** Status pill: a dot plus the label, so state never rests on colour alone. */
const STATUS_CONFIG: Record<RoomStatus, { label: string; dot: string; tint: string }> = {
  available: { label: "Available", dot: "bg-emerald-500", tint: "bg-emerald-500/10 text-emerald-800" },
  occupied: { label: "Occupied", dot: "bg-primary", tint: "bg-primary/10 text-primary" },
  maintenance: { label: "Maintenance", dot: "bg-amber-500", tint: "bg-amber-500/15 text-amber-900" },
  out_of_service: { label: "Out of service", dot: "bg-destructive", tint: "bg-danger/10 text-danger" },
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


  const typeOptions = optimisticRoomTypes.map((type) => ({ value: type.id, label: type.name }));
  const hasTypes = optimisticRoomTypes.length > 0;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pt-6 md:pt-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Rooms</h1>
        {canManageRooms && (
          <ButtonGroup variant="primary" className="rounded-xl">
            <Button
              onPress={() => (hasTypes ? openAddRoom() : setIsAddTypeOpen(true))}
              className="px-4 font-semibold max-md:h-11"
            >
              <Plus className="size-4" aria-hidden="true" />
              {hasTypes ? "Add room" : "New room type"}
            </Button>
            <Dropdown>
              <Button isIconOnly variant="primary" aria-label="More room actions" className="max-md:size-11">
                <ButtonGroup.Separator />
                <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
              <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                  aria-label="More room actions"
                  className="min-w-48"
                  onAction={(key) => {
                    if (key === "add-type") setIsAddTypeOpen(true);
                    if (key === "reorder") openReorder();
                  }}
                >
                  <Dropdown.Item id="add-type" textValue="New room type">
                    <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
                    <Label>New room type</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="reorder" textValue="Reorder room types" isDisabled={optimisticRoomTypes.length < 2}>
                    <ArrowUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
                    <Label>Reorder room types</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </ButtonGroup>
        )}
      </header>

      <RoomsTabs />

      {hasTypes && (
        <div className="flex flex-wrap items-center gap-3">
          <SearchField value={query} onChange={setQuery} aria-label="Search rooms" className="w-full min-w-0 sm:w-72">
            <SearchField.Group className="w-full rounded-xl max-md:h-11">
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Room number or type" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <p className="text-xs tabular-nums text-muted-foreground sm:ml-auto">
            {totalRooms} {totalRooms === 1 ? "room" : "rooms"} · {totalAvailable} available
          </p>
        </div>
      )}

      {!hasTypes ? (
        <Card className={LIST_CARD}>
          <ListEmpty
            icon={BedDouble}
            title="No room types yet"
            hint={canManageRooms ? undefined : "A manager can add room types."}
            action={
              canManageRooms ? (
                <Button variant="primary" onPress={() => setIsAddTypeOpen(true)} className="rounded-xl font-semibold max-md:h-11">
                  <Plus className="size-4" aria-hidden="true" />
                  New room type
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : visibleTypes.length === 0 ? (
        <Card className={LIST_CARD}>
          <ListEmpty
            icon={BedDouble}
            title={`No rooms match “${query.trim()}”`}
            action={
              <Button size="sm" variant="secondary" onPress={() => setQuery("")} className="rounded-xl max-md:h-11">
                Clear search
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {visibleTypes.map(({ type, rooms }) => (
            <TypeSection
              key={type.id}
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
              isHighlighted={(room) => isFiltering && room.roomNumber.toLowerCase().includes(normalizedQuery)}
            />
          ))}
        </div>
      )}

      {/* New room type */}
      <Modal.Backdrop
        isOpen={isAddTypeOpen}
        onOpenChange={(open) => {
          setIsAddTypeOpen(open);
          if (!open) setAddTypeErrors({});
        }}
      >
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="rounded-3xl sm:max-w-xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="text-lg font-semibold text-foreground">New room type</Modal.Heading>
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
                errors={addTypeErrors}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Add room */}
      <RoomFormModal
        isOpen={isAddRoomOpen}
        onOpenChange={setIsAddRoomOpen}
        title="Add room"
        onSubmit={handleCreateRoom}
        typeOptions={typeOptions}
        typeId={newRoomTypeId}
        onTypeId={setNewRoomTypeId}
        number={newRoomNumber}
        onNumber={(v) => {
          setNewRoomNumber(v);
          if (roomNumberError) setRoomNumberError("");
        }}
        numberError={roomNumberError}
        floor={newRoomFloor}
        onFloor={setNewRoomFloor}
        notes={newRoomNotes}
        onNotes={setNewRoomNotes}
        saving={isCreatingRoom}
        submitLabel="Add room"
        canSubmit={!!newRoomNumber.trim() && !!newRoomTypeId}
      />

      {/* Edit room */}
      <RoomFormModal
        isOpen={editingRoom !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRoom(null);
        }}
        title={`Room ${editingRoom?.roomNumber ?? ""}`}
        onSubmit={handleSaveRoomDetails}
        typeOptions={typeOptions}
        typeId={editRoomTypeId}
        onTypeId={setEditRoomTypeId}
        number={editRoomNumber}
        onNumber={(v) => {
          setEditRoomNumber(v);
          if (editRoomError) setEditRoomError("");
        }}
        numberError={editRoomError}
        floor={editRoomFloor}
        onFloor={setEditRoomFloor}
        notes={editRoomNotes}
        onNotes={setEditRoomNotes}
        saving={isSavingRoom}
        submitLabel="Save changes"
        canSubmit={!!editRoomNumber.trim() && !!editRoomTypeId}
      />

      {/* Room notes */}
      <Modal.Backdrop
        isOpen={notesRoom !== null}
        onOpenChange={(open) => {
          if (!open && !isSavingNotes) setNotesRoom(null);
        }}
      >
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog className="rounded-3xl sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="text-lg font-semibold text-foreground">Room {notesRoom?.roomNumber} notes</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextArea
                autoFocus
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Housekeeping or maintenance note"
                rows={4}
                aria-label="Room notes"
                className="w-full resize-none rounded-xl text-base sm:text-sm"
              />
            </Modal.Body>
            <Modal.Footer className="m-0 flex-col-reverse gap-2 sm:flex-row">
              <Button slot="close" variant="tertiary" isDisabled={isSavingNotes} className="rounded-xl max-md:h-11">
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={() => void handleSaveNotes()}
                isPending={isSavingNotes}
                className="rounded-xl font-semibold max-md:h-11"
              >
                Save notes
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Delete room type */}
      <AlertDialog.Backdrop
        isOpen={typeToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTypeToDelete(null);
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="rounded-3xl sm:max-w-sm">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading className="text-lg font-semibold text-foreground">
                Delete {typeToDelete?.name}?
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-muted-foreground">Its pricing rules are deleted too. This can&apos;t be undone.</p>
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row">
              <Button slot="close" variant="tertiary" autoFocus className="rounded-xl max-md:h-11">
                Keep it
              </Button>
              <Button variant="danger" onPress={handleDeleteType} className="rounded-xl font-semibold max-md:h-11">
                Delete
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      {/* Reorder room types */}
      <Modal.Backdrop
        isOpen={isReorderOpen}
        onOpenChange={(open) => {
          if (!open) setIsReorderOpen(false);
        }}
      >
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog className="rounded-3xl sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="text-lg font-semibold text-foreground">Reorder room types</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <ol className="divide-y divide-border/60 rounded-2xl border border-border/60">
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
                        "flex cursor-grab items-center gap-2 px-3 py-1 transition-[opacity,background-color] duration-150 first:rounded-t-2xl last:rounded-b-2xl active:cursor-grabbing",
                        reorderDragIndex === index && "opacity-40",
                        reorderOverIndex === index &&
                          reorderDragIndex !== null &&
                          reorderDragIndex !== index &&
                          "bg-primary/[0.06]"
                      )}
                    >
                      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{type.name}</span>
                      <Button
                        variant="ghost"
                        isIconOnly
                        size="sm"
                        aria-label={`Move ${type.name} up`}
                        isDisabled={index === 0}
                        onPress={() => moveReorderItem(index, -1)}
                        className="rounded-lg text-muted-foreground max-md:size-11"
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
                        className="rounded-lg text-muted-foreground max-md:size-11"
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            </Modal.Body>
            <Modal.Footer className="m-0 flex-col-reverse gap-2 sm:flex-row">
              <Button slot="close" variant="tertiary" className="rounded-xl max-md:h-11">
                Cancel
              </Button>
              <Button variant="primary" onPress={handleSaveReorder} isDisabled={!isReorderDirty} className="rounded-xl font-semibold max-md:h-11">
                Save order
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Block dates */}
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

/** Add and edit share one form: type, number, floor, notes. */
function RoomFormModal({
  isOpen,
  onOpenChange,
  title,
  onSubmit,
  typeOptions,
  typeId,
  onTypeId,
  number,
  onNumber,
  numberError,
  floor,
  onFloor,
  notes,
  onNotes,
  saving,
  submitLabel,
  canSubmit,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: (event: React.FormEvent) => void;
  typeOptions: { value: string; label: string }[];
  typeId: string;
  onTypeId: (value: string) => void;
  number: string;
  onNumber: (value: string) => void;
  numberError: string;
  floor: string;
  onFloor: (value: string) => void;
  notes: string;
  onNotes: (value: string) => void;
  saving: boolean;
  submitLabel: string;
  canSubmit: boolean;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog className="rounded-3xl sm:max-w-md">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading className="text-lg font-semibold text-foreground">{title}</Modal.Heading>
          </Modal.Header>
          <form onSubmit={onSubmit} className="flex flex-col">
            <Modal.Body className="flex flex-col gap-4">
              <HeroSelectField
                label="Room type"
                value={typeId}
                onValueChange={onTypeId}
                options={typeOptions}
                placeholder="Select room type"
                ariaLabel="Room type"
                triggerClassName="max-md:min-h-11"
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField value={number} onChange={onNumber} isInvalid={!!numberError} isRequired className="w-full">
                  <Label className="text-xs font-medium text-muted-foreground">Room number</Label>
                  <Input placeholder="101" className="rounded-xl max-md:h-11 max-md:text-base" />
                  <FieldError>{numberError}</FieldError>
                </TextField>
                <TextField value={floor} onChange={onFloor} className="w-full">
                  <Label className="text-xs font-medium text-muted-foreground">Floor</Label>
                  <Input placeholder="Optional" className="rounded-xl max-md:h-11 max-md:text-base" />
                </TextField>
              </div>
              <TextField value={notes} onChange={onNotes} className="w-full">
                <Label className="text-xs font-medium text-muted-foreground">Notes</Label>
                <TextArea rows={2} placeholder="Optional" className="resize-none rounded-xl text-base sm:text-sm" />
              </TextField>
            </Modal.Body>
            <Modal.Footer className="m-0 mt-4 flex-col-reverse gap-2 sm:flex-row">
              <Button slot="close" variant="tertiary" isDisabled={saving} className="rounded-xl max-md:h-11">
                Cancel
              </Button>
              <Button type="submit" variant="primary" isPending={saving} isDisabled={!canSubmit} className="rounded-xl font-semibold max-md:h-11">
                {submitLabel}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
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

/** One room as a tile: number and actions on top, who or what is in it, then its status. */
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
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;
  const inactive = room.isActive === false;
  const meta = [room.floor ? `Floor ${room.floor}` : null, inactive ? "Inactive" : null].filter(Boolean).join(" · ");
  const pill = (
    <>
      <span className={cn("size-2 shrink-0 rounded-full", config.dot)} aria-hidden="true" />
      <span className="min-w-0 truncate text-left text-xs font-medium sm:flex-1">{config.label}</span>
    </>
  );

  return (
    <li
      ref={registerRef}
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-2xl border border-border/60 bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-2 sm:gap-y-3",
        isHighlighted && "border-primary ring-2 ring-primary/30",
        inactive && "opacity-70"
      )}
    >
        <div className="order-1 min-w-0">
          <p className="truncate text-md font-semibold tabular-nums text-foreground">{room.roomNumber}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {room.stay ? (
              <>
                <span className="font-medium text-foreground">{room.stay.guestName}</span>
                {checkout ? ` · out ${checkout}` : null}
              </>
            ) : (
              [meta, room.notes].filter(Boolean).join(" · ") || "\u00a0"
            )}
          </p>
        </div>
        {hasRowActions && (
          <div className="order-3 sm:order-2">
          <Dropdown>
            <Button
              variant="ghost"
              isIconOnly
              size="sm"
              aria-label={`Actions for room ${room.roomNumber}`}
              className="shrink-0 rounded-lg text-muted-foreground max-md:size-11 sm:-mr-1 sm:-mt-1"
            >
              <EllipsisVertical className="size-4" />
            </Button>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu
                aria-label={`Actions for room ${room.roomNumber}`}
                onAction={(key) => {
                  if (key === "edit" && canManageRooms) onEditDetails();
                  if (key === "block" && canBlockRooms) onBlockDates();
                  if (key === "notes" && canManageRooms) onEditNotes();
                }}
              >
                {canManageRooms && (
                  <Dropdown.Item id="edit" textValue="Edit room">
                    <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
                    <Label>Edit room</Label>
                  </Dropdown.Item>
                )}
                {canBlockRooms && (
                  <Dropdown.Item id="block" textValue="Block dates">
                    <CalendarOff className="size-4 text-muted-foreground" aria-hidden="true" />
                    <Label>Block dates</Label>
                  </Dropdown.Item>
                )}
                {canManageRooms && (
                  <Dropdown.Item id="notes" textValue="Notes">
                    <NotebookPen className="size-4 text-muted-foreground" aria-hidden="true" />
                    <Label>Notes</Label>
                  </Dropdown.Item>
                )}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
          </div>
        )}

      {canEditStatus ? (
        <div className={cn("order-2 sm:order-3 sm:col-span-2", !hasRowActions && "col-span-2 justify-self-end sm:justify-self-stretch")}>
        <Dropdown>
          <Button
            variant="ghost"
            aria-label={`Status of room ${room.roomNumber}: ${config.label}. Change status`}
            className={cn("h-11 justify-start gap-2 rounded-xl px-3 sm:w-full md:h-8", config.tint)}
          >
            {pill}
            <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden="true" />
          </Button>
          <Dropdown.Popover placement="bottom start">
            <Dropdown.Menu aria-label={`Change status of room ${room.roomNumber}`} onAction={(key) => onStatusChange(key as RoomStatus)}>
              {transitions.map((nextStatus) => (
                <Dropdown.Item key={nextStatus} id={nextStatus} textValue={STATUS_CONFIG[nextStatus].label}>
                  <span className={cn("size-2 rounded-full", STATUS_CONFIG[nextStatus].dot)} aria-hidden="true" />
                  <Label>{STATUS_CONFIG[nextStatus].label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        </div>
      ) : (
        <span
          className={cn(
            "order-2 flex h-8 items-center gap-2 rounded-xl px-3 sm:order-3 sm:col-span-2",
            !hasRowActions && "col-span-2 justify-self-end sm:justify-self-stretch",
            config.tint
          )}
        >
          {pill}
        </span>
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
  const sleeps = (type.maxAdults ?? 0) + (type.maxChildren ?? 0);
  const facts = [type.bedConfiguration, sleeps ? `Sleeps ${sleeps}` : null].filter(Boolean).join(" · ");

  return (
    <Card className="gap-4 rounded-3xl border border-border/60 p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-6">
      <section aria-label={type.name} className="space-y-4">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex min-w-0 items-center gap-2 text-md font-semibold text-foreground">
              <span className="truncate">{type.name}</span>
              {type.isActive === false && (
                <Chip size="sm" variant="secondary" className="shrink-0">
                  Inactive
                </Chip>
              )}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground sm:hidden">{formatCurrency(type.basePrice, currency)} / night · </span>
              {facts ? <span className="hidden sm:inline">{facts} · </span> : null}
              <span className="tabular-nums">
                {type.availableRooms} of {type.rooms.length} available
              </span>
            </p>
          </div>
          <p className="hidden shrink-0 pt-1 text-sm font-semibold tabular-nums text-foreground sm:block">
            {formatCurrency(type.basePrice, currency)}
            <span className="font-normal text-muted-foreground"> / night</span>
          </p>
          {canManageRooms && (
            <TypeActionsDropdown
              type={type}
              canDelete={canDeleteRoomTypes}
              onEdit={onTypeEdit}
              onAddRoom={onAddRoom}
              onToggleActive={onTypeToggleActive}
              onDelete={onTypeDelete}
            />
          )}
        </header>

        {rooms.length === 0 ? (
          canManageRooms && !isFiltering ? (
            <Button
              variant="ghost"
              onPress={onAddRoom}
              className="h-20 w-full gap-2 rounded-2xl border border-dashed border-border text-sm font-medium text-muted-foreground"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add room
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{isFiltering ? "No matching rooms" : "No rooms yet"}</p>
          )
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
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
      </section>
    </Card>
  );
}

function TypeActionsDropdown({
  type,
  canDelete,
  onEdit,
  onAddRoom,
  onToggleActive,
  onDelete,
}: {
  type: RoomTypeGroup;
  canDelete: boolean;
  onEdit: () => void;
  onAddRoom: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const hasRooms = type.rooms.length > 0;

  return (
    <Dropdown>
      <Button variant="ghost" isIconOnly aria-label={`Actions for ${type.name}`} className="shrink-0 rounded-lg text-muted-foreground max-md:size-11">
        <EllipsisVertical className="size-4" />
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          aria-label={`Actions for ${type.name}`}
          className="min-w-52"
          onAction={(key) => {
            if (key === "edit") onEdit();
            if (key === "add-room") onAddRoom();
            if (key === "toggle-active") onToggleActive();
            if (key === "delete" && canDelete) onDelete();
          }}
        >
          <Dropdown.Item id="add-room" textValue="Add room">
            <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
            <Label>Add room</Label>
          </Dropdown.Item>
          <Dropdown.Item id="edit" textValue="Edit room type">
            <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
            <Label>Edit room type</Label>
          </Dropdown.Item>
          <Dropdown.Item id="toggle-active" textValue={type.isActive ? "Deactivate" : "Activate"}>
            <Power className="size-4 text-muted-foreground" aria-hidden="true" />
            <Label>{type.isActive ? "Deactivate" : "Activate"}</Label>
          </Dropdown.Item>
          {canDelete ? (
            <Dropdown.Item id="delete" textValue="Delete" variant="danger" isDisabled={hasRooms}>
              <Trash2 className="size-4" aria-hidden="true" />
              <div className="flex flex-col">
                <Label>Delete</Label>
                {hasRooms && <Description>Remove its rooms first</Description>}
              </div>
            </Dropdown.Item>
          ) : null}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
