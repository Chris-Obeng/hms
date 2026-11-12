"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { CalendarIcon, Plus } from "lucide-react";
import { Button, Table } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatRoomLabel, getInitials } from "@/lib/format";
import {
  SOURCE_BADGES,
  getPaymentLabel,
  getStatusLabel,
} from "@/lib/booking-status";
import type { BookingRow } from "@/lib/bookings/reservation-rows";
import { HeroTablePagination } from "@/components/ui/hero-table-pagination";
import { TableSearchField } from "@/components/ui/table-search-field";
import { ViewModeToggle } from "@/components/ui/view-mode-toggle";
import {
  ReservationFilters,
  ReservationFilterChips,
  type ReservationFilterState,
} from "@/components/bookings/reservation-filters";
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

function StatusChip({ kind, value }: { kind: "status" | "payment"; value: string }) {
  const cls =
    kind === "status"
      ? value === "confirmed"
        ? "status-confirmed"
        : value === "checked_in"
          ? "status-checked-in"
          : value === "pending"
            ? "status-pending"
            : value === "cancelled" || value === "no_show"
              ? "status-cancelled"
              : "status-checked-out"
      : value === "paid"
        ? "status-confirmed"
        : value === "partial"
          ? "status-pending"
          : value === "refunded"
            ? "status-cancelled"
            : "status-checked-out";

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium",
        cls
      )}
    >
      {kind === "status" ? getStatusLabel(value) : getPaymentLabel(value)}
    </span>
  );
}

function ReservationCard({
  row,
  currency,
  onViewDetails,
  onHoverPrefetch,
}: {
  row: BookingRow;
  currency: string;
  onViewDetails: (id: string) => void;
  onHoverPrefetch?: (id: string) => void;
}) {
  const source = SOURCE_BADGES[row.source] || SOURCE_BADGES.direct;
  const nights = row.nights ?? 0;
  const outstanding = row.outstandingBalance ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onViewDetails(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onViewDetails(row.id);
        }
      }}
      onPointerEnter={() => onHoverPrefetch?.(row.id)}
      onFocus={() => onHoverPrefetch?.(row.id)}
      className="ui-press flex cursor-pointer flex-col gap-3 rounded-[20px] border border-border/60 bg-card p-4 shadow-[0_1px_3px_rgb(0_0_0/0.04)] outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:border-border"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground"
          >
            {getInitials(row.guestName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{row.guestName}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {row.reference} · {source.label}
            </p>
          </div>
        </div>
        <StatusChip kind="status" value={row.status} />
      </div>

      <div className="flex items-center gap-1.5 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="tabular-nums text-foreground">{formatDate(row.checkIn, "MMM d")}</span>
        <span className="text-muted-foreground/50">→</span>
        <span className="tabular-nums text-foreground">
          {formatDate(row.checkOut, "MMM d, yyyy")}
        </span>
        <span className="ml-auto font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
          {nights}n
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(row.totalAmount, currency, { minimumFractionDigits: 0 })}
          </span>
          {outstanding > 0 ? (
            <span className="text-[11px] font-medium tabular-nums text-destructive">
              {formatCurrency(outstanding, currency, { minimumFractionDigits: 0 })} due
            </span>
          ) : (
            <span className="text-[11px] text-emerald-600">{getPaymentLabel(row.paymentStatus)}</span>
          )}
        </div>

        <span className="truncate text-xs font-medium text-muted-foreground">
          {row.roomsCount > 1
            ? `${row.roomsCount} rooms`
            : formatRoomLabel(row.roomNumber) ?? row.roomType ?? "Unassigned"}
        </span>
      </div>
    </div>
  );
}

const HIDDEN_COLUMNS = new Set(["createdAt", "source"]);

