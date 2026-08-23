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
import {
  CalendarIcon,
  Download,
  Eye,
  LayoutGrid,
  List,
  LogIn,
  LogOut,
  RotateCcw,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  Button,
  Dropdown,
  Label,
  SearchField,
  Table,
  ToggleButton,
  ToggleButtonGroup,
  toast,
} from "@heroui/react";
import type { Key } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  SOURCE_BADGES,
  getPaymentLabel,
  getStatusLabel,
} from "@/lib/booking-status";
import { downloadCsv, toCsv } from "@/lib/csv";
import { HeroSelectField } from "@/components/ui/hero-select";
import { HeroTablePagination } from "@/components/ui/hero-table-pagination";
import { NewBookingModal } from "@/components/bookings/new-booking-modal";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { updateBookingStatus } from "@/app/actions/bookings";
import { createClient } from "@/lib/supabase/client";

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

// ── Row actions ────────────────────────────────────────────────────

function BookingActions({
  booking,
  onViewDetails,
  onCheckIn,
  onCheckOut,
  onRequestCancel,
  onReinstate,
}: {
  booking: BookingRow;
  onViewDetails: (id: string) => void;
  onCheckIn: (booking: BookingRow) => void;
  onCheckOut: (booking: BookingRow) => void;
  onRequestCancel: (booking: BookingRow) => void;
  onReinstate: (booking: BookingRow) => void;
}) {
  return (
    <Dropdown>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={`Actions for booking ${booking.reference}`}
        className="size-8 min-w-8 rounded-lg text-muted-foreground"
      >
        <Eye className="size-4" />
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu>
          <Dropdown.Item id="view" textValue="View details" onAction={() => onViewDetails(booking.id)}>
            <Eye className="size-3.5" />
            <Label>View details</Label>
          </Dropdown.Item>
          {booking.status === "confirmed" && (
            <Dropdown.Item
              id="check-in"
              textValue="Check in"
              onAction={() => onCheckIn(booking)}
            >
              <LogIn className="size-3.5 text-emerald-500" />
              <Label>Check in</Label>
            </Dropdown.Item>
          )}
          {booking.status === "checked_in" && (
            <Dropdown.Item
              id="check-out"
              textValue="Check out"
              onAction={() => onCheckOut(booking)}
            >
              <LogOut className="size-3.5 text-amber-500" />
              <Label>Check out</Label>
            </Dropdown.Item>
          )}
          {(booking.status === "confirmed" || booking.status === "checked_in") && (
            <Dropdown.Item
              id="cancel"
              textValue="Cancel booking"
              variant="danger"
              onAction={() => onRequestCancel(booking)}
            >
              <XCircle className="size-3.5" />
              <Label>Cancel…</Label>
            </Dropdown.Item>
          )}
          {booking.status === "cancelled" && (
            <Dropdown.Item
              id="reinstate"
              textValue="Reinstate booking"
              onAction={() => onReinstate(booking)}
            >
              <RotateCcw className="size-3.5" />
              <Label>Reinstate</Label>
            </Dropdown.Item>
          )}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
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
          {row.roomNumber && (
            <span className="text-caption font-medium tabular-nums text-foreground">
              Rm {row.roomNumber}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filter Config ──────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked In" },
  { value: "checked_out", label: "Checked Out" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
  { value: "pending", label: "Pending" },
];

const PAYMENT_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "unpaid", label: "Unpaid" },
  { value: "refunded", label: "Refunded" },
];

const SOURCE_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "manual", label: "Manual" },
  { value: "phone", label: "Phone" },
  { value: "walk_in", label: "Walk-in" },
];

// ── CSV Export ─────────────────────────────────────────────────────

function exportToCsv(data: BookingRow[]) {
  const headers = [
    "Reference",
    "Guest",
    "Email",
    "Phone",
    "Room Type",
    "Room Number",
    "Check-In",
    "Check-Out",
    "Nights",
    "Status",
    "Payment",
    "Source",
    "Total",
    "Paid",
    "Outstanding",
  ];

  const rows = data.map((b) => [
    b.reference,
    b.guestName,
    b.guestEmail || "",
    b.guestPhone || "",
    b.roomType || "",
    b.roomNumber || "",
    b.checkIn,
    b.checkOut,
    b.nights?.toString() || "",
    getStatusLabel(b.status),
    getPaymentLabel(b.paymentStatus),
    SOURCE_BADGES[b.source]?.label || b.source,
    b.totalAmount.toString(),
    b.amountPaid.toString(),
    (b.outstandingBalance || 0).toString(),
  ]);

  downloadCsv(`bookings-${format(new Date(), "yyyy-MM-dd")}.csv`, toCsv(headers, rows));
}

