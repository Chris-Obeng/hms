"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { CalendarDays, Plus } from "lucide-react";
import { Avatar, Button, Card, Chip, SearchField } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatRoomLabel, getInitials } from "@/lib/format";
import { getPaymentLabel, getSourceLabel } from "@/lib/booking-status";
import type { BookingRow } from "@/lib/bookings/reservation-rows";
import { ListEmpty, ListPager, SortLabel } from "@/components/ui/list-card";
import { LIST_CARD, LIST_HEADER, LIST_ROWS } from "@/components/ui/list-styles";
import {
  ReservationFilters,
  ReservationFilterChips,
  type ReservationFilterState,
} from "@/components/bookings/reservation-filters";
import { BookingStatusPill } from "@/components/bookings/_components/booking-status-pill";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { CAPS, onIdle, isFresh } from "@/lib/cache/prefetch-helpers";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";

export type { BookingRow };

interface BookingsTableProps {
  data: BookingRow[];
  roomTypes: { id: string; name: string }[];
  currency: string;
  hotelId?: string;
}

const PAYMENT_CHIP: Record<string, "success" | "warning" | "danger" | "default"> = {
  paid: "success",
  partial: "warning",
  unpaid: "default",
  refunded: "danger",
};

const exact = (row: { getValue: (id: string) => unknown }, id: string, value: unknown) => row.getValue(id) === value;

/** One column template for the header band and every row (lg and up; rows stack below). */
const RES_GRID =
  "lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_8rem_6rem_8rem] lg:items-center lg:gap-4";