export function BookingsTable({ data, roomTypes, currency, hotelId }: BookingsTableProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [viewMode, setViewMode] = React.useState<"table" | "grid">("table");
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const searchParams = useSearchParams();
  const [globalFilter, setGlobalFilter] = React.useState(
    () => searchParams.get("search") ?? ""
  );

  const refreshRef = React.useRef(router.refresh.bind(router));
  React.useEffect(() => {
    refreshRef.current = router.refresh.bind(router);
  });

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
  const [detailInitialTab, setDetailInitialTab] = React.useState<"overview" | "payments">(
    "overview"
  );

  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [paymentFilter, setPaymentFilter] = React.useState<string>("all");
  const [sourceFilter, setSourceFilter] = React.useState<string>("all");
  const [roomTypeFilter, setRoomTypeFilter] = React.useState<string>("all");

  React.useEffect(() => {
    const filters: ColumnFiltersState = [];
    if (statusFilter !== "all") filters.push({ id: "status", value: statusFilter });
    if (paymentFilter !== "all") filters.push({ id: "paymentStatus", value: paymentFilter });
    if (sourceFilter !== "all") filters.push({ id: "source", value: sourceFilter });
    if (roomTypeFilter !== "all") filters.push({ id: "roomType", value: roomTypeFilter });
    setColumnFilters(filters);
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

  const columns = React.useMemo<ColumnDef<BookingRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Created",
      },
      {
        accessorKey: "source",
        header: "Source",
        filterFn: (row, id, value) => row.getValue(id) === value,
      },
      {
        accessorKey: "guestName",
        header: "Guest",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground"
            >
              {getInitials(row.original.guestName)}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="max-w-[190px] truncate text-sm font-semibold text-foreground">
                {row.original.guestName}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {row.original.reference}
                {" · "}
                {(SOURCE_BADGES[row.original.source] || SOURCE_BADGES.direct).label}
              </span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "roomType",
        header: "Stay",
        filterFn: (row, id, value) => row.getValue(id) === value,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-foreground">
              {formatDate(row.original.checkIn, "MMM d")} →{" "}
              {formatDate(row.original.checkOut, "MMM d, yyyy")}
            </span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {row.original.nights ?? "—"}n
              {row.original.roomsCount > 1
                ? ` · ${row.original.roomsCount} rooms`
                : row.original.roomNumber
                  ? ` · ${formatRoomLabel(row.original.roomNumber)}`
                  : row.original.roomType
                    ? ` · ${row.original.roomType}`
                    : " · Unassigned"}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        filterFn: (row, id, value) => row.getValue(id) === value,
        cell: ({ row }) => <StatusChip kind="status" value={row.original.status} />,
      },
      {
        accessorKey: "paymentStatus",
        header: "Payment",
        filterFn: (row, id, value) => row.getValue(id) === value,
        cell: ({ row }) => <StatusChip kind="payment" value={row.original.paymentStatus} />,
      },
      {
        accessorKey: "totalAmount",
        header: "Total",
        cell: ({ row }) => (
          <div className="flex flex-col whitespace-nowrap">
            <span className="text-[13px] font-semibold tabular-nums text-foreground">
              {formatCurrency(row.original.totalAmount, currency)}
            </span>
            {(row.original.outstandingBalance ?? 0) > 0 && (
              <span className="text-[11px] font-medium tabular-nums text-destructive">
                {formatCurrency(row.original.outstandingBalance ?? 0, currency, {
                  minimumFractionDigits: 0,
                })}{" "}
                due
              </span>
            )}
          </div>
        ),
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
    initialState: {
      pagination: {
        pageSize: 15,
      },
    },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const rows = table.getRowModel().rows;
  const visibleIdsKey = React.useMemo(
    () => rows.slice(0, CAPS.clientIdle).map((r) => r.original.id).join(","),
    [rows]
  );
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
    (el: HTMLDivElement | null) => {
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

  const emptyState = (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="mb-3 grid size-11 place-items-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground"
      >
        <CalendarIcon className="size-5" />
      </span>
      <p className="text-sm font-semibold text-foreground">
        {isFiltered ? "No matching reservations" : "No reservations yet"}
      </p>
      {isFiltered ? (
        <Button
          variant="outline"
          size="sm"
          className="ui-press mt-3 rounded-xl text-xs font-semibold"
          onPress={() => {
            clearAllFilters();
            setGlobalFilter("");
          }}
        >
          Clear filters
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          className="ui-press mt-3 rounded-xl text-xs font-semibold"
          onPress={openNewBooking}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          New booking
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 pt-1 md:space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[24px]">
            Reservations
          </h1>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
            {isFiltered
              ? `${filteredCount} of ${totalCount} shown`
              : `${totalCount} ${totalCount === 1 ? "reservation" : "reservations"}`}
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onPress={openNewBooking}
          className="ui-press inline-flex h-11 shrink-0 gap-1.5 rounded-xl px-3.5 text-xs font-semibold shadow-2xs sm:h-9"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          New booking
        </Button>
      </header>

      {/* Toolbar + active-filter chips */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <TableSearchField
            ariaLabel="Search reservations"
            value={globalFilter}
            onChange={setGlobalFilter}
            placeholder="Search guest, email, reference…"
          />
          <ReservationFilters
            filters={selectedFilters}
            onChange={setFilter}
            onClearAll={clearAllFilters}
            roomTypes={roomTypes}
            filteredCount={filteredCount}
          />
          <ViewModeToggle value={viewMode} onChange={setViewMode} className="ml-auto" />
        </div>
        <ReservationFilterChips
          filters={selectedFilters}
          onChange={setFilter}
          onClearAll={clearAllFilters}
        />
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.length > 0 ? (
          <>
            {rows.map((row) => (
              <div key={row.id} ref={attachRowRef} data-booking-id={row.original.id}>
                <ReservationCard
                  row={row.original}
                  currency={currency}
                  onViewDetails={handleViewDetails}
                  onHoverPrefetch={hoverPrefetch}
                />
              </div>
            ))}
            <HeroTablePagination
              table={table}
              totalRows={totalCount}
              filteredRows={filteredCount}
            />
          </>
        ) : (
          <div className="rounded-[20px] border border-border/60 bg-card">{emptyState}</div>
        )}
      </div>

      {/* Desktop grid view */}
      {viewMode === "grid" &&
        (rows.length > 0 ? (
          <div className="hidden space-y-4 md:block">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((row) => (
                <div key={row.id} ref={attachRowRef} data-booking-id={row.original.id}>
                  <ReservationCard
                    row={row.original}
                    currency={currency}
                    onViewDetails={handleViewDetails}
                    onHoverPrefetch={hoverPrefetch}
                  />
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
          <div className="hidden rounded-[20px] border border-border/60 bg-card md:block">
            {emptyState}
          </div>
        ))}

      {/* Desktop table view */}
      {viewMode === "table" && (
        <div className="hidden overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-[0_1px_3px_rgb(0_0_0/0.04)] md:block">
          <Table variant="secondary">
            <Table.ScrollContainer>
              <Table.Content aria-label="Reservations" className="min-w-[760px]">
                <Table.Header>
                  {table.getHeaderGroups()[0]?.headers.map((header) => (
                    <Table.Column
                      key={header.id}
                      allowsSorting={[
                        "guestName",
                        "roomType",
                        "status",
                        "paymentStatus",
                        "totalAmount",
                      ].includes(header.id)}
                      id={header.id}
                      isRowHeader={header.id === "guestName"}
                      className={HIDDEN_COLUMNS.has(header.id) ? "hidden" : undefined}
                    >
                      {({ sortDirection }) =>
                        HIDDEN_COLUMNS.has(header.id) ? null : (
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
                      data-booking-id={row.original.id}
                      ref={(el: HTMLElement | null) => {
                        if (el) attachRowRef(el as unknown as HTMLDivElement);
                      }}
                      onAction={() => handleViewDetails(row.original.id)}
                      onHoverStart={() => hoverPrefetch(row.original.id)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <Table.Cell
                          key={cell.id}
                          className={HIDDEN_COLUMNS.has(cell.column.id) ? "hidden" : undefined}
                        >
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
        </div>
      )}

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
