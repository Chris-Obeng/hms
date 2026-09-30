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
import { Users } from "lucide-react";
import { Button, Chip, Table } from "@heroui/react";

import { formatCurrency, formatDate } from "@/lib/format";
import { HeroTablePagination } from "@/components/ui/hero-table-pagination";
import { TableSearchField } from "@/components/ui/table-search-field";
import { ViewModeToggle } from "@/components/ui/view-mode-toggle";
import {
  EntityFilters,
  EntityFilterChips,
  type FilterFieldConfig,
} from "@/components/ui/entity-filters";
import { GuestDetailSheet } from "@/components/customers/guest-detail-sheet";
import { guestBookingsCache } from "@/lib/cache/guest-bookings-cache";
import { CAPS, onIdle, isFresh } from "@/lib/cache/prefetch-helpers";
import { useQueryClient } from "@tanstack/react-query";

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

const TAG_OPTIONS = ALL_TAG_OPTIONS.map((t) => ({
  value: t,
  label: t.charAt(0).toUpperCase() + t.slice(1),
}));

const ACTIVITY_OPTIONS = [
  { value: "returning", label: "Returning" },
  { value: "first_time", label: "First-time" },
  { value: "no_stays", label: "No stays" },
];

function activityBucket(totalStays: number) {
  return totalStays >= 2 ? "returning" : totalStays === 1 ? "first_time" : "no_stays";
}

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

