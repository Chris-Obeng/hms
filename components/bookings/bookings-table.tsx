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
import { CalendarIcon } from "lucide-react";
import { Button, Table } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  SOURCE_BADGES,
  getPaymentLabel,
  getStatusLabel,
} from "@/lib/booking-status";
import { HeroTablePagination } from "@/components/ui/hero-table-pagination";
import { TableSearchField } from "@/components/ui/table-search-field";
import { ViewModeToggle } from "@/components/ui/view-mode-toggle";
import {
  ReservationFilters,
  ReservationFilterChips,
  type ReservationFilterState,
} from "@/components/bookings/reservation-filters";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";

// ── Types ──────────────────────────────────────────────────────────

export interface BookingRow {
  id: string;
  reference: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  roomType: string | null;
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  nights: number | null;
  status: string;
  paymentStatus: string;
  source: string;
  totalAmount: number;
  amountPaid: number;
  outstandingBalance: number | null;
  // Total rooms across the reservation; isGroup = linked multi-room reservation.
  roomsCount: number;
  isGroup: boolean;
  createdAt: string | null;
}

interface BookingsTableProps {
  data: BookingRow[];
  roomTypes: { id: string; name: string }[];
  currency: string;
  hotelId?: string;
}

// ── Status presentation ────────────────────────────────────────────

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
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-caption font-medium",
        cls
      )}
    >
      {kind === "status" ? getStatusLabel(value) : getPaymentLabel(value)}
    </span>
  );
}

// ── Reservation Card (grid / mobile) ───────────────────────────────