export function BookingsTable({ data, roomTypes, currency, hotelId }: BookingsTableProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const searchParams = useSearchParams();
  const [globalFilter, setGlobalFilter] = React.useState(() => searchParams.get("search") ?? "");

  const refreshRef = React.useRef(router.refresh.bind(router));
  React.useEffect(() => {
    refreshRef.current = router.refresh.bind(router);
  });

  // Realtime: any booking change for this hotel refreshes the server list (coalesced).
  React.useEffect(() => {
    if (!hotelId) return;
    const supabase = createClient();
    const refresh = createCoalescer();
    const channel = supabase
      .channel(`hotel:${hotelId}:bookings-list`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () => refresh.schedule(() => refreshRef.current())
      )
      .subscribe(onRealtimeStatus({ label: "bookings-list", hotelId, table: "bookings" }));
    return () => {
      refresh.cancel();
      supabase.removeChannel(channel);
    };
  }, [hotelId]);

  const [detailBookingId, setDetailBookingId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailInitialTab, setDetailInitialTab] = React.useState<"overview" | "payments">("overview");

  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [paymentFilter, setPaymentFilter] = React.useState<string>("all");
  const [sourceFilter, setSourceFilter] = React.useState<string>("all");
  const [roomTypeFilter, setRoomTypeFilter] = React.useState<string>("all");

  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    if (statusFilter !== "all") filters.push({ id: "status", value: statusFilter });
    if (paymentFilter !== "all") filters.push({ id: "paymentStatus", value: paymentFilter });
    if (sourceFilter !== "all") filters.push({ id: "source", value: sourceFilter });
    if (roomTypeFilter !== "all") filters.push({ id: "roomType", value: roomTypeFilter });
    return filters;
  }, [statusFilter, paymentFilter, sourceFilter, roomTypeFilter]);

  const selectedFilters: ReservationFilterState = {
    status: statusFilter,
    payment: paymentFilter,
    source: sourceFilter,
    roomType: roomTypeFilter,
  };
  const setFilter = React.useCallback((key: keyof ReservationFilterState, value: string) => {
    if (key === "status") setStatusFilter(value);
    else if (key === "payment") setPaymentFilter(value);
    else if (key === "source") setSourceFilter(value);
    else if (key === "roomType") setRoomTypeFilter(value);
  }, []);
  const clearAllFilters = React.useCallback(() => {
    setStatusFilter("all");
    setPaymentFilter("all");
    setSourceFilter("all");
    setRoomTypeFilter("all");
  }, []);

  const handleViewDetails = React.useCallback((id: string) => {
    setDetailInitialTab("overview");
    setDetailBookingId(id);
    setDetailOpen(true);
  }, []);

  const openNewBooking = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent("roomline:new-booking"));
  }, []);

  const hoverPrefetch = React.useCallback(
    (id: string) => {
      if (isFresh(queryClient, bookingDetailCache.key(id))) return;
      void queryClient.prefetchQuery(bookingDetailCache.options(id));
    },
    [queryClient]
  );

  // Data model only; layout lives in the row markup.
  const columns = React.useMemo<ColumnDef<BookingRow>[]>(
    () => [
      { accessorKey: "guestName" },
      { accessorKey: "checkIn" },
      { accessorKey: "source", enableSorting: false, filterFn: exact },
      { accessorKey: "roomType", enableSorting: false, filterFn: exact },
      { accessorKey: "status", filterFn: exact },
      { accessorKey: "paymentStatus", filterFn: exact },
      { accessorKey: "totalAmount" },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const b = row.original;
      const search = filterValue.toLowerCase();
      return (
        b.guestName.toLowerCase().includes(search) ||
        b.reference.toLowerCase().includes(search) ||
        (b.guestEmail || "").toLowerCase().includes(search) ||
        (b.guestPhone || "").toLowerCase().includes(search) ||
        (b.roomType || "").toLowerCase().includes(search)
      );
    },
    initialState: { pagination: { pageSize: 15 } },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const rows = table.getRowModel().rows;

  // Idle tier: warm visible rows' details once the main thread is free.
  const visibleIdsKey = React.useMemo(() => rows.slice(0, CAPS.clientIdle).map((r) => r.original.id).join(","), [rows]);
  React.useEffect(() => {
    if (!visibleIdsKey) return;
    const ids = visibleIdsKey.split(",").filter(Boolean);
    return onIdle(() => {
      for (const id of ids) {
        if (isFresh(queryClient, bookingDetailCache.key(id))) continue;
        void queryClient.prefetchQuery(bookingDetailCache.options(id));
      }
    });
  }, [visibleIdsKey, queryClient]);

  // Viewport tier: rows that scroll near the screen prefetch, capped.
  const observedRef = React.useRef<Set<string>>(new Set());
  const rowObserverRef = React.useRef<IntersectionObserver | null>(null);
  const getRowObserver = React.useCallback(() => {
    if (rowObserverRef.current) return rowObserverRef.current;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return null;
    rowObserverRef.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset.bookingId;
          if (!id || observedRef.current.has(id)) continue;
          observedRef.current.add(id);
          rowObserverRef.current?.unobserve(e.target);
          if (isFresh(queryClient, bookingDetailCache.key(id))) continue;
          if (observedRef.current.size > CAPS.serverWarm + CAPS.viewportAhead) continue;
          void queryClient.prefetchQuery(bookingDetailCache.options(id));
        }
      },
      { rootMargin: "400px" }
    );
    return rowObserverRef.current;
  }, [queryClient]);

  const attachRowRef = React.useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const id = el.dataset.bookingId;
      if (!id || observedRef.current.has(id)) return;
      getRowObserver()?.observe(el);
    },
    [getRowObserver]
  );
  React.useEffect(() => () => rowObserverRef.current?.disconnect(), []);

  const isFiltered =
    globalFilter.trim().length > 0 ||
    statusFilter !== "all" ||
    paymentFilter !== "all" ||
    sourceFilter !== "all" ||
    roomTypeFilter !== "all";

  const sortOf = (id: string) => table.getColumn(id)?.getIsSorted() ?? false;
  const toggleOf = (id: string) => table.getColumn(id)?.getToggleSortingHandler();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pt-6 md:pt-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Reservations</h1>
        <Button variant="primary" onPress={openNewBooking} className="rounded-xl font-semibold max-md:h-11">
          <Plus className="size-4" aria-hidden="true" />
          New booking
        </Button>
      </header>

      <Card className={LIST_CARD}>
        {/* Toolbar */}
        <div className="flex flex-col gap-3 p-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              aria-label="Search reservations"
              value={globalFilter}
              onChange={setGlobalFilter}
              className="min-w-0 flex-1 md:max-w-72 md:flex-none md:basis-72"
            >
              <SearchField.Group className="w-full rounded-xl max-md:h-11">
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search reservations" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <ReservationFilters
              filters={selectedFilters}
              onChange={setFilter}
              onClearAll={clearAllFilters}
              roomTypes={roomTypes}
              filteredCount={filteredCount}
            />
          </div>
          <ReservationFilterChips filters={selectedFilters} onChange={setFilter} onClearAll={clearAllFilters} />
        </div>

        {rows.length > 0 && (
          <div className={cn(RES_GRID, LIST_HEADER)}>
            <SortLabel label="Guest" sorted={sortOf("guestName")} onToggle={toggleOf("guestName")} />
            <SortLabel label="Stay" sorted={sortOf("checkIn")} onToggle={toggleOf("checkIn")} />
            <SortLabel label="Status" sorted={sortOf("status")} onToggle={toggleOf("status")} />
            <SortLabel label="Payment" sorted={sortOf("paymentStatus")} onToggle={toggleOf("paymentStatus")} />
            <SortLabel label="Total" align="end" sorted={sortOf("totalAmount")} onToggle={toggleOf("totalAmount")} />
          </div>
        )}

        {rows.length === 0 ? (
          <ListEmpty
            icon={CalendarDays}
            title={isFiltered ? "No reservations match" : "No reservations yet"}
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
            {rows.map(({ original: row }) => (
              <li key={row.id} ref={attachRowRef} data-booking-id={row.id}>
                <ReservationRow row={row} currency={currency} onOpen={handleViewDetails} onPrefetch={hoverPrefetch} />
              </li>
            ))}
          </ul>
        )}

        <ListPager table={table} total={filteredCount} noun="reservation" />
      </Card>

      <BookingDetailDrawer
        bookingId={detailBookingId}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailBookingId(null);
        }}
        currency={currency}
        initialTab={detailInitialTab}
        onBookingChanged={() => router.refresh()}
      />
    </div>
  );
}

