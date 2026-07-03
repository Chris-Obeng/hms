"use client";

import * as React from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Edit3,
  Eye,
  MoreHorizontal,
  Search,
} from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// ── Helpers ────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ── Columns ────────────────────────────────────────────────────────

function getColumns(
  currency: string,
  onToggleActive: (id: string, isActive: boolean) => void,
  onDelete: (id: string, name: string) => void
): ColumnDef<RoomTypeRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Room Type",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 ring-1 ring-border/30">
            <DoorOpen className="size-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate max-w-[180px]">
                {row.original.name}
              </span>
              <Badge
                variant={row.original.isActive ? "default" : "outline"}
                className="text-caption px-1.5 py-0 h-5 font-medium"
              >
                {row.original.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            {row.original.shortDescription && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px] mt-0.5">
                {row.original.shortDescription}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "basePrice",
      header: "Base Price",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-foreground tabular-nums whitespace-nowrap">
          {formatCurrency(row.original.basePrice, currency)}
          <span className="text-xs text-muted-foreground font-normal">/night</span>
        </span>
      ),
    },
    {
      accessorKey: "weekendPrice",
      header: "Weekend",
      cell: ({ row }) => (
        <span className="text-sm text-foreground tabular-nums whitespace-nowrap">
          {row.original.weekendPrice
            ? formatCurrency(row.original.weekendPrice, currency)
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "bedConfiguration",
      header: "Beds",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.bedConfiguration || "—"}
        </span>
      ),
    },
    {
      id: "occupancy",
      header: "Occupancy",
      cell: ({ row }) => (
        <span className="text-sm text-foreground tabular-nums">
          {row.original.maxAdults ?? "?"} adults
          {row.original.maxChildren ? ` + ${row.original.maxChildren} child` : ""}
        </span>
      ),
    },
    {
      id: "rooms",
      header: "Rooms",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground tabular-nums">
            {row.original.roomCount}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="text-emerald-600">{row.original.availableRooms} free</span>
            <span>·</span>
            <span className="text-blue-600">{row.original.occupiedRooms} occ</span>
          </div>
        </div>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const rt = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              <MoreHorizontal className="size-3.5" />
              <span className="sr-only">Actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                {rt.name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <Link href={`/dashboard/rooms/types/${rt.id}`}>
                <DropdownMenuItem onClick={() => {}}>
                  <Edit3 className="size-3.5 mr-2" />
                  Edit
                </DropdownMenuItem>
              </Link>
              <DropdownMenuItem
                onClick={() => onToggleActive(rt.id, !rt.isActive)}
              >
                <Eye className="size-3.5 mr-2" />
                {rt.isActive ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(rt.id, rt.name)}
                className="text-destructive focus:text-destructive"
              >
                <span className="size-3.5 mr-2 flex items-center justify-center text-[10px]">✕</span>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}

// ── Main Component ─────────────────────────────────────────────────

export function RoomTypesTable({ data, currency }: RoomTypesTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "sortOrder", desc: false },
  ]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [localData, setLocalData] = React.useState(data);

  // Sync when data changes
  React.useEffect(() => {
    setLocalData(data);
  }, [data]);

  const columns = React.useMemo(
    () =>
      getColumns(
        currency,
        async (id, isActive) => {
          const result = await toggleRoomTypeActive(id, isActive);
          if (result.success) {
            setLocalData((prev) =>
              prev.map((rt) =>
                rt.id === id ? { ...rt, isActive } : rt
              )
            );
            toast.success(isActive ? "Room type activated" : "Room type deactivated");
          } else {
            toast.error(result.error || "Failed to update");
          }
        },
        async (id, name) => {
          const result = await deleteRoomType(id);
          if (result.success) {
            setLocalData((prev) => prev.filter((rt) => rt.id !== id));
            toast.success(`"${name}" deleted`);
          } else {
            toast.error(result.error || "Failed to delete");
          }
        }
      ),
    [currency]
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
      pagination: { pageSize: 50 },
      sorting: [{ id: "sortOrder", desc: false }],
    },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = localData.length;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
          <Input
            placeholder="Search room types..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 pl-9 text-sm rounded-xl border-border/60"
          />
        </div>
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
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
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
                        {globalFilter
                          ? "No room types match your search"
                          : "No room types yet"}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px]">
                        {globalFilter
                          ? "Try adjusting your search"
                          : "Add your first room type to start managing rooms."}
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
            {filteredCount > 0
              ? `Showing ${table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} - ${Math.min(
                  (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                  filteredCount
                )} of ${filteredCount}`
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
  );
}