function ReservationCard({
  row,
  currency,
  onViewDetails,
}: {
  row: BookingRow;
  currency: string;
  onViewDetails: (id: string) => void;
}) {
  const source = SOURCE_BADGES[row.source] || SOURCE_BADGES.direct;
  const nights = row.nights ?? 0;
  const outstanding = row.outstandingBalance ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onViewDetails(row.id)}
      onKeyDown={(e) => e.key === "Enter" && onViewDetails(row.id)}
      className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-all duration-150 hover:border-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-foreground">{row.guestName}</p>
          <p className="font-mono text-caption tracking-wide text-muted-foreground">
            {row.reference}
          </p>
        </div>
        <StatusChip kind="status" value={row.status} />
      </div>

      <div className="flex items-center gap-1.5 rounded-xl bg-muted/40 px-3 py-2 text-caption text-muted-foreground">
        <CalendarIcon className="size-3 shrink-0" />
        <span>{formatDate(row.checkIn)}</span>
        <span className="text-muted-foreground/40">→</span>
        <span>{formatDate(row.checkOut)}</span>
        <span className="ml-auto font-medium tabular-nums text-foreground">
          {nights} night{nights !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-body font-semibold tabular-nums text-foreground">
            {formatCurrency(row.totalAmount, currency, { minimumFractionDigits: 0 })}
          </span>
          {outstanding > 0 && (
            <span className="text-[10px] font-medium text-rose-500">
              {formatCurrency(outstanding, currency, { minimumFractionDigits: 0 })} outstanding
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              source.bg,
              source.color
            )}
          >
            {source.label}
          </span>
          {row.roomsCount > 1 ? (
            <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-semibold text-foreground/80">
              {row.roomsCount} rooms
            </span>
          ) : (
            row.roomNumber && (
              <span className="text-caption font-medium tabular-nums text-foreground">
                Rm {row.roomNumber}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// Accessor columns kept for search/filtering but never shown in the table.
const HIDDEN_COLUMNS = new Set(["createdAt", "source"]);

// ── Main Component ─────────────────────────────────────────────────

export function BookingsTable({ data, roomTypes, currency, hotelId }: BookingsTableProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = React.useState<"table" | "grid">("table");
  // Rows arrive pre-sorted in front-desk working order (upcoming arrivals
  // first, then recent history); column sorting re-orders on demand.
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const searchParams = useSearchParams();
  // Seed the search box from ?search= (set by global search "See all")
  const [globalFilter, setGlobalFilter] = React.useState(() => searchParams.get("search") ?? "");

  // Realtime subscription — refresh on any booking change for this hotel
  const refreshRef = React.useRef(router.refresh.bind(router));
  React.useEffect(() => { refreshRef.current = router.refresh.bind(router); });

  React.useEffect(() => {
    if (!hotelId) return;
    const supabase = createClient();
    // Bulk operations emit one event per booking row; refresh once per burst.
    const refresh = createCoalescer();
    const channel = supabase
      .channel(`hotel:${hotelId}:bookings-list`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () => refresh.schedule(() => refreshRef.current()),
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

  // Selected filters
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [paymentFilter, setPaymentFilter] = React.useState<string>("all");
  const [sourceFilter, setSourceFilter] = React.useState<string>("all");
  const [roomTypeFilter, setRoomTypeFilter] = React.useState<string>("all");

  // Apply column filters from selections
  React.useEffect(() => {
    const filters: ColumnFiltersState = [];
    if (statusFilter !== "all") filters.push({ id: "status", value: statusFilter });
    if (paymentFilter !== "all") filters.push({ id: "paymentStatus", value: paymentFilter });
    if (sourceFilter !== "all") filters.push({ id: "source", value: sourceFilter });
    if (roomTypeFilter !== "all") filters.push({ id: "roomType", value: roomTypeFilter });
    setColumnFilters(filters);
  }, [statusFilter, paymentFilter, sourceFilter, roomTypeFilter]);

  // Adapter between the panel/chips (single {key,value}) and the 4 filter setters.
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

  // ── Columns ────────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<BookingRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Created",
      },
      {
        // Hidden — backs the Source filter with an exact match.
        accessorKey: "source",
        header: "Source",
        filterFn: (row, id, value) => row.getValue(id) === value,
      },
      {
        accessorKey: "guestName",
        header: "Guest",
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="max-w-[170px] truncate text-body font-medium text-foreground">
              {row.original.guestName}
            </span>
            <span className="font-mono text-caption tracking-wide text-muted-foreground">
              {row.original.reference}
              {" · "}
              {(SOURCE_BADGES[row.original.source] || SOURCE_BADGES.direct).label}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "roomType",
        header: "Stay",
        filterFn: (row, id, value) => row.getValue(id) === value,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="whitespace-nowrap text-body text-foreground">
              {formatDate(row.original.checkIn)} → {formatDate(row.original.checkOut)}
            </span>
            <span className="whitespace-nowrap text-caption text-muted-foreground">
              {row.original.nights ?? "—"} night{(row.original.nights ?? 0) !== 1 ? "s" : ""}
              {row.original.roomsCount > 1
                ? ` · ${row.original.roomsCount} rooms`
                : row.original.roomNumber
                  ? ` · Rm ${row.original.roomNumber}`
                  : row.original.roomType
                    ? ` · ${row.original.roomType}`
                    : ""}
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
            <span className="text-body font-medium tabular-nums text-foreground">
              {formatCurrency(row.original.totalAmount, currency)}
            </span>
            {(row.original.outstandingBalance ?? 0) > 0 && (
              <span className="text-[10px] font-medium text-rose-500">
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
  const isFiltered =
    globalFilter.trim().length > 0 ||
    statusFilter !== "all" ||
    paymentFilter !== "all" ||
    sourceFilter !== "all" ||
    roomTypeFilter !== "all";

  const emptyState = (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <CalendarIcon className="mb-3 size-10 text-muted-foreground/30" />
      <p className="text-body font-medium text-muted-foreground">
        {isFiltered ? "No reservations match your filters" : "No reservations yet"}
      </p>
      <p className="mt-1 max-w-[280px] text-caption text-muted-foreground/60">
        {isFiltered
          ? "Try adjusting your search or filters."
          : "Reservations will appear here once guests start reserving rooms."}
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-page-title text-foreground">Reservations</h1>
      </div>

      {/* Toolbar + active-filter chips */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <TableSearchField
            ariaLabel="Search reservations"
            value={globalFilter}
            onChange={setGlobalFilter}
            placeholder="Search name, email, reference…"
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

      {/* Mobile cards — always */}
      <div className="space-y-4 md:hidden">
        {rows.length > 0 ? (
          <>
            {rows.map((row) => (
              <ReservationCard
                key={row.id}
                row={row.original}
                currency={currency}
                onViewDetails={handleViewDetails}
              />
            ))}
            <HeroTablePagination
              table={table}
              totalRows={totalCount}
              filteredRows={filteredCount}
            />
          </>
        ) : (
          emptyState
        )}
      </div>

      {/* Desktop grid view */}
      {viewMode === "grid" &&
        (rows.length > 0 ? (
          <div className="hidden space-y-4 md:block">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((row) => (
                <ReservationCard
                  key={row.id}
                  row={row.original}
                  currency={currency}
                  onViewDetails={handleViewDetails}
                />
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

      {/* Table view — desktop only */}
      {viewMode === "table" && (
        <Table variant="secondary" className="hidden md:block">
          <Table.ScrollContainer>
            <Table.Content aria-label="Reservations" className="min-w-[820px]">
              <Table.Header>
                {table.getHeaderGroups()[0]?.headers.map((header) => (
                  <Table.Column
                    key={header.id}
                    allowsSorting={
                      ["guestName", "roomType", "status", "paymentStatus", "totalAmount"].includes(
                        header.id
                      )
                    }
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
                    onAction={() => handleViewDetails(row.original.id)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <Table.Cell key={cell.id} className={HIDDEN_COLUMNS.has(cell.column.id) ? "hidden" : undefined}>
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

      {/* Reservation Detail Drawer */}
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