// ── Main Component ─────────────────────────────────────────────────

export function BookingsTable({ data, roomTypes, currency, hotelId }: BookingsTableProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = React.useState<"table" | "grid">("table");
  // Rows arrive pre-sorted in front-desk working order (upcoming arrivals
  // first, then recent history); column sorting re-orders on demand.
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const searchParams = useSearchParams();
  const [newBookingOpen, setNewBookingOpen] = React.useState(
    () => searchParams.get("new") === "1"
  );

  React.useEffect(() => {
    if (searchParams.get("new") === "1") setNewBookingOpen(true);
  }, [searchParams]);

  // Realtime subscription — refresh on any booking change for this hotel
  const refreshRef = React.useRef(router.refresh.bind(router));
  React.useEffect(() => { refreshRef.current = router.refresh.bind(router); });

  React.useEffect(() => {
    if (!hotelId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`hotel:${hotelId}:bookings-list`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () => refreshRef.current(),
      )
      .subscribe();
    return () => {
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

  // Pending cancellation
  const [pendingCancel, setPendingCancel] = React.useState<BookingRow | null>(null);
  const [cancelling, setCancelling] = React.useState(false);

  // Apply column filters from selections
  React.useEffect(() => {
    const filters: ColumnFiltersState = [];
    if (statusFilter !== "all") filters.push({ id: "status", value: statusFilter });
    if (paymentFilter !== "all") filters.push({ id: "paymentStatus", value: paymentFilter });
    if (sourceFilter !== "all") filters.push({ id: "source", value: sourceFilter });
    if (roomTypeFilter !== "all") filters.push({ id: "roomType", value: roomTypeFilter });
    setColumnFilters(filters);
  }, [statusFilter, paymentFilter, sourceFilter, roomTypeFilter]);

  const handleViewDetails = React.useCallback((id: string) => {
    setDetailInitialTab("overview");
    setDetailBookingId(id);
    setDetailOpen(true);
  }, []);

  const runStatusUpdate = React.useCallback(
    async (booking: BookingRow, status: string, successMsg: string, errorMsg: string) => {
      const result = await updateBookingStatus(booking.id, status);
      if (result.success) {
        toast.success(successMsg);
        router.refresh();
      } else {
        toast.danger(result.error || errorMsg);
      }
    },
    [router]
  );

  const handleCancel = React.useCallback(async () => {
    if (!pendingCancel || cancelling) return;
    setCancelling(true);
    try {
      const result = await updateBookingStatus(pendingCancel.id, "cancelled");
      if (result.success) {
        toast.success("Booking cancelled");
        setPendingCancel(null);
        router.refresh();
      } else {
        toast.danger(result.error || "Cancel failed");
      }
    } finally {
      setCancelling(false);
    }
  }, [pendingCancel, cancelling, router]);

  // ── Columns ────────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<BookingRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Created",
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
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="whitespace-nowrap text-body text-foreground">
              {formatDate(row.original.checkIn)} → {formatDate(row.original.checkOut)}
            </span>
            <span className="whitespace-nowrap text-caption text-muted-foreground">
              {row.original.nights ?? "—"} night{(row.original.nights ?? 0) !== 1 ? "s" : ""}
              {row.original.roomNumber
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
      {
        id: "actions",
        cell: ({ row }) => {
          const booking = row.original;
          return (
            <BookingActions
              booking={booking}
              onViewDetails={handleViewDetails}
              onCheckIn={(b) =>
                void runStatusUpdate(b, "checked_in", `${b.guestName} checked in`, "Check-in failed")
              }
              onCheckOut={(b) =>
                void runStatusUpdate(b, "checked_out", `${b.guestName} checked out`, "Check-out failed")
              }
              onRequestCancel={setPendingCancel}
              onReinstate={(b) =>
                void runStatusUpdate(b, "confirmed", "Booking reinstated", "Reinstate failed")
              }
            />
          );
        },
      },
    ],
    [currency, handleViewDetails, runStatusUpdate]
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

  function handleViewModeSelect(keys: "all" | Set<Key>) {
    const first = keys instanceof Set && keys.size > 0 ? [...keys][0] : null;
    if (first === "table" || first === "grid") setViewMode(first);
  }

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
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title text-foreground">Reservations</h1>
          <p className="mt-0.5 text-body text-muted-foreground">
            {totalCount} total reservation{totalCount !== 1 ? "s" : ""}
            {filteredCount !== totalCount && (
              <span className="text-muted-foreground/60"> · {filteredCount} visible</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle — desktop only; mobile always uses cards */}
          <ToggleButtonGroup
            selectionMode="single"
            selectedKeys={new Set([viewMode])}
            onSelectionChange={handleViewModeSelect}
            className="hidden md:flex"
            aria-label="View mode"
          >
            <ToggleButton isIconOnly id="table" aria-label="Table view" size="sm">
              <List className="size-4" />
            </ToggleButton>
            <ToggleButton isIconOnly id="grid" aria-label="Grid view" size="sm">
              <ToggleButtonGroup.Separator />
              <LayoutGrid className="size-4" />
            </ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 rounded-xl text-sm"
            onPress={() => exportToCsv(data)}
          >
            <Download className="size-3.5" />
            Export
          </Button>
          <Button size="sm" onPress={() => setNewBookingOpen(true)} className="shrink-0">
            <span className="text-base leading-none">+</span>
            New Reservation
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          aria-label="Search reservations"
          value={globalFilter}
          onChange={setGlobalFilter}
          className="max-w-sm flex-1"
        >
          <SearchField.Group className="h-9 rounded-xl border-border/60 bg-background">
            <SearchField.SearchIcon />
            <SearchField.Input
              placeholder="Search name, email, reference..."
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

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
          <HeroSelectField
            className="w-40"
            label="Status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[{ value: "all", label: "All" }, ...STATUS_OPTIONS]}
            ariaLabel="Booking status"
          />
          <HeroSelectField
            className="w-40"
            label="Payment"
            value={paymentFilter}
            onValueChange={setPaymentFilter}
            options={[{ value: "all", label: "All" }, ...PAYMENT_OPTIONS]}
            ariaLabel="Payment status"
          />
          <HeroSelectField
            className="w-40"
            label="Source"
            value={sourceFilter}
            onValueChange={setSourceFilter}
            options={[{ value: "all", label: "All" }, ...SOURCE_OPTIONS]}
            ariaLabel="Booking source"
          />
          <HeroSelectField
            className="w-40"
            label="Room Type"
            value={roomTypeFilter}
            onValueChange={setRoomTypeFilter}
            options={[
              { value: "all", label: "All" },
              ...roomTypes.map((rt) => ({ value: rt.name, label: rt.name })),
            ]}
            ariaLabel="Room type"
          />
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-lg text-xs text-muted-foreground"
              onPress={() => {
                setStatusFilter("all");
                setPaymentFilter("all");
                setSourceFilter("all");
                setRoomTypeFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Cards — mobile always; desktop when Grid view selected */}
      {rows.length > 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {rows.map((row) => (
              <ReservationCard
                key={row.id}
                row={row.original}
                currency={currency}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
          {viewMode === "grid" && (
            <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((row) => (
                <ReservationCard
                  key={row.id}
                  row={row.original}
                  currency={currency}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          )}
          <div className={cn(viewMode === "table" && "md:hidden")}>
            <HeroTablePagination
              table={table}
              totalRows={totalCount}
              filteredRows={filteredCount}
            />
          </div>
        </div>
      ) : (
        emptyState
      )}

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
                    className={header.id === "createdAt" ? "hidden" : undefined}
                  >
                    {({ sortDirection }) =>
                      header.id === "actions" || header.id === "createdAt" ? null : (
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
                      <Table.Cell key={cell.id} className={cell.column.id === "createdAt" ? "hidden" : undefined}>
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

      {/* New Reservation Modal */}
      <NewBookingModal
        open={newBookingOpen}
        onOpenChange={(open) => {
          setNewBookingOpen(open);
          if (!open && searchParams.get("new")) {
            router.replace("/dashboard/bookings");
          }
        }}
        roomTypes={roomTypes}
        currency={currency}
        onReservationCreated={({ bookingId, payNow }) => {
          if (!payNow) return;
          setDetailInitialTab("payments");
          setDetailBookingId(bookingId);
          setDetailOpen(true);
        }}
      />

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

      {/* Cancel confirmation — destructive, always confirm */}
      <AlertDialog>
        <AlertDialog.Backdrop
          isOpen={pendingCancel !== null}
          onOpenChange={(open) => !open && setPendingCancel(null)}
        >
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[420px]">
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Cancel this reservation?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  {pendingCancel?.guestName}&rsquo;s stay ({pendingCancel?.reference}) will be
                  cancelled and the room released. You can reinstate it later if needed.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary" isDisabled={cancelling}>
                  Keep reservation
                </Button>
                <Button
                  variant="danger"
                  isPending={cancelling}
                  onPress={() => void handleCancel()}
                >
                  Cancel reservation
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
