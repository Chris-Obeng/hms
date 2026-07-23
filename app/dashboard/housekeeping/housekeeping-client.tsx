"use client";

import * as React from "react";
import { format, addDays, parseISO } from "date-fns";
import { toast } from "@heroui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import {
  Printer,
  RefreshCw,
  CalendarDays,
  ChevronDown,
  X,
  Check,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import {
  SortableHeader,
  HousekeepingTableRow,
  getOccupancyLabel,
} from "@/components/housekeeping/housekeeping-table-row";
import type {
  HousekeepingData,
  HousekeepingRoom,
  CleaningStatus,
  RoomOccupancyStatus,
} from "@/app/actions/housekeeping";
import {
  updateCleaningStatus,
  updateRoomNote,
  getHousekeepingData,
} from "@/app/actions/housekeeping";
import type { SortDirection } from "@/components/housekeeping/housekeeping-table-row";

// ── Types ─────────────────────────────────────────────────────────

type DateTab = "today" | "tomorrow" | "custom";
type SortKey =
  | "roomNumber"
  | "roomTypeName"
  | "occupancyStatus"
  | "cleaningStatus"
  | null;

interface HousekeepingClientProps {
  initialData: HousekeepingData;
  hotelId: string;
}

// ── Occupancy status filter options ──────────────────────────────

const OCCUPANCY_FILTER_OPTIONS: { value: RoomOccupancyStatus | "all"; label: string }[] = [
  { value: "all", label: "All room statuses" },
  { value: "occupied", label: "Occupied" },
  { value: "check_in_only", label: "Check-in only" },
  { value: "check_out_only", label: "Check-out only" },
  { value: "check_in_out", label: "Check-in/out" },
  { value: "unoccupied", label: "Unoccupied" },
];

const CLEANING_FILTER_OPTIONS: { value: CleaningStatus | "all"; label: string }[] = [
  { value: "all", label: "All cleaning statuses" },
  { value: "available", label: "Clean" },
  { value: "checkout_pending", label: "Dirty" },
  { value: "cleaning", label: "Cleaning" },
  { value: "occupied", label: "Occupied" },
  { value: "maintenance", label: "Maintenance" },
  { value: "out_of_service", label: "Out of Service" },
];

// ── Date helpers ──────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function tomorrowISO(): string {
  return addDays(new Date(), 1).toISOString().split("T")[0];
}

function formatReportDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMM d, yyyy");
}

function formatLastUpdated(isoTimestamp: string): string {
  return format(parseISO(isoTimestamp), "MMMM d, yyyy h:mm a");
}

// ── Sort helper ───────────────────────────────────────────────────

function sortRooms(
  rooms: HousekeepingRoom[],
  key: SortKey,
  direction: SortDirection
): HousekeepingRoom[] {
  if (!key || !direction) return rooms;
  return [...rooms].sort((a, b) => {
    let aVal = "";
    let bVal = "";
    switch (key) {
      case "roomNumber":
        // Natural numeric sort
        return direction === "asc"
          ? a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
          : b.roomNumber.localeCompare(a.roomNumber, undefined, { numeric: true });
      case "roomTypeName":
        aVal = a.roomTypeName;
        bVal = b.roomTypeName;
        break;
      case "occupancyStatus":
        aVal = getOccupancyLabel(a.occupancyStatus);
        bVal = getOccupancyLabel(b.occupancyStatus);
        break;
      case "cleaningStatus":
        aVal = a.cleaningStatus;
        bVal = b.cleaningStatus;
        break;
    }
    const cmp = aVal.localeCompare(bVal);
    return direction === "asc" ? cmp : -cmp;
  });
}


// ── Filter Select Dropdown ────────────────────────────────────────

