"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
  BedDouble,
  DoorOpen,
  EllipsisVertical,
  EyeOff,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  Button,
  Chip,
  Dropdown,
  Label,
  SearchField,
  Table,
  toast,
} from "@heroui/react";

import { formatCurrency } from "@/lib/format";
import { HeroTablePagination } from "@/components/ui/hero-table-pagination";
import { toggleRoomTypeActive, deleteRoomType } from "@/app/actions/rooms";

// ── Types ──────────────────────────────────────────────────────────

export interface RoomTypeRow {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  bedConfiguration: string | null;
  maxAdults: number | null;
  maxChildren: number | null;
  basePrice: number;
  weekendPrice: number | null;
  amenities: { icon: string; label: string }[] | null;
  isActive: boolean | null;
  sortOrder: number | null;
  roomCount: number;
  availableRooms: number;
  occupiedRooms: number;
  createdAt: string | null;
}

interface RoomTypesTableProps {
  data: RoomTypeRow[];
  currency: string;
}

// ── Row actions (shared by desktop + mobile) ───────────────────────

function RoomTypeActions({
  roomType,
  onToggleActive,
  onRequestDelete,
}: {
  roomType: RoomTypeRow;
  onToggleActive: (rt: RoomTypeRow) => void;
  onRequestDelete: (rt: RoomTypeRow) => void;
}) {
  const router = useRouter();
  return (
    <Dropdown>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={`Actions for ${roomType.name}`}
        className="size-8 min-w-8 rounded-lg text-muted-foreground"
      >
        <EllipsisVertical className="size-4" />
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu>
          <Dropdown.Item
            id="edit"
            textValue="Edit details"
            onAction={() => router.push(`/dashboard/rooms/types/${roomType.id}`)}
          >
            <Pencil className="size-3.5" />
            <Label>Edit details</Label>
          </Dropdown.Item>
          <Dropdown.Item
            id="toggle"
            textValue={roomType.isActive ? "Deactivate" : "Activate"}
            onAction={() => onToggleActive(roomType)}
          >
            <EyeOff className="size-3.5" />
            <Label>{roomType.isActive ? "Deactivate" : "Activate"}</Label>
          </Dropdown.Item>
          <Dropdown.Item
            id="delete"
            textValue="Delete room type"
            variant="danger"
            onAction={() => onRequestDelete(roomType)}
          >
            <Trash2 className="size-3.5" />
            <Label>Delete…</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

// ── Columns ────────────────────────────────────────────────────────

function getColumns(
  currency: string,
  onToggleActive: (rt: RoomTypeRow) => void,
  onRequestDelete: (rt: RoomTypeRow) => void
): ColumnDef<RoomTypeRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Room Type",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/30">
            <BedDouble className="size-4 text-muted-foreground" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span className="text-body font-medium text-foreground">{row.original.name}</span>
              <Chip
                size="sm"
                variant="soft"
                color={row.original.isActive ? "success" : "default"}
                className="shrink-0"
              >
                {row.original.isActive ? "Active" : "Inactive"}
              </Chip>
            </div>
            {row.original.shortDescription && (
              <span className="text-caption mt-0.5 max-w-[220px] truncate text-muted-foreground">
                {row.original.shortDescription}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "basePrice",
      header: "Rate",
      cell: ({ row }) => (
        <div className="flex flex-col whitespace-nowrap">
          <span className="text-body font-medium tabular-nums text-foreground">
            {formatCurrency(row.original.basePrice, currency)}
            <span className="text-caption font-normal text-muted-foreground"> /night</span>
          </span>
          {row.original.weekendPrice != null && (
            <span className="text-caption tabular-nums text-muted-foreground">
              Weekend {formatCurrency(row.original.weekendPrice, currency)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "occupancy",
      header: "Sleeps",
      cell: ({ row }) => (
        <span className="text-body whitespace-nowrap tabular-nums text-muted-foreground">
          {row.original.maxAdults ?? "?"} adults
          {row.original.maxChildren ? ` + ${row.original.maxChildren} child` : ""}
        </span>
      ),
    },
    {
      accessorKey: "roomCount",
      header: "Rooms",
      cell: ({ row }) => (
        <div className="flex items-baseline gap-2">
          <span className="text-body font-semibold tabular-nums text-foreground">
            {row.original.roomCount}
          </span>
          <span className="text-caption whitespace-nowrap">
            <span className="text-emerald-600 dark:text-emerald-400">
              {row.original.availableRooms} free
            </span>
            <span className="text-muted-foreground/50"> · </span>
            <span className="text-blue-600 dark:text-blue-400">
              {row.original.occupiedRooms} occ
            </span>
          </span>
        </div>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <RoomTypeActions
          roomType={row.original}
          onToggleActive={onToggleActive}
          onRequestDelete={onRequestDelete}
        />
      ),
    },
  ];
}

// ── Main Component ─────────────────────────────────────────────────

export function RoomTypesTable({ data, currency }: RoomTypesTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [localData, setLocalData] = React.useState(data);
  const [pendingDelete, setPendingDelete] = React.useState<RoomTypeRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const toggleBusyRef = React.useRef(false);

  React.useEffect(() => {
    setLocalData(data);
  }, [data]);

  const handleToggleActive = React.useCallback(async (rt: RoomTypeRow) => {
    if (toggleBusyRef.current) return;
    const next = !rt.isActive;
    toggleBusyRef.current = true;
    try {
      const result = await toggleRoomTypeActive(rt.id, next);
      if (result.success) {
        setLocalData((prev) =>
          prev.map((item) => (item.id === rt.id ? { ...item, isActive: next } : item))
        );
        toast.success(next ? `"${rt.name}" activated` : `"${rt.name}" deactivated`);
      } else {
        toast.danger(result.error || "Failed to update");
      }
    } finally {
      toggleBusyRef.current = false;
    }
  }, []);

  const handleDelete = React.useCallback(async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      const result = await deleteRoomType(pendingDelete.id);
      if (result.success) {
        setLocalData((prev) => prev.filter((item) => item.id !== pendingDelete.id));
        toast.success(`"${pendingDelete.name}" deleted`);
        setPendingDelete(null);
      } else {
        toast.danger(result.error || "Failed to delete");
      }
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, deleting]);

  const handleRequestDelete = React.useCallback((rt: RoomTypeRow) => {
    setPendingDelete(rt);
  }, []);

  const columns = React.useMemo(
    () => getColumns(currency, (rt) => void handleToggleActive(rt), handleRequestDelete),
    [currency, handleToggleActive, handleRequestDelete]
  );

  const table = useReactTable({
    data: localData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const rt = row.original;
      const search = filterValue.toLowerCase();
      return (
        rt.name.toLowerCase().includes(search) ||
        (rt.slug || "").includes(search) ||
        (rt.bedConfiguration || "").toLowerCase().includes(search)
      );
    },
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const rows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = localData.length;
  const isFiltered = globalFilter.trim().length > 0;

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchField
          aria-label="Search room types"
          value={globalFilter}
          onChange={setGlobalFilter}
          className="sm:max-w-xs"
        >
          <SearchField.Group className="h-9 rounded-xl border-border/60 bg-background">
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search room types..." className="text-sm" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <p className="text-caption shrink-0 text-muted-foreground">
          {filteredCount === totalCount
            ? `${totalCount} room type${totalCount !== 1 ? "s" : ""}`
            : `${filteredCount} of ${totalCount} shown`}
        </p>
      </div>

      {/* Desktop table */}
      <Table variant="secondary" className="hidden md:block">
        <Table.ScrollContainer>
          <Table.Content aria-label="Room types" className="min-w-[720px]">
            <Table.Header>
              {table.getHeaderGroups()[0]?.headers.map((header) => (
                <Table.Column
                  key={header.id}
                  allowsSorting={header.column.getCanSort()}
                  id={header.id}
                  isRowHeader={header.id === "name"}
                >
                  {({ sortDirection }) =>
                    header.id === "actions" ? null : (
                      <Table.SortableColumnHeader sortDirection={sortDirection}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </Table.SortableColumnHeader>
                    )
                  }
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body renderEmptyState={() => <RoomTypesEmptyState filtered={isFiltered} />}>
              {rows.map((row) => (
                <Table.Row
                  key={row.id}
                  id={row.id}
                  className="cursor-pointer"
                  onAction={() => router.push(`/dashboard/rooms/types/${row.original.id}`)}
                >
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
            {rows.map(({ original: rt }) => (
              <div
                key={rt.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/dashboard/rooms/types/${rt.id}`)}
                onKeyDown={(e) => e.key === "Enter" && router.push(`/dashboard/rooms/types/${rt.id}`)}
                className="cursor-pointer rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-colors active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-foreground">{rt.name}</p>
                    {rt.shortDescription && (
                      <p className="text-caption mt-0.5 line-clamp-1 text-muted-foreground">
                        {rt.shortDescription}
                      </p>
                    )}
                  </div>
                  <Chip size="sm" variant="soft" color={rt.isActive ? "success" : "default"}>
                    {rt.isActive ? "Active" : "Inactive"}
                  </Chip>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-body font-medium tabular-nums text-foreground">
                      {formatCurrency(rt.basePrice, currency)}
                      <span className="text-caption font-normal text-muted-foreground"> /night</span>
                    </p>
                    <p className="text-caption mt-0.5 text-muted-foreground">
                      Sleeps {(rt.maxAdults ?? 0) + (rt.maxChildren ?? 0)} ·{" "}
                      {rt.availableRooms}/{rt.roomCount} free
                    </p>
                  </div>
                  <span onClick={(e) => e.stopPropagation()}>
                    <RoomTypeActions
                      roomType={rt}
                      onToggleActive={(item) => void handleToggleActive(item)}
                      onRequestDelete={handleRequestDelete}
                    />
                  </span>
                </div>
              </div>
            ))}
            <HeroTablePagination
              table={table}
              totalRows={totalCount}
              filteredRows={filteredCount}
            />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 p-4">
            <RoomTypesEmptyState filtered={isFiltered} />
          </div>
        )}
      </div>

      {/* Delete confirmation — destructive, always confirm */}
      <AlertDialog>
        <AlertDialog.Backdrop
          isOpen={pendingDelete !== null}
          onOpenChange={(open) => !open && setPendingDelete(null)}
        >
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[420px]">
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>
                  Delete &ldquo;{pendingDelete?.name}&rdquo;?
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  This permanently removes the room type from your hotel. Rooms and reservations
                  linked to it may be affected. This action cannot be undone.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary" isDisabled={deleting}>
                  Cancel
                </Button>
                <Button variant="danger" isPending={deleting} onPress={() => void handleDelete()}>
                  Delete room type
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}

// ── Empty state ────────────────────────────────────────────────────

function RoomTypesEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <DoorOpen className="mb-3 size-10 text-muted-foreground/30" />
      <p className="text-body font-medium text-muted-foreground">
        {filtered ? "No room types match your search" : "No room types yet"}
      </p>
      <p className="text-caption mt-1 max-w-[260px] text-muted-foreground/60">
        {filtered
          ? "Try adjusting your search."
          : "Add your first room type to start managing rooms."}
      </p>
    </div>
  );
}
