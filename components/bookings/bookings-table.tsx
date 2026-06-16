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
  CalendarIcon,
  ChevronDown,
  Download,
  Eye,
  LogIn,
  LogOut,
  MoreHorizontal,
  RotateCcw,
  Search,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
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
import { NewBookingSheet } from "@/components/bookings/new-booking-sheet";
import { updateBookingStatus } from "@/app/actions/bookings";

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

function getStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" | "ghost" {
  switch (status) {
    case "confirmed":
      return "default";
    case "checked_in":
      return "secondary";
    case "checked_out":
      return "outline";
    case "cancelled":
    case "no_show":
      return "destructive";
    case "pending":
      return "ghost";
    default:
      return "outline";
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    confirmed: "Confirmed",
    checked_in: "Checked In",
    checked_out: "Checked Out",
    cancelled: "Cancelled",
    no_show: "No Show",
    pending: "Pending",
  };
  return labels[status] || status;
}

function getPaymentVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paid":
      return "default";
    case "partial":
      return "secondary";
    case "unpaid":
      return "outline";
    case "refunded":
      return "destructive";
    default:
      return "outline";
  }
}

function getPaymentLabel(status: string): string {
  const labels: Record<string, string> = {
    paid: "Paid",
    partial: "Partial",
    unpaid: "Unpaid",
    refunded: "Refunded",
  };
  return labels[status] || status;
}

const SOURCE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  direct: { label: "Direct", color: "text-blue-600", bg: "bg-blue-500/10" },
  bookings_com: { label: "Booking.com", color: "text-purple-600", bg: "bg-purple-500/10" },
  manual: { label: "Manual", color: "text-teal-600", bg: "bg-teal-500/10" },
  phone: { label: "Phone", color: "text-amber-600", bg: "bg-amber-500/10" },
  walk_in: { label: "Walk-in", color: "text-emerald-600", bg: "bg-emerald-500/10" },
};

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "MMM dd, yyyy");
  } catch {
    return dateStr;
  }
}

// ── Columns ────────────────────────────────────────────────────────

function getColumns(currency: string): ColumnDef<BookingRow>[] {
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
      cell: ({ row }) => (
        <Badge variant={getStatusVariant(row.original.status)} className="text-[10px] px-1.5 py-0.5 h-5 font-medium">
          {getStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: "paymentStatus",
      header: "Payment",
      cell: ({ row }) => (
        <Badge variant={getPaymentVariant(row.original.paymentStatus)} className="text-[10px] px-1.5 py-0.5 h-5 font-medium">
          {getPaymentLabel(row.original.paymentStatus)}
        </Badge>
      ),
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
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              <MoreHorizontal className="size-3.5" />
              <span className="sr-only">Actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                {booking.reference}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
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
                      toast.error(result.error || "Check-in failed");
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
                      toast.error(result.error || "Check-out failed");
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
                      toast.error(result.error || "Cancel failed");
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
                      toast.error(result.error || "Reinstate failed");
                    }
                  }}
                >
                  <RotateCcw className="size-3.5 mr-2" />
                  Reinstate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
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
  { value: "bookings_com", label: "Booking.com" },
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
  link.download = `bookings-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Main Component ─────────────────────────────────────────────────

export function BookingsTable({ data, roomTypes, currency }: BookingsTableProps) {
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
  const [newBookingOpen, setNewBookingOpen] = React.useState(false);

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

  const columns = React.useMemo(() => getColumns(currency), [currency]);

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
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            Bookings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount} total booking{totalCount !== 1 ? "s" : ""}
            {filteredCount !== totalCount && (
              <span className="text-muted-foreground/60">
                {" "}· {filteredCount} visible
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
              New Booking
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
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
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
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
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
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
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
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
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
                  <TableRow key={row.id} className="group">
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
                      <CalendarIcon className="size-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">
                        {globalFilter || statusFilter !== "all" || paymentFilter !== "all"
                          ? "No bookings match your filters"
                          : "No bookings yet"}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px]">
                        {globalFilter || statusFilter !== "all" || paymentFilter !== "all"
                          ? "Try adjusting your search or filters"
                          : "Bookings will appear here once guests start reserving rooms."}
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

      {/* New Booking Sheet */}
      <NewBookingSheet
        open={newBookingOpen}
        onOpenChange={setNewBookingOpen}
        roomTypes={roomTypes}
        currency={currency}
      />
    </div>
  );
}