interface FilterSelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: FilterSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  React.useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label}`}
        className={cn(
          "flex h-9 w-52 items-center justify-between gap-2 rounded-lg border border-input",
          "bg-background px-3 text-sm text-foreground shadow-xs",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "transition-colors duration-100",
          "print:hidden"
        )}
      >
        <span className={cn(value === "all" ? "text-muted-foreground" : "text-foreground")}>
          {value === "all" ? "Select" : current?.label}
        </span>
        <ChevronDown
          className={cn("size-3.5 text-muted-foreground transition-transform duration-150", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={cn(
            "absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-border/60",
            "bg-popover shadow-lg py-1",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2 text-sm",
                "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                "transition-colors duration-100",
                opt.value === value ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              {opt.label}
              {opt.value === value && <Check className="size-3.5 text-foreground shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Date Picker Popover ───────────────────────────────────────────

interface DatePickerPopoverProps {
  value: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}

function DatePickerPopover({ value, onSelect, onClose }: DatePickerPopoverProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [inputVal, setInputVal] = React.useState(value);

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (/^\d{4}-\d{2}-\d{2}$/.test(inputVal)) {
      onSelect(inputVal);
      onClose();
    }
  }

  return (
    <div
      ref={ref}
      className={cn(
        "absolute left-0 top-full z-50 mt-1 rounded-xl border border-border/60",
        "bg-popover shadow-lg p-4 w-64",
        "animate-in fade-in-0 zoom-in-95 duration-100"
      )}
    >
      <p className="text-xs font-semibold text-foreground mb-2">Select date</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="date"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          className={cn(
            "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          autoFocus
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-foreground py-1.5 text-xs font-medium text-background hover:bg-foreground/90 transition-colors"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}


// ── Main Component ────────────────────────────────────────────────

export function HousekeepingClient({
  initialData,
  hotelId,
}: HousekeepingClientProps) {
  const queryClient = useQueryClient();
  const { orgId, isLoaded } = useAuth();

  // ── View / filter state ──────────────────────────────────────
  const [dateTab, setDateTab] = React.useState<DateTab>("today");
  const [customDate, setCustomDate] = React.useState<string>(todayISO);
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const dateBtnRef = React.useRef<HTMLDivElement>(null);

  const [occupancyFilter, setOccupancyFilter] = React.useState<
    RoomOccupancyStatus | "all"
  >("all");
  const [cleaningFilter, setCleaningFilter] = React.useState<
    CleaningStatus | "all"
  >("all");

  // ── Sort state ───────────────────────────────────────────────
  const [sortKey, setSortKey] = React.useState<SortKey>("roomNumber");
  const [sortDir, setSortDir] = React.useState<SortDirection>("asc");

  function handleSort(key: string) {
    const k = key as SortKey;
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
      if (sortDir === "desc") setSortKey(null);
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  // ── Derive active report date ────────────────────────────────
  const reportDate = React.useMemo(() => {
    if (dateTab === "today") return todayISO();
    if (dateTab === "tomorrow") return tomorrowISO();
    return customDate;
  }, [dateTab, customDate]);

  // ── Query ────────────────────────────────────────────────────
  const { data, error, isError, isFetching, refetch } = useQuery({
    queryKey: [...qk.housekeeping(orgId ?? "", hotelId), reportDate],
    queryFn: async () => {
      const res = await getHousekeepingData(reportDate);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: isLoaded && !!orgId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const activeData = data || (reportDate === initialData.reportDate ? initialData : null);

  // ── Realtime subscription ────────────────────────────────────
  React.useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`hk:${hotelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `hotel_id=eq.${hotelId}` },
        () => queryClient.invalidateQueries({ queryKey: [...qk.housekeeping(orgId, hotelId), reportDate] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () => queryClient.invalidateQueries({ queryKey: [...qk.housekeeping(orgId, hotelId), reportDate] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [hotelId, orgId, reportDate, queryClient]);

  // ── Mutation: cleaning status ────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: async ({ roomId, status }: { roomId: string; status: CleaningStatus }) => {
      const res = await updateCleaningStatus(roomId, status);
      if (!res.success) throw new Error(res.error);
      return res;
    },
    onMutate: async ({ roomId, status }) => {
      const qKey = [...qk.housekeeping(orgId ?? "", hotelId), reportDate];
      await queryClient.cancelQueries({ queryKey: qKey });
      const prev = queryClient.getQueryData(qKey);
      queryClient.setQueryData(qKey, (old: HousekeepingData | undefined) => {
        if (!old) return old;
        return {
          ...old,
          rooms: old.rooms.map((r) =>
            r.id === roomId ? { ...r, cleaningStatus: status } : r
          ),
        };
      });
      return { prev, qKey };
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(ctx.qKey, ctx.prev);
      toast.danger(err instanceof Error ? err.message : "Failed to update cleaning status");
    },
    onSuccess: (res) => {
      if (res?.success) toast.success("Cleaning status updated");
    },
    onSettled: (_data, _err, _vars, ctx: any) => {
      if (ctx?.qKey) queryClient.invalidateQueries({ queryKey: ctx.qKey });
    },
  });

  // ── Mutation: note ───────────────────────────────────────────
  const noteMutation = useMutation({
    mutationFn: async ({ roomId, note }: { roomId: string; note: string }) => {
      const res = await updateRoomNote(roomId, note);
      if (!res.success) throw new Error(res.error);
      return res;
    },
    onMutate: async ({ roomId, note }) => {
      const qKey = [...qk.housekeeping(orgId ?? "", hotelId), reportDate];
      await queryClient.cancelQueries({ queryKey: qKey });
      const prev = queryClient.getQueryData(qKey);
      queryClient.setQueryData(qKey, (old: HousekeepingData | undefined) => {
        if (!old) return old;
        return {
          ...old,
          rooms: old.rooms.map((r) =>
            r.id === roomId ? { ...r, notes: note || null } : r
          ),
        };
      });
      return { prev, qKey };
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(ctx.qKey, ctx.prev);
      toast.danger(err instanceof Error ? err.message : "Failed to save note");
    },
    onSuccess: (res) => {
      if (res?.success) toast.success("Note saved");
    },
    onSettled: (_data, _err, _vars, ctx: any) => {
      if (ctx?.qKey) queryClient.invalidateQueries({ queryKey: ctx.qKey });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────
  const handleStatusChange = React.useCallback(
    (roomId: string, status: CleaningStatus) =>
      statusMutation.mutate({ roomId, status }),
    [statusMutation]
  );

  const handleNoteChange = React.useCallback(
    (roomId: string, note: string) => noteMutation.mutate({ roomId, note }),
    [noteMutation]
  );

  // ── Filtered + sorted rooms ──────────────────────────────────
  const filteredRooms = React.useMemo(() => {
    if (!activeData) return [];
    let rooms = activeData.rooms;
    if (occupancyFilter !== "all")
      rooms = rooms.filter((r) => r.occupancyStatus === occupancyFilter);
    if (cleaningFilter !== "all")
      rooms = rooms.filter((r) => r.cleaningStatus === cleaningFilter);
    return sortRooms(rooms, sortKey, sortDir);
  }, [activeData, occupancyFilter, cleaningFilter, sortKey, sortDir]);

  const pendingRoomIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (statusMutation.isPending && statusMutation.variables?.roomId)
      ids.add(statusMutation.variables.roomId);
    if (noteMutation.isPending && noteMutation.variables?.roomId)
      ids.add(noteMutation.variables.roomId);
    return ids;
  }, [statusMutation.isPending, statusMutation.variables, noteMutation.isPending, noteMutation.variables]);

  // ── Loading & error states ────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError && !activeData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border border-border/40 rounded-xl bg-destructive/5 max-w-xl mx-auto my-10 px-6">
        <h3 className="text-lg font-semibold text-destructive mb-2">Failed to load housekeeping</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {error instanceof Error ? error.message : "An unexpected error occurred."}
        </p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  if (isFetching && !activeData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeData) return null;

  // ── Print handler ─────────────────────────────────────────────
  function handlePrint() {
    // Brief delay ensures any pending React state is flushed before print dialog opens
    setTimeout(() => window.print(), 50);
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div id="hk-print-root" className="space-y-6">
      {/* ── Page header ────────────────────────────────────── */}
      <div>
        <h1 className="text-page-title text-foreground">Housekeeping</h1>
      </div>

      {/* ── Date tab selector ──────────────────────────────── */}
      <div className="print:hidden">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          View report for
        </p>
        <div className="relative flex items-center gap-0" ref={dateBtnRef}>
          <DateTabButton
            active={dateTab === "today"}
            onClick={() => { setDateTab("today"); setShowDatePicker(false); }}
          >
            Today
          </DateTabButton>
          <DateTabButton
            active={dateTab === "tomorrow"}
            onClick={() => { setDateTab("tomorrow"); setShowDatePicker(false); }}
          >
            Tomorrow
          </DateTabButton>
          <DateTabButton
            active={dateTab === "custom"}
            onClick={() => {
              setDateTab("custom");
              setShowDatePicker(true);
            }}
            icon={<CalendarDays className="size-3.5" aria-hidden="true" />}
          >
            {dateTab === "custom" ? formatReportDate(customDate) : "Select dates"}
          </DateTabButton>

          {showDatePicker && dateTab === "custom" && (
            <DatePickerPopover
              value={customDate}
              onSelect={(d) => { setCustomDate(d); setShowDatePicker(false); }}
              onClose={() => setShowDatePicker(false)}
            />
          )}
        </div>
      </div>

      {/* ── Filters row ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 print:hidden">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-foreground">Room status</label>
            <FilterSelect
              label="Room status"
              value={occupancyFilter}
              options={OCCUPANCY_FILTER_OPTIONS}
              onChange={setOccupancyFilter}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-foreground">Cleaning status</label>
            <FilterSelect
              label="Cleaning status"
              value={cleaningFilter}
              options={CLEANING_FILTER_OPTIONS}
              onChange={setCleaningFilter}
            />
          </div>
        </div>

        {/* Right: print + refresh */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 rounded-lg"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 h-9 text-xs font-medium rounded-lg"
          >
            <Printer className="size-3.5" aria-hidden="true" />
            Print report
          </Button>
        </div>
      </div>

      {/* ── Last updated timestamp ─────────────────────────── */}
      <p className="text-xs text-muted-foreground print:text-[11px]">
        Room status last updated:{" "}
        <span className="font-medium">{formatLastUpdated(activeData.lastUpdated)}</span>
      </p>

      {/* ── Table ──────────────────────────────────────────── */}
      <HousekeepingTable
        rooms={filteredRooms}
        reportDate={activeData.reportDate}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onStatusChange={handleStatusChange}
        onNoteChange={handleNoteChange}
        pendingRoomIds={pendingRoomIds}
      />

      {/* ── Print footer ───────────────────────────────────── */}
      <p className="hidden print:block text-[11px] text-muted-foreground mt-6 border-t border-border/40 pt-3">
        * Number of adults, children and infants (shown left to right) staying this night.
      </p>

      {/* ── Screen footer note ─────────────────────────────── */}
      <p className="text-xs text-muted-foreground print:hidden">
        * Number of adults, children and infants (shown from left to right) staying this night.
      </p>
    </div>
  );
}


// ── Date Tab Button ───────────────────────────────────────────────

interface DateTabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

function DateTabButton({ active, onClick, children, icon }: DateTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 border px-4 py-2 text-sm font-medium",
        "transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Mimic Little Hotelier pill-tab style
        "first:rounded-l-lg last:rounded-r-lg -ml-px first:ml-0",
        active
          ? "relative z-10 bg-foreground text-background border-foreground"
          : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/40"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ── Housekeeping Table ────────────────────────────────────────────

interface HousekeepingTableProps {
  rooms: HousekeepingRoom[];
  reportDate: string;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: string) => void;
  onStatusChange: (roomId: string, status: CleaningStatus) => void;
  onNoteChange: (roomId: string, note: string) => void;
  pendingRoomIds: Set<string>;
}

function HousekeepingTable({
  rooms,
  reportDate,
  sortKey,
  sortDir,
  onSort,
  onStatusChange,
  onNoteChange,
  pendingRoomIds,
}: HousekeepingTableProps) {
  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border border-border/40 rounded-xl bg-muted/10">
        <svg
          className="size-10 text-muted-foreground/25 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205 3 1m1.5.5-1.5-.5M6.75 7.364V3h-3v18m3-13.636 10.5-3.819"
          />
        </svg>
        <p className="text-sm font-medium text-muted-foreground">No rooms match the current filters</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting the room or cleaning status filters.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden print:border-0 print:rounded-none">
      {/* Report date heading — visible on both screen and print */}
      <div className="px-4 pt-4 pb-2 print:pt-0 print:px-0">
        <h2 className="text-2xl font-light text-foreground tracking-tight print:text-xl">
          {formatReportDate(reportDate)}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/20 print:bg-transparent">
              <SortableHeader
                label="Room number"
                sortKey="roomNumber"
                currentSortKey={sortKey}
                direction={sortKey === "roomNumber" ? sortDir : null}
                onSort={onSort}
              />
              <SortableHeader
                label="Room type"
                sortKey="roomTypeName"
                currentSortKey={sortKey}
                direction={sortKey === "roomTypeName" ? sortDir : null}
                onSort={onSort}
              />
              <SortableHeader
                label="Room status"
                sortKey="occupancyStatus"
                currentSortKey={sortKey}
                direction={sortKey === "occupancyStatus" ? sortDir : null}
                onSort={onSort}
              />
              {/* Guests header — not sortable, has asterisk footnote */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-foreground whitespace-nowrap"
              >
                Guests*
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-foreground"
              >
                Room notes
              </th>
              <SortableHeader
                label="Cleaning status"
                sortKey="cleaningStatus"
                currentSortKey={sortKey}
                direction={sortKey === "cleaningStatus" ? sortDir : null}
                onSort={onSort}
              />
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <HousekeepingTableRow
                key={room.id}
                room={room}
                onStatusChange={onStatusChange}
                onNoteChange={onNoteChange}
                isPendingStatus={pendingRoomIds.has(room.id)}
                isPendingNote={pendingRoomIds.has(room.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