// Reusable guest card — mobile list + desktop grid view share it.
function GuestCard({
  guest,
  currency,
  onSelect,
  onHoverPrefetch,
}: {
  guest: GuestRow;
  currency: string;
  onSelect: (guest: GuestRow) => void;
  onHoverPrefetch?: (id: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(guest)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(guest);
        }
      }}
      onPointerEnter={() => onHoverPrefetch?.(guest.id)}
      onFocus={() => onHoverPrefetch?.(guest.id)}
      className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-sm transition-all duration-150 hover:border-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/40"
    >
      <div className="flex items-center gap-3">
        <GuestInitials fullName={guest.fullName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-foreground">{guest.fullName}</p>
          <p className="truncate text-caption text-muted-foreground">
            {guest.phone || guest.email || "—"}
          </p>
        </div>
        {guest.tags.length > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            <Chip size="sm" variant="soft" color={getTagColor(guest.tags[0])}>
              <span className="capitalize">{guest.tags[0].replace("_", " ")}</span>
            </Chip>
            {guest.tags.length > 1 && (
              <span className="text-caption text-muted-foreground">+{guest.tags.length - 1}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
        <div className="flex gap-4">
          <div>
            <p className="text-caption text-muted-foreground">Stays</p>
            <p className="text-body font-medium tabular-nums text-foreground">{guest.totalStays}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Total spent</p>
            <p className="text-body font-medium tabular-nums text-foreground">
              {formatCurrency(guest.totalSpend, currency)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-caption text-muted-foreground">Last stay</p>
          <p className="text-caption font-medium text-foreground">
            {formatDate(guest.lastStayDate)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function CustomersTable({ data, currency }: CustomersTableProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Newest guests first by default (server pre-sorts created_at desc)
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  // Seed the search box from ?search= (set by global search "See all")
  const [globalFilter, setGlobalFilter] = React.useState(() => searchParams.get("search") ?? "");
  const [tagFilter, setTagFilter] = React.useState("all");
  const [activityFilter, setActivityFilter] = React.useState("all");
  const [nationalityFilter, setNationalityFilter] = React.useState("all");
  const [selectedGuest, setSelectedGuest] = React.useState<GuestRow | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"table" | "grid">("table");

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

  const hoverPrefetch = React.useCallback(
    (id: string) => {
      if (isFresh(queryClient, guestBookingsCache.key(id))) return;
      void queryClient.prefetchQuery(guestBookingsCache.options(id));
    },
    [queryClient]
  );

  // idle tier wired after table `rows` is defined below

  // viewport tier wired after table `rows` is defined below

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

  // Selections drive TanStack column filters (tags = membership, others exact).
  React.useEffect(() => {
    const filters: ColumnFiltersState = [];
    if (tagFilter !== "all") filters.push({ id: "tags", value: tagFilter });
    if (activityFilter !== "all") filters.push({ id: "activity", value: activityFilter });
    if (nationalityFilter !== "all") filters.push({ id: "nationality", value: nationalityFilter });
    setColumnFilters(filters);
  }, [tagFilter, activityFilter, nationalityFilter]);

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
        filterFn: (row, id, value) => row.getValue(id) === value,
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
      {
        id: "activity",
        accessorFn: (g) => activityBucket(g.totalStays),
        header: "Activity",
        enableSorting: false,
        filterFn: (row, id, value) => row.getValue(id) === value,
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
      columnVisibility: { activity: false },
      pagination: {
        pageSize: 15,
      },
    },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const rows = table.getRowModel().rows;
  const visibleGuestIdsKey = React.useMemo(() => rows.slice(0, CAPS.clientIdle).map((r) => r.original.id).join(","), [rows]);
  React.useEffect(() => {
    if (!visibleGuestIdsKey) return;
    const ids = visibleGuestIdsKey.split(",").filter(Boolean);
    return onIdle(() => {
      for (const id of ids) {
        if (isFresh(queryClient, guestBookingsCache.key(id))) continue;
        void queryClient.prefetchQuery(guestBookingsCache.options(id));
      }
    });
  }, [visibleGuestIdsKey, queryClient]);
  const observedGuestRef = React.useRef<Set<string>>(new Set());
  const guestObserverRef = React.useRef<IntersectionObserver | null>(null);
  const getGuestObserver = React.useCallback(() => {
    if (guestObserverRef.current) return guestObserverRef.current;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return null;
    guestObserverRef.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset.guestId;
          if (!id || observedGuestRef.current.has(id)) continue;
          observedGuestRef.current.add(id);
          guestObserverRef.current?.unobserve(e.target);
          if (isFresh(queryClient, guestBookingsCache.key(id))) continue;
          if (observedGuestRef.current.size > CAPS.serverWarm + CAPS.viewportAhead) continue;
          void queryClient.prefetchQuery(guestBookingsCache.options(id));
        }
      },
      { rootMargin: "400px" }
    );
    return guestObserverRef.current;
  }, [queryClient]);
  const attachGuestRef = React.useCallback(
    (el: HTMLDivElement | HTMLElement | null) => {
      if (!el) return;
      const id = (el as HTMLElement).dataset.guestId;
      if (!id || observedGuestRef.current.has(id)) return;
      getGuestObserver()?.observe(el as unknown as Element);
    },
    [getGuestObserver]
  );
  React.useEffect(() => () => guestObserverRef.current?.disconnect(), []);

  const nationalityOptions = React.useMemo(
    () =>
      (Array.from(new Set(data.map((g) => g.nationality).filter(Boolean))) as string[])
        .sort((a, b) => a.localeCompare(b))
        .map((n) => ({ value: n, label: n })),
    [data]
  );

  const filterFields = React.useMemo<FilterFieldConfig[]>(
    () => [
      { key: "tag", label: "Tag", ariaLabel: "Filter by guest tag", allLabel: "All tags", options: TAG_OPTIONS },
      { key: "activity", label: "Activity", ariaLabel: "Filter by stay activity", allLabel: "Any activity", options: ACTIVITY_OPTIONS },
      {
        key: "nationality",
        label: "Nationality",
        ariaLabel: "Filter by nationality",
        allLabel: "All nationalities",
        disabled: nationalityOptions.length === 0,
        options: nationalityOptions,
      },
    ],
    [nationalityOptions]
  );

  const filterValues = { tag: tagFilter, activity: activityFilter, nationality: nationalityFilter };

  const setFilter = React.useCallback((key: string, value: string) => {
    if (key === "tag") setTagFilter(value);
    else if (key === "activity") setActivityFilter(value);
    else if (key === "nationality") setNationalityFilter(value);
  }, []);

  const clearAllFilters = React.useCallback(() => {
    setTagFilter("all");
    setActivityFilter("all");
    setNationalityFilter("all");
  }, []);

  const isFiltered =
    globalFilter.trim().length > 0 ||
    tagFilter !== "all" ||
    activityFilter !== "all" ||
    nationalityFilter !== "all";

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
      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-4 rounded-lg text-sm"
          onPress={() => {
            clearAllFilters();
            setGlobalFilter("");
          }}
        >
          Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar + active-filter chips */}
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <TableSearchField
                ariaLabel="Search guests"
                value={globalFilter}
                onChange={setGlobalFilter}
                placeholder="Search name, email, phone…"
                className="max-w-xs"
              />
              <EntityFilters
                fields={filterFields}
                values={filterValues}
                onChange={setFilter}
                onClearAll={clearAllFilters}
                filteredCount={filteredCount}
                resultNoun="guest"
              />
            </div>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <EntityFilterChips
            fields={filterFields}
            values={filterValues}
            onChange={setFilter}
            onClearAll={clearAllFilters}
          />
        </div>

        {/* Desktop table view */}
        {viewMode === "table" && (
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
                    data-guest-id={row.original.id}
                    ref={(el: HTMLElement | null) => {
                      if (el) attachGuestRef(el as unknown as HTMLDivElement);
                    }}
                    onAction={() => handleGuestClick(row.original)}
                    onHoverStart={() => hoverPrefetch(row.original.id)}
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
        )}

        {/* Desktop grid view */}
        {viewMode === "grid" &&
          (rows.length > 0 ? (
            <div className="hidden space-y-4 md:block">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {rows.map(({ original: guest }) => (
                  <div key={guest.id} ref={attachGuestRef} data-guest-id={guest.id}>
                    <GuestCard guest={guest} currency={currency} onSelect={handleGuestClick} onHoverPrefetch={hoverPrefetch} />
                  </div>
                ))}
              </div>
              <HeroTablePagination
                table={table}
                totalRows={totalCount}
                filteredRows={filteredCount}
              />
            </div>
          ) : (
            <div className="hidden md:block">{emptyState}</div>
          ))}

        {/* Mobile cards — always */}
        <div className="space-y-3 md:hidden">
          {rows.length > 0 ? (
            <>
              {rows.map(({ original: guest }) => (
                <div key={guest.id} ref={attachGuestRef} data-guest-id={guest.id}>
                  <GuestCard guest={guest} currency={currency} onSelect={handleGuestClick} onHoverPrefetch={hoverPrefetch} />
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
