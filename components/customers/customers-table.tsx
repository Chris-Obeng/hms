"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import { Download, SlidersHorizontal, Users } from "lucide-react";
import { Button, Chip, SearchField, Table } from "@heroui/react";

import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { formatCurrency, formatDate } from "@/lib/format";
import { downloadCsv, toCsv } from "@/lib/csv";
import { HeroSelectField } from "@/components/ui/hero-select";
import { HeroTablePagination } from "@/components/ui/hero-table-pagination";
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

const TAG_CHIP_COLOR: Record<string, "warning" | "accent" | "danger" | "success" | "default"> = {
  vip: "warning",
  vip_plus: "warning",
  corporate: "accent",
  flagged: "danger",
  new: "success",
};

function getTagColor(tag: string) {
  return TAG_CHIP_COLOR[tag.toLowerCase()] || "default";
}

const ALL_TAG_OPTIONS = ["vip", "regular", "flagged", "corporate", "new", "returning"];

function GuestInitials({ fullName }: { fullName: string }) {
  const initials =
    fullName
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
      <span className="text-xs font-medium text-muted-foreground">{initials}</span>
    </span>
  );
}

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

  downloadCsv(`customers-${format(new Date(), "yyyy-MM-dd")}.csv`, toCsv(headers, rows));
}

// ── Main Component ─────────────────────────────────────────────────

