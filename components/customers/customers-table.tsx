"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import { Users } from "lucide-react";
import { Avatar, Button, Card, Chip, SearchField } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, getInitials } from "@/lib/format";
import { EntityFilters, EntityFilterChips, type FilterFieldConfig } from "@/components/ui/entity-filters";
import { ListEmpty, ListPager, SortLabel } from "@/components/ui/list-card";
import { LIST_CARD, LIST_HEADER, LIST_ROWS } from "@/components/ui/list-styles";
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

type ChipColor = "warning" | "accent" | "danger" | "success" | "default";

const TAG_CHIP_COLOR: Record<string, ChipColor> = {
  vip: "warning",
  vip_plus: "warning",
  corporate: "accent",
  flagged: "danger",
  new: "success",
};

export function getTagColor(tag: string): ChipColor {
  return TAG_CHIP_COLOR[tag.toLowerCase()] || "default";
}

/** "vip" → "VIP", "vip_plus" → "VIP plus", "returning" → "Returning". */
export function tagLabel(tag: string) {
  const words = tag.replace(/_/g, " ").trim();
  if (/^vip\b/i.test(words)) return words.replace(/^vip/i, "VIP");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ALL_TAG_OPTIONS = ["vip", "regular", "flagged", "corporate", "new", "returning"];
const TAG_OPTIONS = ALL_TAG_OPTIONS.map((t) => ({ value: t, label: tagLabel(t) }));

const ACTIVITY_OPTIONS = [
  { value: "returning", label: "Returning" },
  { value: "first_time", label: "First stay" },
  { value: "no_stays", label: "No stays" },
];

function activityBucket(totalStays: number) {
  return totalStays >= 2 ? "returning" : totalStays === 1 ? "first_time" : "no_stays";
}

/** One column template for the header band and every row (lg and up; rows stack below). */
const GUEST_GRID =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_12rem_4rem_8rem_8rem] lg:items-center lg:gap-4 xl:grid-cols-[minmax(0,1fr)_13rem_5rem_9rem_9rem]";

// ── Main Component ─────────────────────────────────────────────────

