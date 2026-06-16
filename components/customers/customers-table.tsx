"use client";

import * as React from "react";
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
  Download,
  Mail,
  Phone,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { format, parseISO } from "date-fns";

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
import { GuestDetailSheet } from "@/components/customers/guest-detail-sheet";

// ── Types ──────────────────────────────────────────────────────────

export interface GuestRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  nationality: string | null;
  notes: string | null;
  tags: string[];
  totalStays: number;
  totalSpend: number;
  lastStayDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface CustomersTableProps {
  data: GuestRow[];
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "MMM dd, yyyy");
  } catch {
    return dateStr;
  }
}

const TAG_STYLES: Record<string, { color: string; bg: string }> = {
  vip: { color: "text-amber-600", bg: "bg-amber-500/10" },
  regular: { color: "text-blue-600", bg: "bg-blue-500/10" },
  flagged: { color: "text-red-600", bg: "bg-red-500/10" },
  corporate: { color: "text-purple-600", bg: "bg-purple-500/10" },
  new: { color: "text-emerald-600", bg: "bg-emerald-500/10" },
  returning: { color: "text-teal-600", bg: "bg-teal-500/10" },
  vip_plus: { color: "text-amber-700", bg: "bg-amber-500/15" },
};

function getTagStyle(tag: string) {
  const lower = tag.toLowerCase();
  return TAG_STYLES[lower] || { color: "text-muted-foreground", bg: "bg-muted" };
}

const ALL_TAG_OPTIONS = ["vip", "regular", "flagged", "corporate", "new", "returning"];

// ── CSV Export ─────────────────────────────────────────────────────

function exportToCsv(data: GuestRow[]) {
  const headers = [
    "Full Name",
    "Email",
    "Phone",
    "Nationality",
    "National ID",
    "Total Stays",
    "Total Spend",
    "Last Stay Date",
    "Tags",
    "Notes",
  ];

  const rows = data.map((g) => [
    g.fullName,
    g.email || "",
    g.phone || "",
    g.nationality || "",
    g.nationalId || "",
    g.totalStays.toString(),
    g.totalSpend.toString(),
    g.lastStayDate || "",
    g.tags.join(", "),
    g.notes || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `customers-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Main Component ─────────────────────────────────────────────────

export function CustomersTable({ data, currency }: CustomersTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "totalSpend", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const [selectedGuest, setSelectedGuest] = React.useState<GuestRow | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  // Tag filter
  const [tagFilter, setTagFilter] = React.useState<string>("all");

  // Apply column filters from selections
  React.useEffect(() => {
    const filters: ColumnFiltersState = [];
    if (tagFilter !== "all") {
      // Tags are stored as array — we filter client-side via custom filter fn
      filters.push({ id: "tags", value: tagFilter });
    }
    setColumnFilters(filters);
  }, [tagFilter]);

  // ── Columns ────────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<GuestRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Guest",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-muted-foreground">
                {row.original.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-foreground truncate max-w-[180px]">
                {row.original.fullName}
              </span>
              {row.original.email && (
                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {row.original.email}
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        enableHiding: true,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground truncate max-w-[180px] block">
            {row.original.email || "—"}
          </span>
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="text-sm text-foreground tabular-nums">
            {row.original.phone || "—"}
          </span>
        ),
      },
      {
        accessorKey: "nationality",
        header: "Nationality",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.nationality || "—"}
          </span>
        ),
      },
      {
        accessorKey: "totalStays",
        header: "Stays",
        cell: ({ row }) => (
          <span className="text-sm font-medium text-foreground tabular-nums">
            {row.original.totalStays}
          </span>
        ),
      },
      {
        accessorKey: "totalSpend",
        header: "Total Spent",
        cell: ({ row }) => (
          <span className="text-sm font-medium text-foreground tabular-nums whitespace-nowrap">
            {formatCurrency(row.original.totalSpend, currency)}
          </span>
        ),
      },
      {
        accessorKey: "lastStayDate",
        header: "Last Stay",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
            {formatDate(row.original.lastStayDate)}
          </span>
        ),
      },
      {
        accessorKey: "tags",
        header: "Tags",
        filterFn: (row, id, filterValue) => {
          const tags = row.getValue(id) as string[];
          return tags.includes(filterValue as string);
        },
        cell: ({ row }) => {
          const tags = row.original.tags;
          if (tags.length === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => {
                const style = getTagStyle(tag);
                return (
                  <span
                    key={tag}
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize",
                      style.bg,
                      style.color
                    )}
                  >
                    {tag}
                  </span>
                );
              })}
              {tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>
              )}
            </div>
          );
        },
      },
    ],
    [currency]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const guest = row.original;
      const search = filterValue.toLowerCase();
      return (
        guest.fullName.toLowerCase().includes(search) ||
        (guest.email || "").toLowerCase().includes(search) ||
        (guest.phone || "").toLowerCase().includes(search) ||
        guest.tags.some((t) => t.toLowerCase().includes(search)) ||
        (guest.nationality || "").toLowerCase().includes(search)
      );
    },
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;

  function handleGuestClick(guest: GuestRow) {
    setSelectedGuest(guest);
    setDetailOpen(true);
  }

  return (
    <>
      <div className="space-y-4">
        {/* Search + Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
              <Input
                placeholder="Search name, email, phone, tags..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="h-9 pl-9 text-sm rounded-xl border-border/60"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-9 text-sm rounded-xl gap-1.5 shrink-0",
                showFilters && "bg-muted text-foreground"
              )}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="size-3.5" />
              Filters
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm rounded-xl border-border/60"
              onClick={() => exportToCsv(data)}
            >
              <Download className="size-3.5 mr-1.5" />
              Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <Card size="sm" className="border-border/60">
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Tags */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Tag
                  </label>
                  <select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="all">All</option>
                    {ALL_TAG_OPTIONS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag.charAt(0).toUpperCase() + tag.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Clear */}
                {tagFilter !== "all" && (
                  <button
                    onClick={() => setTagFilter("all")}
                    className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted self-end"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

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
                              asc: (
                                <ChevronDown className="size-3 rotate-180 text-muted-foreground/60" />
                              ),
                              desc: (
                                <ChevronDown className="size-3 text-muted-foreground/60" />
                              ),
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
                    <TableRow
                      key={row.id}
                      className="group cursor-pointer transition-colors hover:bg-muted/30"
                      onClick={() => handleGuestClick(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-48 text-center"
                    >
                      <div className="flex flex-col items-center justify-center">
                        <Users className="size-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">
                          {globalFilter || tagFilter !== "all"
                            ? "No guests match your filters"
                            : "No guest profiles yet"}
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px]">
                          {globalFilter || tagFilter !== "all"
                            ? "Try adjusting your search or filters"
                            : "Guest profiles are created automatically when bookings are made."}
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

      {/* Guest Detail Sheet */}
      {selectedGuest && (
        <GuestDetailSheet
          guest={selectedGuest}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          currency={currency}
          onGuestUpdated={() => {
            // Refresh will happen on next navigation
          }}
        />
      )}
    </>
  );
}
