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
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  CalendarIcon,
  ChevronDown,
  Download,
  Eye,
  LayoutGrid,
  List,
  LogIn,
  LogOut,
  MoreHorizontal,
  RotateCcw,
  Search,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  SOURCE_BADGES,
  getPaymentLabel,
  getStatusLabel,
  getStatusVariant,
} from "@/lib/booking-status";
import { downloadCsv, toCsv } from "@/lib/csv";
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

// ── Columns ────────────────────────────────────────────────────────

function getColumns(
  currency: string,
  onViewDetails: (id: string) => void
): ColumnDef<BookingRow>[] {
  return [
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium text-foreground">
          {row.original.reference}
        </span>
      ),
    },
    {
      accessorKey: "guestName",
      header: "Guest",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
            {row.original.guestName}
          </span>
          {row.original.guestEmail && (
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">
              {row.original.guestEmail}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "roomType",
      header: "Room",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm text-foreground">
            {row.original.roomType || "—"}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.original.roomNumber
              ? `Rm ${row.original.roomNumber}`
              : "Not assigned"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "checkIn",
      header: "Check-In",
      cell: ({ row }) => (
        <span className="text-sm text-foreground whitespace-nowrap">
          {formatDate(row.original.checkIn)}
        </span>
      ),
    },
    {
      accessorKey: "checkOut",
      header: "Check-Out",
      cell: ({ row }) => (
        <span className="text-sm text-foreground whitespace-nowrap">
          {formatDate(row.original.checkOut)}
        </span>
      ),
    },
    {
      accessorKey: "nights",
      header: "Nights",
      cell: ({ row }) => (
        <span className="text-sm text-foreground tabular-nums">
          {row.original.nights ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        const statusClass =
          s === "confirmed" ? "status-confirmed" :
          s === "checked_in" ? "status-checked-in" :
          s === "checked_out" ? "status-checked-out" :
          s === "pending" ? "status-pending" :
          s === "cancelled" || s === "no_show" ? "status-cancelled" :
          "status-checked-out";
        return (
          <span className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-md border text-caption font-medium",
            statusClass
          )}>
            {getStatusLabel(s)}
          </span>
        );
      },
    },
    {
      accessorKey: "paymentStatus",
      header: "Payment",
      cell: ({ row }) => {
        const p = row.original.paymentStatus;
        const payClass =
          p === "paid" ? "status-confirmed" :
          p === "partial" ? "status-pending" :
          p === "unpaid" ? "status-checked-out" :
          p === "refunded" ? "status-cancelled" :
          "status-checked-out";
        return (
          <span className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-md border text-caption font-medium",
            payClass
          )}>
            {getPaymentLabel(p)}
          </span>
        );
      },
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => {
        const source = SOURCE_BADGES[row.original.source] || SOURCE_BADGES.direct;
        return (
          <div className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", source.bg, source.color)}>
            {source.label}
          </div>
        );
      },
    },
    {
      accessorKey: "totalAmount",
      header: "Total",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-foreground tabular-nums whitespace-nowrap">
          {formatCurrency(row.original.totalAmount, currency)}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const booking = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                  {booking.reference}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onViewDetails(booking.id)}
                >
                  <Eye className="size-3.5 mr-2" />
                  View Details
                </DropdownMenuItem>
                {booking.status === "confirmed" && (
                  <DropdownMenuItem
                    onClick={async () => {
                      const result = await updateBookingStatus(booking.id, "checked_in");
                      if (result.success) {
                        toast.success(`${booking.guestName} checked in`);
                      } else {
                        toast.danger(result.error || "Check-in failed");
                      }
                    }}
                  >
                    <LogIn className="size-3.5 mr-2 text-emerald-500" />
                    Check In
                  </DropdownMenuItem>
                )}
                {booking.status === "checked_in" && (
                  <DropdownMenuItem
                    onClick={async () => {
                      const result = await updateBookingStatus(booking.id, "checked_out");
                      if (result.success) {
                        toast.success(`${booking.guestName} checked out`);
                      } else {
                        toast.danger(result.error || "Check-out failed");
                      }
                    }}
                  >
                    <LogOut className="size-3.5 mr-2 text-amber-500" />
                    Check Out
                  </DropdownMenuItem>
                )}
                {(booking.status === "confirmed" || booking.status === "checked_in") && (
                  <DropdownMenuItem
                    onClick={async () => {
                      const result = await updateBookingStatus(booking.id, "cancelled");
                      if (result.success) {
                        toast.success("Booking cancelled");
                      } else {
                        toast.danger(result.error || "Cancel failed");
                      }
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <XCircle className="size-3.5 mr-2" />
                    Cancel
                  </DropdownMenuItem>
                )}
                {booking.status === "cancelled" && (
                  <DropdownMenuItem
                    onClick={async () => {
                      const result = await updateBookingStatus(booking.id, "confirmed");
                      if (result.success) {
                        toast.success("Booking reinstated");
                      } else {
                        toast.danger(result.error || "Reinstate failed");
                      }
                    }}
                  >
                    <RotateCcw className="size-3.5 mr-2" />
                    Reinstate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}

// ── Reservation Card (​Grid View) ─────────────────────────────────

function ReservationCard({
  row,
  currency,
  onViewDetails,
}: {
  row: BookingRow;
  currency: string;
  onViewDetails: (id: string) => void;
}) {
  const statusVariant = getStatusVariant(row.status);
  const statusLabel = getStatusLabel(row.status);
  const sourceBadge = SOURCE_BADGES[row.source] || { label: row.source, color: "text-slate-600", bg: "bg-slate-500/10" };
  const nights = row.nights ?? 0;
  const outstanding = row.outstandingBalance ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onViewDetails(row.id)}
      onKeyDown={(e) => e.key === "Enter" && onViewDetails(row.id)}
      className="group relative flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm hover:shadow-md hover:border-border transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Status dot + badge row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "size-2 rounded-full shrink-0 mt-0.5",
              row.status === "checked_in" && "bg-emerald-500",
              row.status === "confirmed" && "bg-blue-500",
              row.status === "checked_out" && "bg-slate-400",
              row.status === "cancelled" && "bg-rose-500",
              row.status === "pending" && "bg-amber-500",
              row.status === "no_show" && "bg-orange-500",
            )}
          />
          <span className="text-sm font-semibold text-foreground truncate">
            {row.guestName}
          </span>
        </div>
        <Badge variant={statusVariant} className="text-[10px] px-2 py-0.5 shrink-0 capitalize whitespace-nowrap">
          {statusLabel}
        </Badge>
      </div>

      {/* Reference + Room */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono tracking-wide">{row.reference}</span>
        <span className="flex items-center gap-1">
          {row.roomNumber && (
            <span className="font-medium text-foreground">Rm {row.roomNumber}</span>
          )}
          {row.roomType && (
            <span className="text-muted-foreground/60">{row.roomNumber ? `· ${row.roomType}` : row.roomType}</span>
          )}
        </span>
      </div>

      {/* Dates */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
        <CalendarIcon className="size-3 shrink-0" />
        <span>{formatDate(row.checkIn)}</span>
        <span className="text-muted-foreground/40">→</span>
        <span>{formatDate(row.checkOut)}</span>
        <span className="ml-auto font-medium text-foreground">
          {nights} night{nights !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Amount + Payment + Source */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">
            {formatCurrency(row.totalAmount, currency, { minimumFractionDigits: 0 })}
          </span>
          {outstanding > 0 && (
            <span className="text-[10px] text-rose-500 font-medium">
              {formatCurrency(outstanding, currency, { minimumFractionDigits: 0 })} outstanding
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", sourceBadge.bg, sourceBadge.color)}>
            {sourceBadge.label}
          </span>
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

function exportToCsv(data: BookingRow[], currency: string) {
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
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "checkIn", desc: false },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    guestEmail: false,
    guestPhone: false,
  });
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

  // Selected filters
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [paymentFilter, setPaymentFilter] = React.useState<string>("all");
  const [sourceFilter, setSourceFilter] = React.useState<string>("all");
  const [roomTypeFilter, setRoomTypeFilter] = React.useState<string>("all");

  // Apply column filters from dropdown selections
  React.useEffect(() => {
    const filters: ColumnFiltersState = [];
    if (statusFilter !== "all") {
      filters.push({ id: "status", value: statusFilter });
    }
    if (paymentFilter !== "all") {
      filters.push({ id: "paymentStatus", value: paymentFilter });
    }
    if (sourceFilter !== "all") {
      filters.push({ id: "source", value: sourceFilter });
    }
    if (roomTypeFilter !== "all") {
      filters.push({ id: "roomType", value: roomTypeFilter });
    }
    setColumnFilters(filters);
  }, [statusFilter, paymentFilter, sourceFilter, roomTypeFilter]);

  const handleViewDetails = React.useCallback((id: string) => {
    setDetailBookingId(id);
    setDetailOpen(true);
  }, []);

  const columns = React.useMemo(() => getColumns(currency, handleViewDetails), [currency, handleViewDetails]);

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
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-page-title text-foreground">
            Reservations
          </h1>
          <p className="text-body text-muted-foreground mt-1">
            {totalCount} total reservation{totalCount !== 1 ? "s" : ""}
            {filteredCount !== totalCount && (
              <span className="text-muted-foreground/60">
                {" "}· {filteredCount} visible
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex items-center rounded-xl border border-border/60 overflow-hidden h-9">
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "h-9 px-2.5 flex items-center gap-1.5 text-sm transition-colors",
                viewMode === "table"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              title="Table view"
            >
              <List className="size-3.5" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "h-9 px-2.5 flex items-center gap-1.5 text-sm transition-colors",
                viewMode === "grid"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              title="Grid view"
            >
              <LayoutGrid className="size-3.5" />
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm rounded-xl border-border/60"
            onClick={() => exportToCsv(data, currency)}
          >
            <Download className="size-3.5 mr-1.5" />
            Export
          </Button>
          <Button
            size="sm"
            className="h-9 text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90"
            onClick={() => setNewBookingOpen(true)}
          >
            <span className="flex items-center gap-1.5">
              <span className="text-base leading-none">+</span>
              New Reservation
            </span>
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
            <Input
              placeholder="Search name, email, phone, reference..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-9 pl-9 text-sm rounded-xl border-border/60"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 text-sm rounded-xl gap-1.5",
              showFilters && "bg-muted text-foreground"
            )}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
          </Button>
        </div>

        {/* Filter chips */}
        {showFilters && (
          <Card size="sm" className="border-border/60">
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Status */}
                <div className="flex flex-col gap-1">
                  <label className="text-label font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="all">All</option>
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payment Status */}
                <div className="flex flex-col gap-1">
                  <label className="text-label font-medium text-muted-foreground uppercase tracking-wider">
                    Payment
                  </label>
                  <select
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                    className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="all">All</option>
                    {PAYMENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source */}
                <div className="flex flex-col gap-1">
                  <label className="text-label font-medium text-muted-foreground uppercase tracking-wider">
                    Source
                  </label>
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="all">All</option>
                    {SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Room Type */}
                <div className="flex flex-col gap-1">
                  <label className="text-label font-medium text-muted-foreground uppercase tracking-wider">
                    Room Type
                  </label>
                  <select
                    value={roomTypeFilter}
                    onChange={(e) => setRoomTypeFilter(e.target.value)}
                    className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="all">All</option>
                    {roomTypes.map((rt) => (
                      <option key={rt.id} value={rt.name}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Clear */}
                {(statusFilter !== "all" ||
                  paymentFilter !== "all" ||
                  sourceFilter !== "all" ||
                  roomTypeFilter !== "all") && (
                  <button
                    onClick={() => {
                      setStatusFilter("all");
                      setPaymentFilter("all");
                      setSourceFilter("all");
                      setRoomTypeFilter("all");
                    }}
                    className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted self-end"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Grid view */}
      {viewMode === "grid" && (
        <>
          {table.getRowModel().rows.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {table.getRowModel().rows.map((row) => (
                <ReservationCard
                  key={row.id}
                  row={row.original}
                  currency={currency}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <CalendarIcon className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-body font-medium text-muted-foreground">
                {globalFilter || statusFilter !== "all" || paymentFilter !== "all"
                  ? "No reservations match your filters"
                  : "No reservations yet"}
              </p>
              <p className="text-caption text-muted-foreground/60 mt-1 max-w-[240px]">
                {globalFilter || statusFilter !== "all" || paymentFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Reservations will appear here once guests start reserving rooms."}
              </p>
            </div>
          )}
          {/* Grid Pagination */}
          {table.getPageCount() > 1 && (
            <div className="flex items-center justify-between border-t border-border/50 pt-4">
              <p className="text-xs text-muted-foreground">
                {filteredCount > 0
                  ? `Showing ${table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–${Math.min(
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
          )}
        </>
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="text-label font-semibold uppercase tracking-wide text-muted-foreground/70 h-11">
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
                    className="group min-h-[44px] hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => handleViewDetails(row.original.id)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3">
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
                      <CalendarIcon className="size-10 text-muted-foreground/30 mb-3" />
                      <p className="text-body font-medium text-muted-foreground">
                        {globalFilter || statusFilter !== "all" || paymentFilter !== "all"
                          ? "No reservations match your filters"
                          : "No reservations yet"}
                      </p>
                      <p className="text-caption text-muted-foreground/60 mt-1 max-w-[240px]">
                        {globalFilter || statusFilter !== "all" || paymentFilter !== "all"
                          ? "Try adjusting your search or filters"
                          : "Reservations will appear here once guests start reserving rooms."}
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
        onBookingChanged={() => router.refresh()}
      />
    </div>
  );
}