export function CustomersTable({ data, currency }: CustomersTableProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Newest guests first by default (server pre-sorts created_at desc)
  const [sorting, setSorting] = React.useState<SortingState>([]);
  // Seed the search box from ?search= (set by global search "See all")
  const [globalFilter, setGlobalFilter] = React.useState(() => searchParams.get("search") ?? "");
  const [tagFilter, setTagFilter] = React.useState("all");
  const [activityFilter, setActivityFilter] = React.useState("all");
  const [nationalityFilter, setNationalityFilter] = React.useState("all");
  const [selectedGuest, setSelectedGuest] = React.useState<GuestRow | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  // Edits saved inside the detail sheet are merged here so rows and re-opened
  // sheets reflect them immediately. Fresh server data clears them (render-time
  // reset, so no stale frame).
  const [guestOverrides, setGuestOverrides] = React.useState<Record<string, Partial<GuestRow>>>({});
  const [overridesFor, setOverridesFor] = React.useState(data);
  if (overridesFor !== data) {
    setOverridesFor(data);
    setGuestOverrides({});
  }

  const handleGuestUpdated = React.useCallback(
    (guestId: string, patch: Partial<GuestRow>) => {
      setGuestOverrides((prev) => ({ ...prev, [guestId]: { ...prev[guestId], ...patch } }));
      setSelectedGuest((prev) => (prev && prev.id === guestId ? { ...prev, ...patch } : prev));
    },
    []
  );

  const enrichedData = React.useMemo(
    () => data.map((g) => (guestOverrides[g.id] ? { ...g, ...guestOverrides[g.id] } : g)),
    [data, guestOverrides]
  );

  const hoverPrefetch = React.useCallback(
    (id: string) => {
      if (isFresh(queryClient, guestBookingsCache.key(id))) return;
      void queryClient.prefetchQuery(guestBookingsCache.options(id));
    },
    [queryClient]
  );

  // ?guestId= (from a reservation's "Guest profile" link) opens that guest.
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
  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    if (tagFilter !== "all") filters.push({ id: "tags", value: tagFilter });
    if (activityFilter !== "all") filters.push({ id: "activity", value: activityFilter });
    if (nationalityFilter !== "all") filters.push({ id: "nationality", value: nationalityFilter });
    return filters;
  }, [tagFilter, activityFilter, nationalityFilter]);

  // ── Columns (data model only; layout lives in the row markup) ──
  const columns = React.useMemo<ColumnDef<GuestRow>[]>(
    () => [
      { accessorKey: "fullName" },
      { accessorKey: "phone", enableSorting: false },
      { accessorKey: "nationality", enableSorting: false, filterFn: (row, id, value) => row.getValue(id) === value },
      { accessorKey: "totalStays" },
      { accessorKey: "totalSpend" },
      { accessorKey: "lastStayDate" },
      {
        accessorKey: "tags",
        enableSorting: false,
        filterFn: (row, id, filterValue) => (row.getValue(id) as string[]).includes(filterValue as string),
      },
      {
        id: "activity",
        accessorFn: (g) => activityBucket(g.totalStays),
        enableSorting: false,
        filterFn: (row, id, value) => row.getValue(id) === value,
      },
    ],
    []
  );

  const table = useReactTable({
    data: enrichedData,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
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
    initialState: { pagination: { pageSize: 15 } },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const rows = table.getRowModel().rows;

  // Idle tier: warm the visible guests' history once the main thread is free.
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

  // Viewport tier: rows that scroll near the screen prefetch, capped.
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
    (el: HTMLElement | null) => {
      if (!el) return;
      const id = el.dataset.guestId;
      if (!id || observedGuestRef.current.has(id)) return;
      getGuestObserver()?.observe(el);
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
      { key: "activity", label: "Stays", ariaLabel: "Filter by stay activity", allLabel: "Any stays", options: ACTIVITY_OPTIONS },
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
    globalFilter.trim().length > 0 || tagFilter !== "all" || activityFilter !== "all" || nationalityFilter !== "all";

  function handleGuestClick(guest: GuestRow) {
    setSelectedGuest(guest);
    setDetailOpen(true);
  }

  const sortOf = (id: string) => table.getColumn(id)?.getIsSorted() ?? false;
  const toggleOf = (id: string) => table.getColumn(id)?.getToggleSortingHandler();

  return (
    <>
      <div className="mx-auto w-full max-w-7xl space-y-6 pt-6 md:pt-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Guests</h1>

        <Card className={LIST_CARD}>
          {/* Toolbar */}
          <div className="flex flex-col gap-3 p-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <SearchField
                aria-label="Search guests"
                value={globalFilter}
                onChange={setGlobalFilter}
                className="min-w-0 flex-1 md:max-w-72 md:flex-none md:basis-72"
              >
                <SearchField.Group className="w-full rounded-xl max-md:h-11">
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="Search guests" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <EntityFilters
                fields={filterFields}
                values={filterValues}
                onChange={setFilter}
                onClearAll={clearAllFilters}
                filteredCount={filteredCount}
                resultNoun="guest"
              />
            </div>
            <EntityFilterChips fields={filterFields} values={filterValues} onChange={setFilter} onClearAll={clearAllFilters} />
          </div>

          {/* Column header band */}
          {rows.length > 0 && (
          <div className={cn(GUEST_GRID, LIST_HEADER)}>
            <SortLabel label="Guest" sorted={sortOf("fullName")} onToggle={toggleOf("fullName")} />
            <span>Phone</span>
            <SortLabel label="Stays" align="end" sorted={sortOf("totalStays")} onToggle={toggleOf("totalStays")} />
            <SortLabel label="Last stay" sorted={sortOf("lastStayDate")} onToggle={toggleOf("lastStayDate")} />
            <SortLabel label="Spent" align="end" sorted={sortOf("totalSpend")} onToggle={toggleOf("totalSpend")} />
          </div>
          )}

          {rows.length === 0 ? (
            <ListEmpty
              icon={Users}
              title={isFiltered ? "No guests match" : "No guests yet"}
              hint={isFiltered ? undefined : "Guests appear here after their first booking."}
              action={
                isFiltered ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="rounded-xl max-md:h-11"
                    onPress={() => {
                      clearAllFilters();
                      setGlobalFilter("");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className={LIST_ROWS}>
              {rows.map(({ original: guest }) => (
                <li key={guest.id} ref={attachGuestRef} data-guest-id={guest.id}>
                  <GuestListRow
                    guest={guest}
                    currency={currency}
                    onSelect={handleGuestClick}
                    onPrefetch={hoverPrefetch}
                  />
                </li>
              ))}
            </ul>
          )}

          <ListPager table={table} total={filteredCount} noun="guest" />
        </Card>
      </div>

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

/** One guest: a single button that stacks on phones and fills the grid from md. */
function GuestListRow({
  guest,
  currency,
  onSelect,
  onPrefetch,
}: {
  guest: GuestRow;
  currency: string;
  onSelect: (guest: GuestRow) => void;
  onPrefetch: (id: string) => void;
}) {
  const [firstTag, ...moreTags] = guest.tags;
  const lastStay = guest.lastStayDate ? formatDate(guest.lastStayDate, "MMM d, yyyy") : "—";
  const stays = `${guest.totalStays} ${guest.totalStays === 1 ? "stay" : "stays"}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(guest)}
      onPointerEnter={() => onPrefetch(guest.id)}
      onFocus={() => onPrefetch(guest.id)}
      className={cn(
        GUEST_GRID,
        "flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-150 focus-visible:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary/40"
      )}
    >
      {/* Guest */}
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar size="sm" className="shrink-0" aria-hidden="true">
          <Avatar.Fallback className="font-semibold">{getInitials(guest.fullName)}</Avatar.Fallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{guest.fullName}</span>
            {firstTag && (
              <Chip size="sm" variant="soft" color={getTagColor(firstTag)} className="shrink-0">
                {tagLabel(firstTag)}
                {moreTags.length > 0 && <span className="text-muted-foreground"> +{moreTags.length}</span>}
              </Chip>
            )}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            <span className="lg:hidden">{guest.phone || guest.email || "No contact"}</span>
            <span className="hidden lg:inline">{guest.email || "No email"}</span>
          </span>
        </span>
      </span>

      {/* Phones: spend + stays on the right */}
      <span className="shrink-0 text-right lg:hidden">
        <span className="block text-sm font-semibold tabular-nums text-foreground">{formatCurrency(guest.totalSpend, currency)}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{stays}</span>
      </span>

      <span className="hidden truncate text-sm tabular-nums text-foreground lg:block">{guest.phone || "—"}</span>
      <span className="hidden text-right text-sm tabular-nums text-foreground lg:block">{guest.totalStays}</span>
      <span className="hidden text-sm tabular-nums text-muted-foreground lg:block">{lastStay}</span>
      <span className="hidden text-right text-sm font-semibold tabular-nums text-foreground lg:block">
        {formatCurrency(guest.totalSpend, currency)}
      </span>
    </button>
  );
}