export function CustomersTable({ data, currency }: CustomersTableProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Newest guests first by default (server pre-sorts created_at desc)
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  // Seed the search box from ?search= (set by global search "See all")
  const [globalFilter, setGlobalFilter] = React.useState(() => searchParams.get("search") ?? "");
  const [showFilters, setShowFilters] = React.useState(false);
  const [tagFilter, setTagFilter] = React.useState<string>("all");
  const [selectedGuest, setSelectedGuest] = React.useState<GuestRow | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  // Edits saved inside the detail sheet are merged here so table rows and
  // re-opened sheets reflect them immediately (server data refreshes on next
  // navigation). Cleared whenever fresh server data arrives.
  const [guestOverrides, setGuestOverrides] = React.useState<Record<string, Partial<GuestRow>>>({});
  React.useEffect(() => {
    setGuestOverrides({});
  }, [data]);

  const handleGuestUpdated = React.useCallback(
    (guestId: string, patch: Partial<GuestRow>) => {
      setGuestOverrides((prev) => ({ ...prev, [guestId]: { ...prev[guestId], ...patch } }));
      setSelectedGuest((prev) => (prev && prev.id === guestId ? { ...prev, ...patch } : prev));
    },
    []
  );

  const enrichedData = React.useMemo(
    () =>
      data.map((g) => (guestOverrides[g.id] ? { ...g, ...guestOverrides[g.id] } : g)),
    [data, guestOverrides]
  );

  // Watch for guestId in search params to auto-open guest detail sheet
  React.useEffect(() => {
    const guestId = searchParams.get("guestId");
    if (guestId) {
      const guest = enrichedData.find((g) => g.id === guestId);
      if (guest) {
        setSelectedGuest(guest);
        setDetailOpen(true);
      }
    }
  }, [searchParams, enrichedData]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setDetailOpen(open);
      if (!open) {
        // Remove guestId from URL without triggering a full page reload
        const params = new URLSearchParams(window.location.search);
        params.delete("guestId");
        const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
        router.replace(cleanUrl);
      }
    },
    [router]
  );

  // Apply tag selection as a column filter
  React.useEffect(() => {
    const filters: ColumnFiltersState = [];
    if (tagFilter !== "all") {
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
            <GuestInitials fullName={row.original.fullName} />
            <div className="flex min-w-0 flex-col">
              <span className="max-w-[180px] truncate text-body font-medium text-foreground">
                {row.original.fullName}
              </span>
              {row.original.email && (
                <span className="max-w-[180px] truncate text-caption text-muted-foreground">
                  {row.original.email}
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-body tabular-nums text-foreground">
            {row.original.phone || "—"}
          </span>
        ),
      },
      {
        accessorKey: "nationality",
        header: "Nationality",
        cell: ({ row }) => (
          <span className="text-body text-muted-foreground">
            {row.original.nationality || "—"}
          </span>
        ),
      },
      {
        accessorKey: "totalStays",
        header: "Stays",
        cell: ({ row }) => (
          <span className="text-body font-medium tabular-nums text-foreground">
            {row.original.totalStays}
          </span>
        ),
      },
      {
        accessorKey: "totalSpend",
        header: "Total Spent",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-body font-medium tabular-nums text-foreground">
            {formatCurrency(row.original.totalSpend, currency)}
          </span>
        ),
      },
      {
        accessorKey: "lastStayDate",
        header: "Last Stay",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-caption text-muted-foreground">
            {formatDate(row.original.lastStayDate)}
          </span>
        ),
      },
      {
        accessorKey: "tags",
        header: "Tags",
        enableSorting: false,
        filterFn: (row, id, filterValue) => {
          const tags = row.getValue(id) as string[];
          return tags.includes(filterValue as string);
        },
        cell: ({ row }) => {
          const tags = row.original.tags;
          if (tags.length === 0)
            return <span className="text-caption text-muted-foreground/50">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 2).map((tag) => (
                <Chip key={tag} size="sm" variant="soft" color={getTagColor(tag)}>
                  <span className="capitalize">{tag.replace("_", " ")}</span>
                </Chip>
              ))}
              {tags.length > 2 && (
                <span className="self-center text-caption text-muted-foreground">
                  +{tags.length - 2}
                </span>
              )}
            </div>
          );
        },
      },
    ],
    [currency]
  );

  const table = useReactTable({
    data: enrichedData,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
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
        pageSize: 15,
      },
    },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const rows = table.getRowModel().rows;
  const isFiltered = globalFilter.trim().length > 0 || tagFilter !== "all";

  function handleGuestClick(guest: GuestRow) {
    setSelectedGuest(guest);
    setDetailOpen(true);
  }

  const emptyState = (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Users className="mb-3 size-10 text-muted-foreground/30" />
      <p className="text-body font-medium text-muted-foreground">
        {isFiltered ? "No guests match your filters" : "No guest profiles yet"}
      </p>
      <p className="mt-1 max-w-[280px] text-caption text-muted-foreground/60">
        {isFiltered
          ? "Try adjusting your search or filters."
          : "Guest profiles are created automatically when bookings are made."}
      </p>
    </div>
  );

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-page-title text-foreground">Customers</h1>
            <p className="mt-0.5 text-body text-muted-foreground">
              {totalCount} guest profile{totalCount !== 1 ? "s" : ""}
              {filteredCount !== totalCount && (
                <span className="text-muted-foreground/60"> · {filteredCount} visible</span>
              )}
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <SearchField
              aria-label="Search guests"
              value={globalFilter}
              onChange={setGlobalFilter}
              className="max-w-xs flex-1"
            >
              <SearchField.Group className="h-9 rounded-xl border-border/60 bg-background">
                <SearchField.SearchIcon />
                <SearchField.Input
                  placeholder="Search name, email, phone..."
                  className="text-sm"
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              className={cn("h-9 shrink-0 rounded-xl text-sm", showFilters && "bg-muted")}
            >
              <SlidersHorizontal className="size-3.5" />
              Filters
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 rounded-xl text-sm"
            onPress={() => exportToCsv(enrichedData)}
          >
            <Download className="size-3.5" />
            Export
          </Button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
            <HeroSelectField
              className="w-40"
              label="Tag"
              value={tagFilter}
              onValueChange={setTagFilter}
              options={[
                { value: "all", label: "All" },
                ...ALL_TAG_OPTIONS.map((tag) => ({
                  value: tag,
                  label: tag.charAt(0).toUpperCase() + tag.slice(1),
                })),
              ]}
              ariaLabel="Guest tag"
            />
            {tagFilter !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg text-xs text-muted-foreground"
                onPress={() => setTagFilter("all")}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}

        {/* Desktop table */}
        <Table variant="secondary" className="hidden md:block">
          <Table.ScrollContainer>
            <Table.Content aria-label="Guests" className="min-w-[760px]">
              <Table.Header>
                {table.getHeaderGroups()[0]?.headers.map((header) => (
                  <Table.Column
                    key={header.id}
                    allowsSorting={header.column.getCanSort()}
                    id={header.id}
                    isRowHeader={header.id === "fullName"}
                  >
                    {({ sortDirection }) =>
                      header.id === "tags" ? (
                        flexRender(header.column.columnDef.header, header.getContext())
                      ) : (
                        <Table.SortableColumnHeader sortDirection={sortDirection}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </Table.SortableColumnHeader>
                      )
                    }
                  </Table.Column>
                ))}
              </Table.Header>
              <Table.Body renderEmptyState={() => emptyState}>
                {rows.map((row) => (
                  <Table.Row
                    key={row.id}
                    id={row.id}
                    className="cursor-pointer"
                    onAction={() => handleGuestClick(row.original)}
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
              {rows.map(({ original: guest }) => (
                <button
                  key={guest.id}
                  onClick={() => handleGuestClick(guest)}
                  className="w-full rounded-xl border border-border/60 bg-card p-4 text-left shadow-sm transition-colors active:bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <GuestInitials fullName={guest.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-semibold text-foreground">
                        {guest.fullName}
                      </p>
                      <p className="truncate text-caption text-muted-foreground">
                        {guest.phone || guest.email || "—"}
                      </p>
                    </div>
                    {guest.tags.length > 0 && (
                      <Chip size="sm" variant="soft" color={getTagColor(guest.tags[0])}>
                        <span className="capitalize">{guest.tags[0].replace("_", " ")}</span>
                      </Chip>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                    <div className="flex gap-4">
                      <div>
                        <p className="text-caption text-muted-foreground">Stays</p>
                        <p className="text-body font-medium tabular-nums text-foreground">
                          {guest.totalStays}
                        </p>
                      </div>
                      <div>
                        <p className="text-caption text-muted-foreground">Total spent</p>
                        <p className="text-body font-medium tabular-nums text-foreground">
                          {formatCurrency(guest.totalSpend, currency)}
                        </p>
                      </div>
                    </div>
                    <p className="text-caption text-muted-foreground">
                      Last stay {formatDate(guest.lastStayDate)}
                    </p>
                  </div>
                </button>
              ))}
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

      {/* Guest Detail Sheet */}
      {selectedGuest && (
        <GuestDetailSheet
          guest={selectedGuest}
          open={detailOpen}
          onOpenChange={handleOpenChange}
          currency={currency}
          onGuestUpdated={handleGuestUpdated}
        />
      )}
    </>
  );
}