/** One reservation: a single button that stacks below lg and fills the grid from lg. */
function ReservationRow({
  row,
  currency,
  onOpen,
  onPrefetch,
}: {
  row: BookingRow;
  currency: string;
  onOpen: (id: string) => void;
  onPrefetch: (id: string) => void;
}) {
  const nights = row.nights ?? 0;
  const outstanding = row.outstandingBalance ?? 0;
  const room =
    row.roomsCount > 1
      ? `${row.roomsCount} rooms`
      : formatRoomLabel(row.roomNumber) ?? row.roomType ?? "Unassigned";
  const dates = `${formatDate(row.checkIn, "MMM d")} – ${formatDate(row.checkOut, "MMM d")}`;
  const stayMeta = `${nights} ${nights === 1 ? "night" : "nights"} · ${room}`;
  const total = formatCurrency(row.totalAmount, currency);
  const due = outstanding > 0 ? `${formatCurrency(outstanding, currency, { minimumFractionDigits: 0 })} due` : null;
  const payment = (
    <Chip size="sm" variant="soft" color={PAYMENT_CHIP[row.paymentStatus] ?? "default"}>
      {getPaymentLabel(row.paymentStatus)}
    </Chip>
  );

  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      onPointerEnter={() => onPrefetch(row.id)}
      onFocus={() => onPrefetch(row.id)}
      className={cn(
        RES_GRID,
        "block w-full px-4 py-3 text-left outline-none transition-colors duration-150 focus-visible:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary/40"
      )}
    >
      {/* Guest; below lg this cell also carries the stay, status and money */}
      <span className="flex w-full min-w-0 items-start gap-3 lg:items-center">
        <Avatar size="sm" className="shrink-0" aria-hidden="true">
          <Avatar.Fallback className="font-semibold">{getInitials(row.guestName)}</Avatar.Fallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{row.guestName}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            <span className="font-mono">{row.reference}</span> ·{" "}
            <span className="lg:hidden">{room}</span>
            <span className="hidden lg:inline">{getSourceLabel(row.source)}</span>
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground lg:hidden">
            <span className="tabular-nums text-foreground">{dates}</span> · {nights} {nights === 1 ? "night" : "nights"}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 lg:hidden">
          <BookingStatusPill status={row.status} />
          <span className="text-sm font-semibold tabular-nums text-foreground">{total}</span>
          {due && <span className="text-xs font-medium tabular-nums text-danger">{due}</span>}
        </span>
      </span>

      {/* lg and up */}
      <span className="hidden min-w-0 lg:block">
        <span className="block truncate text-sm font-medium tabular-nums text-foreground">{dates}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{stayMeta}</span>
      </span>
      <span className="hidden lg:block">
        <BookingStatusPill status={row.status} />
      </span>
      <span className="hidden lg:block">{payment}</span>
      <span className="hidden text-right lg:block">
        <span className="block text-sm font-semibold tabular-nums text-foreground">{total}</span>
        {due && <span className="mt-1 block text-xs font-medium tabular-nums text-danger">{due}</span>}
      </span>
    </button>
  );
}
