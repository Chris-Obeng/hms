"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { writeAuditLog } from "@/lib/audit";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { HeroSelectField } from "@/components/ui/hero-select";
import {
  createRoom,
  createRoomType,
  deleteRoomType,
  reorderRoomTypes,
  toggleRoomTypeActive,
  updateRoom,
} from "@/app/actions/rooms";
import { toAmenityObjects } from "@/lib/amenities";

import { RoomTypeForm, type RoomTypeFormValues } from "./_components/room-type-form";
import { BlockRoomSheet } from "../calendar/_components/block-room-sheet";

type RoomStatus = "available" | "occupied" | "maintenance" | "out_of_service";

const STATUS_CONFIG: Record<RoomStatus, { label: string; dot: string }> = {
  available: { label: "Available", dot: "bg-[var(--success)]" },
  occupied: { label: "Occupied", dot: "bg-[var(--pen-accent)]" },
  maintenance: { label: "Maintenance", dot: "bg-orange-500" },
  out_of_service: { label: "Out of Service", dot: "bg-[var(--danger)]" },
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
  /** The in-house guest on an occupied room, from the bookings join. */
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
  initialSearch?: string;
}

export function RoomsClient({ roomTypes, currency, hotelId, initialSearch }: RoomsClientProps) {
  const router = useRouter();
  const supabase = React.useMemo(() => createBrowserClient(), []);

  // Deep link support: /dashboard/rooms?search=<room_number> seeds the filter,
  // which expands the matching type and highlights the matching room.
  const [query, setQuery] = React.useState(initialSearch ?? "");
  const [pendingRoomId, setPendingRoomId] = React.useState<string | null>(null);
  const [pendingTypeId, setPendingTypeId] = React.useState<string | null>(null);

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
  const [isSavingReorder, setIsSavingReorder] = React.useState(false);
  const [reorderDragIndex, setReorderDragIndex] = React.useState<number | null>(null);
  const [reorderOverIndex, setReorderOverIndex] = React.useState<number | null>(null);

  const [typeToDelete, setTypeToDelete] = React.useState<RoomTypeGroup | null>(null);
  const [isDeletingType, setIsDeletingType] = React.useState(false);

  // --- Derived data ---------------------------------------------------------

  const totalRooms = React.useMemo(
    () => roomTypes.reduce((sum, type) => sum + type.rooms.length, 0),
    [roomTypes],
  );

  const totalAvailable = React.useMemo(
    () => roomTypes.reduce((sum, type) => sum + type.availableRooms, 0),
    [roomTypes],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0;

  const visibleTypes = React.useMemo<VisibleType[]>(() => {
    if (!isFiltering) {
      return roomTypes.map((type) => ({ type, rooms: type.rooms }));
    }
    return roomTypes
      .map((type) => {
        if (type.name.toLowerCase().includes(normalizedQuery)) {
          return { type, rooms: type.rooms };
        }
        return {
          type,
          rooms: type.rooms.filter((room) =>
            room.roomNumber.toLowerCase().includes(normalizedQuery),
          ),
        };
      })
      .filter(
        (entry) =>
          entry.rooms.length > 0 || entry.type.name.toLowerCase().includes(normalizedQuery),
      );
  }, [roomTypes, normalizedQuery, isFiltering]);

  // Every type stays expanded; the design shows one flat panel.

  const blockSheetRooms = React.useMemo(
    () =>
      roomTypes.flatMap((type) =>
        type.rooms.map((room) => ({
          id: room.id,
          roomNumber: room.roomNumber,
          roomTypeName: type.name,
        })),
      ),
    [roomTypes],
  );

  // --- Effects --------------------------------------------------------------

  // Other tabs / staff devices: re-pull server data when rooms or types change.
  React.useEffect(() => {
    const channel = supabase
      .channel("dashboard-rooms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `hotel_id=eq.${hotelId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_types", filter: `hotel_id=eq.${hotelId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, hotelId, router]);

  // Scroll the deep-linked room into view once, after the panel has expanded.
  const rowRefs = React.useRef(new Map<string, HTMLLIElement>());
  const didScrollToMatch = React.useRef(false);
  React.useEffect(() => {
    if (didScrollToMatch.current || !initialSearch) return;
    const needle = initialSearch.trim().toLowerCase();
    const match = roomTypes
      .flatMap((type) => type.rooms)
      .find((room) => room.roomNumber.toLowerCase().includes(needle));
    const element = match ? rowRefs.current.get(match.id) : undefined;
    if (!element) return;
    didScrollToMatch.current = true;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () =>
        element.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "center",
        }),
      350,
    );
    return () => window.clearTimeout(timer);
    // Mount-only deep-link scroll; roomTypes/initialSearch are fixed at first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Mutations (all via existing server actions) --------------------------

  const handleStatusChange = async (room: RoomItem, newStatus: RoomStatus) => {
    if (room.status === newStatus) return;
    const previousStatus = room.status ?? "available";
    setPendingRoomId(room.id);
    try {
      const result = await updateRoom(room.id, { status: newStatus });
      if (!result.success) {
        toast.danger("Couldn't update room status", { description: result.error });
        return;
      }
      toast.success(
        `Room ${room.roomNumber} marked as ${STATUS_CONFIG[newStatus].label.toLowerCase()}`,
      );
      void writeAuditLog(supabase, {
        hotelId,
        action: "room.status_changed",
        entityType: "room",
        entityId: room.id,
        beforeState: { status: previousStatus },
        afterState: { status: newStatus },
      });
    } finally {
      setPendingRoomId(null);
    }
  };

  const openNotesEditor = (room: RoomItem) => {
    setNotesRoom(room);
    setNotesDraft(room.notes ?? "");
  };

  const handleSaveNotes = async () => {
    if (!notesRoom) return;
    setIsSavingNotes(true);
    try {
      // Empty string clears the note server-side (updateRoom stores `"" || null`).
      const result = await updateRoom(notesRoom.id, { notes: notesDraft.trim() });
      if (!result.success) {
        toast.danger("Couldn't save notes", { description: result.error });
        return;
      }
      toast.success(`Notes saved for room ${notesRoom.roomNumber}`);
      setNotesRoom(null);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const openAddRoom = (typeId?: string) => {
    setNewRoomNumber("");
    setNewRoomFloor("");
    setNewRoomNotes("");
    setRoomNumberError("");
    setNewRoomTypeId(typeId ?? roomTypes[0]?.id ?? "");
    setIsAddRoomOpen(true);
  };

  const handleCreateRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newRoomNumber.trim()) {
      setRoomNumberError("Room number is required");
      return;
    }
    if (!newRoomTypeId) {
      toast.danger("Add a room type first", {
        description: "Rooms must belong to a room type.",
      });
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
      toast.success(`Room ${payload.roomNumber} added successfully`);
      setIsAddRoomOpen(false);
    } catch {
      toast.danger("An unexpected error occurred");
    } finally {
      setIsCreatingRoom(false);
    }
  };

  // Edit details: type, number, floor, and notes. Status and active flag are
  // left untouched — they have their own inline controls.
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
    if (!editingRoom) return;
    if (!editRoomNumber.trim()) {
      setEditRoomError("Room number is required");
      return;
    }
    if (!editRoomTypeId) {
      setEditRoomError("Select a room type");
      return;
    }
    setIsSavingRoom(true);
    try {
      const result = await updateRoom(editingRoom.id, {
        roomTypeId: editRoomTypeId,
        roomNumber: editRoomNumber.trim(),
        floor: editRoomFloor.trim(),
        notes: editRoomNotes.trim(),
      });
      if (!result.success) {
        toast.danger("Couldn't update room", { description: result.error });
        return;
      }
      toast.success(`Room ${editRoomNumber.trim()} updated`);
      void writeAuditLog(supabase, {
        hotelId,
        action: "room.updated",
        entityType: "room",
        entityId: editingRoom.id,
        beforeState: {
          roomTypeId:
            roomTypes.find((t) => t.rooms.some((r) => r.id === editingRoom.id))?.id ?? null,
          roomNumber: editingRoom.roomNumber,
          floor: editingRoom.floor,
          notes: editingRoom.notes,
        },
        afterState: {
          roomTypeId: editRoomTypeId,
          roomNumber: editRoomNumber.trim(),
          floor: editRoomFloor.trim() || null,
          notes: editRoomNotes.trim() || null,
        },
      });
      setEditingRoom(null);
    } finally {
      setIsSavingRoom(false);
    }
  };

  // Reorder types: opens with the current sort order; moves are tracked in a
  // local copy until Save persists them (drives dashboard + calendar ordering).
  const openReorder = () => {
    setReorderIds(roomTypes.map((type) => type.id));
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
    // Defer setting state to next frame so native drag image snapshot is taken
    // before opacity/styling changes apply to the dragged element
    requestAnimationFrame(() => {
      setReorderDragIndex(index);
    });
  };

  // Drag-and-drop reorder — same pattern as components/ui/room-images-upload.tsx.
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
    reorderIds.length === roomTypes.length &&
    reorderIds.some((id, index) => id !== roomTypes[index]?.id);

  const handleSaveReorder = async () => {
    if (!isReorderDirty) return;
    setIsSavingReorder(true);
    try {
      const result = await reorderRoomTypes(reorderIds);
      if (!result.success) {
        toast.danger("Couldn't save the new order", { description: result.error });
        return;
      }
      toast.success("Room type order updated", {
        description: "The dashboard and calendar now use this order.",
      });
      setIsReorderOpen(false);
    } finally {
      setIsSavingReorder(false);
    }
  };

  // RoomTypeForm owns its submitting state and ignores the resolved value, so
  // this handler drives toasts, field errors, modal close, and redirect itself.
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
      toast.success("Room type created successfully", {
        description: "Complete the remaining details to make it bookable.",
      });
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

  const handleToggleTypeActive = async (type: RoomTypeGroup) => {
    setPendingTypeId(type.id);
    try {
      const result = await toggleRoomTypeActive(type.id, !type.isActive);
      if (!result.success) {
        toast.danger("Failed to update status", { description: result.error });
        return;
      }
      toast.success(`"${type.name}" is now ${type.isActive ? "inactive" : "active"}.`, {
        description: type.isActive
          ? "It will be hidden from the public booking site."
          : "It is now live on the public booking site.",
      });
    } catch {
      toast.danger("An unexpected error occurred");
    } finally {
      setPendingTypeId(null);
    }
  };

  const handleDeleteType = async () => {
    if (!typeToDelete) return;
    setIsDeletingType(true);
    try {
      const result = await deleteRoomType(typeToDelete.id);
      if (!result.success) {
        toast.danger("Failed to delete room type", { description: result.error });
        return;
      }
      toast.success(`"${typeToDelete.name}" has been permanently removed.`);
      setTypeToDelete(null);
    } catch {
      toast.danger("An unexpected error occurred");
    } finally {
      setIsDeletingType(false);
    }
  };

  // --- Render ---------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.3px] text-foreground max-md:text-xl">Rooms</h1>
        <p className="mt-1 max-md:text-xs text-sm text-muted-foreground">
          {roomTypes.length} {roomTypes.length === 1 ? "room type" : "room types"} · {totalRooms} {totalRooms === 1 ? "room" : "rooms"} · {totalAvailable} available
        </p>
      </div>

      {/* Toolbar: search + one overflow menu */}
      <div className="flex items-center gap-3">
        <SearchField
          value={query}
          onChange={setQuery}
          aria-label="Search rooms"
          className="w-full sm:w-[420px]"
        >
          <SearchField.Group className="h-10 rounded-xl border-border/70 bg-card">
            <SearchField.SearchIcon className="size-3.5 text-muted-foreground/70" />
            <SearchField.Input placeholder="Search room or type" className="text-[13px]" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <div className="flex-1" aria-hidden="true" />
        <Dropdown>
          <Button variant="outline" isIconOnly aria-label="Room settings" className="size-10 rounded-xl">
            <EllipsisVertical className="size-4" />
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu onAction={(key) => {
              if (key === "add-type") setIsAddTypeOpen(true);
              if (key === "reorder") openReorder();
            }}>
              <Dropdown.Item id="add-type" textValue="Add room type">
                <Plus className="size-4 text-muted-foreground" />
                <span>Add room type</span>
              </Dropdown.Item>
              <Dropdown.Item id="reorder" textValue="Reorder room types">
                <ArrowUpDown className="size-4 text-muted-foreground" />
                <span>Reorder room types</span>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

      {/* Body */}
      {roomTypes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 py-16 text-center">
          <BedDouble className="size-8 text-muted-foreground/40" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-body font-medium text-foreground">No room types yet</p>
            <p className="text-caption text-muted-foreground">
              Room types group your rooms and drive pricing on the booking site.
            </p>
          </div>
          <Button size="sm" onPress={() => setIsAddTypeOpen(true)} className="mt-1 rounded-xl">
            <Plus className="size-4" />
            Add Room Type
          </Button>
        </div>
      ) : visibleTypes.length === 0 ? (
        <p className="py-12 text-center text-body text-muted-foreground">
          No rooms or types match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        /* One white panel per the design; type sections stack inside it on
           desktop and split into one card per type on mobile. */
        <>
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card max-lg:hidden">
            {visibleTypes.map(({ type, rooms }) => (
              <TypeSection key={type.id} type={type} rooms={rooms}
                isFiltering={isFiltering} pendingTypeId={pendingTypeId}
                currency={currency} registerRef={rowRefs}
                onTypeEdit={() => router.push("/dashboard/rooms/types/" + type.id)}
                onTypeToggleActive={() => void handleToggleTypeActive(type)}
                onTypeDelete={() => setTypeToDelete(type)}
                onAddRoom={() => openAddRoom(type.id)}
                onStatusChange={handleStatusChange}
                onBlockDates={(id) => setBlockRoomId(id)}
                onEditNotes={openNotesEditor}
                onEditDetails={openEditRoom}
                pendingRoomId={pendingRoomId}
                isHighlighted={(room) => isFiltering && room.roomNumber.toLowerCase().includes(normalizedQuery)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-4 lg:hidden">
            {visibleTypes.map(({ type, rooms }) => (
              <div key={type.id} className="overflow-hidden rounded-2xl border border-border/70 bg-card">
                <TypeSection type={type} rooms={rooms}
                  isFiltering={isFiltering} pendingTypeId={pendingTypeId}
                  currency={currency} registerRef={rowRefs}
                  onTypeEdit={() => router.push("/dashboard/rooms/types/" + type.id)}
                  onTypeToggleActive={() => void handleToggleTypeActive(type)}
                  onTypeDelete={() => setTypeToDelete(type)}
                  onAddRoom={() => openAddRoom(type.id)}
                  onStatusChange={handleStatusChange}
                  onBlockDates={(id) => setBlockRoomId(id)}
                  onEditNotes={openNotesEditor}
                  onEditDetails={openEditRoom}
                  pendingRoomId={pendingRoomId}
                  isHighlighted={(room) => isFiltering && room.roomNumber.toLowerCase().includes(normalizedQuery)}
                />
              </div>
            ))}
          </div>
        </>
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
              <Modal.Heading>Add Room Type</Modal.Heading>
              <p className="mt-1 text-caption text-muted-foreground">
                Create a new room category. You&apos;ll be redirected to complete its
                details and upload photos.
              </p>
            </Modal.Header>
            <Modal.Body>
              <RoomTypeForm
                isModal
                currency={currency}
                onSubmit={handleAddType}
                onCancel={() => setIsAddTypeOpen(false)}
                submitLabel="Create Room Type"
                submittingLabel="Creating..."
                title="New Room Type"
                subtitle="Add a new room category. You'll add photos on the next step."
                errors={addTypeErrors}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Add Room Modal */}
      <Modal.Backdrop isOpen={isAddRoomOpen} onOpenChange={setIsAddRoomOpen}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Add New Room</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <form onSubmit={handleCreateRoom} className="flex flex-col gap-4">
                <HeroSelectField
                  label="Room Type"
                  value={newRoomTypeId}
                  onValueChange={setNewRoomTypeId}
                  options={roomTypes.map((type) => ({ value: type.id, label: type.name }))}
                  placeholder="Select a room type"
                  ariaLabel="Room type"
                />
                <div className="flex flex-col gap-2">
                  <label htmlFor="new-room-number" className="text-sm font-medium">
                    Room Number
                  </label>
                  <Input
                  id="new-room-number"
                  value={newRoomNumber}
                  onChange={(e) => {
                    setNewRoomNumber(e.target.value);
                    if (roomNumberError) setRoomNumberError("");
                  }}
                  placeholder="e.g., 101"
                  aria-invalid={!!roomNumberError}
                  aria-describedby={roomNumberError ? "new-room-number-error" : undefined}
                  className="rounded-xl border-border/60 bg-background"
                  />
                  {roomNumberError && (
                    <p id="new-room-number-error" className="text-caption text-destructive">
                      {roomNumberError}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="new-room-floor" className="text-sm font-medium">
                    Floor (Optional)
                  </label>
                  <Input
                  id="new-room-floor"
                  value={newRoomFloor}
                  onChange={(e) => setNewRoomFloor(e.target.value)}
                  placeholder="e.g., 1"
                  className="rounded-xl border-border/60 bg-background"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="new-room-notes" className="text-sm font-medium">
                    Notes (Optional)
                  </label>
                  <TextArea
                  id="new-room-notes"
                  value={newRoomNotes}
                  onChange={(e) => setNewRoomNotes(e.target.value)}
                  placeholder="Any additional notes about this room..."
                  rows={2}
                  className="rounded-xl border-border/60 bg-background"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" slot="close" className="rounded-xl">
                    Cancel
                  </Button>
                  <Button
                  type="submit"
                  isPending={isCreatingRoom}
                  isDisabled={isCreatingRoom || !newRoomNumber.trim() || !newRoomTypeId}
                  className="rounded-xl"
                  >
                  {isCreatingRoom ? "Adding..." : "Add Room"}
                  </Button>
                </div>
              </form>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Edit Room Details Modal — status and active flag are untouched here */}
      <Modal.Backdrop
        isOpen={editingRoom !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRoom(null);
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Edit Room {editingRoom?.roomNumber}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <form onSubmit={handleSaveRoomDetails} className="flex flex-col gap-4">
                <HeroSelectField
                  label="Room Type"
                  value={editRoomTypeId}
                  onValueChange={setEditRoomTypeId}
                  options={roomTypes.map((type) => ({ value: type.id, label: type.name }))}
                  placeholder="Select a room type"
                  ariaLabel="Room type"
                />
                <div className="flex flex-col gap-2">
                  <label htmlFor="edit-room-number" className="text-sm font-medium">
                    Room Number
                  </label>
                  <Input
                  id="edit-room-number"
                  value={editRoomNumber}
                  onChange={(e) => {
                    setEditRoomNumber(e.target.value);
                    if (editRoomError) setEditRoomError("");
                  }}
                  placeholder="e.g., 101"
                  aria-invalid={!!editRoomError}
                  className="rounded-xl border-border/60 bg-background"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="edit-room-floor" className="text-sm font-medium">
                    Floor (Optional)
                  </label>
                  <Input
                  id="edit-room-floor"
                  value={editRoomFloor}
                  onChange={(e) => setEditRoomFloor(e.target.value)}
                  placeholder="e.g., 1"
                  className="rounded-xl border-border/60 bg-background"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="edit-room-notes" className="text-sm font-medium">
                    Notes (Optional)
                  </label>
                  <TextArea
                  id="edit-room-notes"
                  value={editRoomNotes}
                  onChange={(e) => setEditRoomNotes(e.target.value)}
                  placeholder="Any additional notes about this room..."
                  rows={2}
                  className="rounded-xl border-border/60 bg-background"
                  />
                </div>
                {editRoomError && (
                  <p className="text-caption text-destructive">{editRoomError}</p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" slot="close" className="rounded-xl">
                    Cancel
                  </Button>
                  <Button
                  type="submit"
                  isPending={isSavingRoom}
                  isDisabled={isSavingRoom || !editRoomNumber.trim() || !editRoomTypeId}
                  className="rounded-xl"
                  >
                  {isSavingRoom ? "Saving..." : "Save Changes"}
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
          if (!open) setNotesRoom(null);
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Room {notesRoom?.roomNumber} notes</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextArea
                autoFocus
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Housekeeping or maintenance notes for this room..."
                rows={4}
                aria-label="Room notes"
                className="rounded-xl border-border/60 bg-background"
              />
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" variant="outline" slot="close" className="rounded-xl">
                Cancel
              </Button>
              <Button
                onPress={() => void handleSaveNotes()}
                isPending={isSavingNotes}
                isDisabled={isSavingNotes}
                className="rounded-xl"
              >
                {isSavingNotes ? "Saving..." : "Save notes"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Delete Room Type Confirmation */}
      <AlertDialog.Backdrop
        isOpen={typeToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTypeToDelete(null);
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete Room Type</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                Are you sure you want to delete &quot;{typeToDelete?.name}&quot;? This action
                cannot be undone.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="outline">
                Cancel
              </Button>
              <Button
                variant="danger"
                onPress={() => void handleDeleteType()}
                isPending={isDeletingType}
                isDisabled={isDeletingType}
              >
                Delete
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      {/* Reorder Room Types Modal — the saved order drives dashboard + calendar order */}
      <Modal.Backdrop
        isOpen={isReorderOpen}
        onOpenChange={(open) => {
          if (!open) setIsReorderOpen(false);
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Reorder Room Types</Modal.Heading>
              <p className="mt-1 text-caption text-muted-foreground">
                Drag rows or use the arrows — this order is used on the rooms page and the
                calendar.
              </p>
            </Modal.Header>
            <Modal.Body>
              <ol className="flex flex-col gap-2">
                {reorderIds.map((id, index) => {
                  const type = roomTypes.find((entry) => entry.id === id);
                  if (!type) return null;
                  return (
                    <li
                      key={id}
                      draggable={!isSavingReorder}
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
                        "flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 transition-all",
                        !isSavingReorder && "cursor-grab active:cursor-grabbing",
                        reorderDragIndex === index && "opacity-40",
                        reorderOverIndex === index &&
                        reorderDragIndex !== null &&
                        reorderDragIndex !== index &&
                        "border-primary ring-2 ring-primary/20 scale-[1.01] bg-muted/40",
                      )}
                    >
                      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="w-6 shrink-0 text-center text-caption tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body font-medium text-foreground">
                        {type.name}
                      </span>
                      <Button
                        variant="ghost"
                        isIconOnly
                        size="sm"
                        aria-label={`Move ${type.name} up`}
                        isDisabled={index === 0 || isSavingReorder}
                        onPress={() => moveReorderItem(index, -1)}
                        className="min-h-9 min-w-9 rounded-lg text-muted-foreground"
                      >
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        isIconOnly
                        size="sm"
                        aria-label={`Move ${type.name} down`}
                        isDisabled={index === reorderIds.length - 1 || isSavingReorder}
                        onPress={() => moveReorderItem(index, 1)}
                        className="min-h-9 min-w-9 rounded-lg text-muted-foreground"
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" variant="outline" slot="close" className="rounded-xl">
                Cancel
              </Button>
              <Button
                onPress={() => void handleSaveReorder()}
                isPending={isSavingReorder}
                isDisabled={isSavingReorder || !isReorderDirty}
                className="rounded-xl"
              >
                {isSavingReorder ? "Saving..." : "Save Order"}
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
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}

// --- Subcomponents ----------------------------------------------------------

interface RoomRowProps {
  room: RoomItem;
  isHighlighted: boolean;
  isPending: boolean;
  registerRef: (element: HTMLLIElement | null) => void;
  onStatusChange: (status: RoomStatus) => void;
  onBlockDates: () => void;
  onEditNotes: () => void;
  onEditDetails: () => void;
}

/** One aligned row: mono number, floor, guest/notes middle, status column, kebab. */
function RoomRow({
  room, isHighlighted, isPending, registerRef, onStatusChange, onBlockDates, onEditNotes, onEditDetails,
}: RoomRowProps) {
  const status = (room.status ?? "available") as RoomStatus;
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.available;
  const transitions = STATUS_TRANSITIONS[status] ?? [];
  const checkout = room.stay?.checkOut
    ? new Date(`${room.stay.checkOut}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    : null;

  return (
    <li
      ref={registerRef}
      className={cn(
        "flex items-center gap-3.5 border-b border-border/50 px-5 py-3 last:border-b-0 transition-colors duration-150 max-lg:border-b-0 max-lg:px-3.5 max-lg:py-2.5",
        isHighlighted && "bg-[#0485F70A]",
      )}
    >
      <span className="w-12 shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground max-lg:w-9 max-lg:text-xs">
        {room.roomNumber}
      </span>
      {room.floor && (
        <span className="w-16 shrink-0 text-xs text-muted-foreground max-lg:hidden">Floor {room.floor}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground max-lg:hidden">
        {room.isActive === false && <span className="text-muted-foreground/70">Inactive · </span>}
        {room.stay ? (
          <span>
            <span className="font-medium text-foreground">{room.stay.guestName}</span>
            {checkout ? <span className="text-muted-foreground"> · until {checkout}</span> : null}
          </span>
        ) : room.notes ? room.notes : null}
      </span>
      {/* Mobile stack: number + floor on one line, guest line under it */}
      <span className="min-w-0 flex-1 flex-col gap-0.5 lg:hidden">
        <span className="flex items-center gap-1.5">
          {room.floor && <span className="text-[10px] text-muted-foreground">Floor {room.floor}</span>}
          {room.isActive === false && <span className="text-[10px] text-muted-foreground/70">Inactive</span>}
        </span>
        {room.stay ? (
          <span className="truncate text-[10px]">
            <span className="font-medium text-foreground">{room.stay.guestName}</span>
            {checkout ? <span className="text-muted-foreground"> · until {checkout}</span> : null}
          </span>
        ) : room.notes ? (
          <span className="truncate text-[10px] text-muted-foreground">{room.notes}</span>
        ) : null}
      </span>
      <span className="w-[130px] shrink-0 max-lg:w-[106px]">
        <Dropdown>
          <Button variant="ghost" size="sm" isDisabled={isPending}
            aria-label={`Change status of room ${room.roomNumber}`}
            className="h-9 gap-1.5 rounded-lg px-1.5 max-lg:h-8 max-lg:px-1">
            <span className={cn("size-[7px] shrink-0 rounded-full max-lg:size-1.5", config.dot)} aria-hidden="true" />
            <span className="text-xs font-medium text-foreground max-lg:text-[11px]">{config.label}</span>
            <ChevronDown className="size-2.5 text-muted-foreground/70" aria-hidden="true" />
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu onAction={(key) => onStatusChange(key as RoomStatus)}>
              {transitions.map((nextStatus) => (
                <Dropdown.Item key={nextStatus} id={nextStatus} textValue={STATUS_CONFIG[nextStatus].label}>
                  <span className={cn("size-2 rounded-full", STATUS_CONFIG[nextStatus].dot)} aria-hidden="true" />
                  <span>{STATUS_CONFIG[nextStatus].label}</span>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </span>
      <Dropdown>
        <Button variant="ghost" isIconOnly aria-label={`Actions for room ${room.roomNumber}`}
          className="size-8 rounded-lg text-muted-foreground max-lg:size-7">
          <EllipsisVertical className="size-3.5" />
        </Button>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu onAction={(key) => {
            if (key === "edit") onEditDetails();
            if (key === "block") onBlockDates();
            if (key === "notes") onEditNotes();
          }}>
            <Dropdown.Item id="edit" textValue="Edit details">
              <Pencil className="size-4 text-muted-foreground" />
              <span>Edit details</span>
            </Dropdown.Item>
            <Dropdown.Item id="block" textValue="Block dates">
              <CalendarOff className="size-4 text-muted-foreground" />
              <span>Block dates</span>
            </Dropdown.Item>
            <Dropdown.Item id="notes" textValue="Edit notes">
              <NotebookPen className="size-4 text-muted-foreground" />
              <span>Edit notes</span>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </li>
  );
}

interface TypeSectionProps {
  type: RoomTypeGroup;
  rooms: RoomItem[];
  isFiltering: boolean;
  pendingTypeId: string | null;
  currency: string;
  registerRef: React.RefObject<Map<string, HTMLLIElement>>;
  onTypeEdit: () => void;
  onTypeToggleActive: () => void;
  onTypeDelete: () => void;
  onAddRoom: () => void;
  onStatusChange: (room: RoomItem, status: RoomStatus) => void;
  onBlockDates: (id: string) => void;
  onEditNotes: (room: RoomItem) => void;
  onEditDetails: (room: RoomItem, typeId: string) => void;
  pendingRoomId: string | null;
  isHighlighted: (room: RoomItem) => boolean;
}

/** Tinted type header + its room rows + the quiet Add-room row. */
function TypeSection({
  type, rooms, isFiltering, pendingTypeId, currency, registerRef,
  onTypeEdit, onTypeToggleActive, onTypeDelete, onAddRoom,
  onStatusChange, onBlockDates, onEditNotes, onEditDetails, pendingRoomId, isHighlighted,
}: TypeSectionProps) {
  const facts = [
    type.bedConfiguration,
    type.maxAdults || type.maxChildren ? `Sleeps ${(type.maxAdults ?? 0) + (type.maxChildren ?? 0)}` : null,
  ].filter(Boolean).join(" · ");

  return <>
    <div className="border-b border-border/70 bg-secondary px-5 py-3 max-lg:px-3.5 max-lg:py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-[15px] font-semibold text-foreground max-lg:text-[13px]">{type.name}</span>
        {type.isActive === false && (
          <span className="shrink-0 rounded-full border border-border/70 px-2 py-px text-[10px] text-muted-foreground">Inactive</span>
        )}
        <span className="min-w-0 flex-1" aria-hidden="true" />
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground max-lg:text-xs">
          {formatCurrency(type.basePrice, currency)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground max-lg:hidden">/ night</span>
        <TypeActionsDropdown
          type={type}
          isPending={pendingTypeId === type.id}
          onEdit={onTypeEdit}
          onToggleActive={onTypeToggleActive}
          onDelete={onTypeDelete}
        />
      </div>
      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground/90 max-lg:mt-0.5 max-lg:text-[10px]">
        <span className="truncate">{facts}</span>
        <span className="min-w-0 flex-1" aria-hidden="true" />
        <span className="shrink-0 tabular-nums">
          {rooms.length} {rooms.length === 1 ? "room" : "rooms"} · {type.availableRooms} available
        </span>
      </div>
    </div>
    {rooms.length === 0 ? (
      <p className="px-5 py-6 text-[13px] text-muted-foreground">
        {isFiltering ? "No rooms in this type match your search." : "No rooms in this type yet."}
      </p>
    ) : (
      <ul>
        {rooms.map((room) => (
          <RoomRow
            key={room.id}
            room={room}
            isHighlighted={isHighlighted(room)}
            isPending={pendingRoomId === room.id}
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
    {!isFiltering && (
      <button type="button" onClick={onAddRoom}
        className="flex w-full items-center gap-1.5 border-t border-border/50 px-5 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground max-lg:px-3.5">
        <Plus className="size-3" aria-hidden="true" /> Add room
      </button>
    )}
  </>;
}
interface TypeActionsDropdownProps {
  type: RoomTypeGroup;
  isPending: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function TypeActionsDropdown({
  type,
  isPending,
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
        className="mr-1 min-h-11 min-w-11 rounded-full text-muted-foreground sm:mr-2 sm:min-h-9 sm:min-w-9"
      >
        <EllipsisVertical className="size-4" />
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          onAction={(key) => {
            if (key === "edit") onEdit();
            if (key === "toggle-active") onToggleActive();
            if (key === "delete") onDelete();
          }}
        >
          <Dropdown.Item id="edit" textValue="Edit details">
            <Pencil className="size-4 text-muted-foreground" />
            <span>Edit details</span>
          </Dropdown.Item>
          <Dropdown.Item
            id="toggle-active"
            textValue={type.isActive ? "Deactivate" : "Activate"}
            isDisabled={isPending}
          >
            <Power className="size-4 text-muted-foreground" />
            <span>{type.isActive ? "Deactivate" : "Activate"}</span>
          </Dropdown.Item>
          <Dropdown.Item
            id="delete"
            textValue="Delete"
            isDisabled={hasRooms || isPending}
            className="text-danger"
          >
            <Trash2 className="size-4" />
            <span>{hasRooms ? "Delete (remove rooms first)" : "Delete"}</span>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}



