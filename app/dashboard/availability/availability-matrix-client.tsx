"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO, subDays } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarDays,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

export type AvailabilityMatrixData = {
  hotelId: string;
  hotelName: string;
  currency: string;
  startDate: string;
  days: number;
  dates: string[];
  roomTypes: {
    id: string;
    name: string;
    slug: string;
    basePrice: number;
    sortOrder: number;
  }[];
  totals: MatrixTotalCell[];
  roomTypeRows: RoomTypeAvailabilityRow[];
  roomRows: RoomAvailabilityRow[];
  generatedAt: string;
};

type MatrixTotalCell = {
  date: string;
  totalRooms: number;
  available: number;
  sold: number;
  occupancy: number;
};

type RoomTypeAvailabilityRow = {
  id: string;
  name: string;
  basePrice: number;
  roomCount: number;
  cells: RoomTypeAvailabilityCell[];
};

type RoomTypeAvailabilityCell = {
  date: string;
  totalRooms: number;
  available: number;
  assigned: number;
  blocked: number;
  unsaleable: number;
  unassignedDemand: number;
  arrivals: number;
  departures: number;
  occupancy: number;
};

type RoomAvailabilityRow = {
  id: string;
  roomNumber: string;
  floor: string | null;
  status: string;
  roomTypeId: string;
  roomTypeName: string;
  cells: RoomAvailabilityCell[];
};

type RoomAvailabilityCell = {
  date: string;
  state: "open" | "reserved" | "in_house" | "blocked" | "unsaleable";
  label: string;
  reference: string | null;
  arrival: boolean;
  departure: boolean;
};

const DAY_PRESETS = [7, 14, 30, 45] as const;

export function AvailabilityMatrixClient({ data, hotelId }: { data: AvailabilityMatrixData; hotelId: string }) {
  const router = useRouter();
  const [view, setView] = React.useState<"inventory" | "rack">("inventory");
  const [query, setQuery] = React.useState("");
  const [visibleTypeIds, setVisibleTypeIds] = React.useState<Set<string>>(
    () => new Set(data.roomTypes.map((roomType) => roomType.id))
  );

  // Realtime subscription — auto-refresh on booking or availability_block changes
  const refreshRef = React.useRef(router.refresh.bind(router));
  React.useEffect(() => { refreshRef.current = router.refresh.bind(router); });

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`hotel:${hotelId}:availability`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () => refreshRef.current(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability_blocks", filter: `hotel_id=eq.${hotelId}` },
        () => refreshRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId]);

  const gridTemplateColumns = React.useMemo(
    () => `220px repeat(${data.dates.length}, minmax(78px, 1fr))`,
    [data.dates.length]
  );

  const navigate = React.useCallback(
    (startDate: string, days = data.days) => {
      router.push(`/dashboard/availability?start=${startDate}&days=${days}`);
    },
    [data.days, router]
  );

  const start = parseISO(data.startDate);
  const end = addDays(start, data.days - 1);

  const filteredTypeRows = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.roomTypeRows.filter((row) => {
      if (!visibleTypeIds.has(row.id)) return false;
      if (!normalized) return true;
      return row.name.toLowerCase().includes(normalized);
    });
  }, [data.roomTypeRows, query, visibleTypeIds]);

  const filteredRoomRows = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.roomRows.filter((row) => {
      if (!visibleTypeIds.has(row.roomTypeId)) return false;
      if (!normalized) return true;
      return (
        row.roomNumber.toLowerCase().includes(normalized) ||
        row.roomTypeName.toLowerCase().includes(normalized)
      );
    });
  }, [data.roomRows, query, visibleTypeIds]);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const totalRooms = data.roomRows.length;
  const avgOccupancy =
    data.totals.length > 0
      ? Math.round(data.totals.reduce((sum, cell) => sum + cell.occupancy, 0) / data.totals.length)
      : 0;
  const minAvailable = Math.min(...data.totals.map((cell) => cell.available), totalRooms);
  const soldOutDays = data.totals.filter((cell) => cell.available <= 0 && cell.totalRooms > 0).length;

  return (
    <div className="availability-page -m-4 min-h-[calc(100vh-5rem)] bg-background p-4 md:-m-6 md:p-6 lg:-m-8 lg:p-8">
      <header className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md border-border/70 bg-background text-[11px]">
              Live inventory
            </Badge>
            <span className="text-xs text-muted-foreground">
              Updated {format(parseISO(data.generatedAt), "MMM d, h:mm a")}
            </span>
          </div>
          <h1 className="text-page-title text-foreground">
            Availability Matrix
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(start, "MMM d")} - {format(end, "MMM d, yyyy")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-border/70 bg-background p-0.5 shadow-sm">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-md"
              onClick={() => navigate(format(subDays(start, data.days), "yyyy-MM-dd"))}
              aria-label="Previous range"
            >
              <ArrowLeft className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-md px-3 text-xs"
              onClick={() => navigate(format(new Date(), "yyyy-MM-dd"))}
            >
              <CalendarDays className="size-3.5" />
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-md"
              onClick={() => navigate(format(addDays(start, data.days), "yyyy-MM-dd"))}
              aria-label="Next range"
            >
              <ArrowRight className="size-3.5" />
            </Button>
          </div>

          <div className="flex items-center rounded-lg border border-border/70 bg-background p-0.5 shadow-sm">
            {DAY_PRESETS.map((days) => (
              <Button
                key={days}
                variant={data.days === days ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 rounded-md px-3 text-xs",
                  data.days === days && "bg-foreground text-background hover:bg-foreground/90"
                )}
                onClick={() => navigate(data.startDate, days)}
              >
                {days}d
              </Button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg bg-background text-xs"
            onClick={() => router.refresh()}
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      <section className="mb-4 grid gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-4">
        <Metric label="Rooms" value={String(totalRooms)} />
        <Metric label="Avg occupancy" value={`${avgOccupancy}%`} />
        <Metric label="Lowest availability" value={`${Number.isFinite(minAvailable) ? minAvailable : 0}`} />
        <Metric label="Sold-out days" value={String(soldOutDays)} />
      </section>

      <section className="mb-4 flex flex-col gap-3 rounded-lg border border-border/70 bg-background p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 lg:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search room type or room"
              className="h-9 w-full rounded-lg border border-border/60 bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.roomTypes.map((roomType) => {
              const active = visibleTypeIds.has(roomType.id);
              return (
                <button
                  key={roomType.id}
                  type="button"
                  onClick={() => {
                    setVisibleTypeIds((previous) => {
                      const next = new Set(previous);
                      if (active) next.delete(roomType.id);
                      else next.add(roomType.id);
                      return next;
                    });
                  }}
                  className={cn(
                    "h-8 rounded-md border px-2.5 text-xs font-medium transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {roomType.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center rounded-lg border border-border/70 bg-muted/30 p-0.5">
          <Button
            variant={view === "inventory" ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-8 rounded-md text-xs", view === "inventory" && "bg-background shadow-sm")}
            onClick={() => setView("inventory")}
          >
            <Table2 className="size-3.5" />
            Inventory
          </Button>
          <Button
            variant={view === "rack" ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-8 rounded-md text-xs", view === "rack" && "bg-background shadow-sm")}
            onClick={() => setView("rack")}
          >
            <BedDouble className="size-3.5" />
            Room Rack
          </Button>
        </div>
      </section>

      {view === "inventory" ? (
        <InventoryGrid
          dates={data.dates}
          totals={data.totals}
          rows={filteredTypeRows}
          todayKey={todayKey}
          gridTemplateColumns={gridTemplateColumns}
        />
      ) : (
        <RoomRackGrid
          dates={data.dates}
          rows={filteredRoomRows}
          todayKey={todayKey}
          gridTemplateColumns={gridTemplateColumns}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function InventoryGrid({
  dates,
  totals,
  rows,
  todayKey,
  gridTemplateColumns,
}: {
  dates: string[];
  totals: MatrixTotalCell[];
  rows: RoomTypeAvailabilityRow[];
  todayKey: string;
  gridTemplateColumns: string;
}) {
  return (
    <div className="availability-grid-shell">
      <DateHeader dates={dates} todayKey={todayKey} gridTemplateColumns={gridTemplateColumns} />
      <div className="availability-grid-row availability-grid-total" style={{ gridTemplateColumns }}>
        <div className="availability-sticky-cell">
          <span className="text-xs font-semibold uppercase text-muted-foreground">All rooms</span>
          <strong>Total inventory</strong>
        </div>
        {totals.map((cell) => (
          <div key={cell.date} className={cn("availability-total-cell", cell.date === todayKey && "is-today")}>
            <strong>{cell.available}</strong>
            <span>{cell.occupancy}% sold</span>
          </div>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.id} className="availability-grid-row" style={{ gridTemplateColumns }}>
          <div className="availability-sticky-cell">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {row.roomCount} rooms
            </span>
            <strong>{row.name}</strong>
          </div>
          {row.cells.map((cell) => (
            <InventoryCell key={cell.date} cell={cell} today={cell.date === todayKey} />
          ))}
        </div>
      ))}
    </div>
  );
}

function InventoryCell({ cell, today }: { cell: RoomTypeAvailabilityCell; today: boolean }) {
  const level =
    cell.available <= 0 ? "sold-out" : cell.available <= Math.max(1, Math.ceil(cell.totalRooms * 0.2)) ? "tight" : "open";
  return (
    <div className={cn("availability-inventory-cell", `is-${level}`, today && "is-today")}>
      <div className="flex items-center justify-between gap-2">
        <strong>{cell.available}</strong>
        <span>{cell.occupancy}%</span>
      </div>
      <div className="availability-meter">
        <span style={{ width: `${Math.min(cell.occupancy, 100)}%` }} />
      </div>
      <div className="availability-cell-meta">
        <span>A {cell.arrivals}</span>
        <span>D {cell.departures}</span>
      </div>
      {(cell.blocked > 0 || cell.unassignedDemand > 0 || cell.unsaleable > 0) && (
        <div className="availability-exception-line">
          {cell.blocked > 0 && <span>{cell.blocked} block</span>}
          {cell.unassignedDemand > 0 && <span>{cell.unassignedDemand} unassigned</span>}
          {cell.unsaleable > 0 && <span>{cell.unsaleable} OOS</span>}
        </div>
      )}
    </div>
  );
}

function RoomRackGrid({
  dates,
  rows,
  todayKey,
  gridTemplateColumns,
}: {
  dates: string[];
  rows: RoomAvailabilityRow[];
  todayKey: string;
  gridTemplateColumns: string;
}) {
  return (
    <div className="availability-grid-shell">
      <DateHeader dates={dates} todayKey={todayKey} gridTemplateColumns={gridTemplateColumns} />
      {rows.map((row) => (
        <div key={row.id} className="availability-grid-row" style={{ gridTemplateColumns }}>
          <div className="availability-sticky-cell">
            <span className="text-xs font-semibold uppercase text-muted-foreground">{row.roomTypeName}</span>
            <strong>Room {row.roomNumber}</strong>
            {row.floor && <small>Floor {row.floor}</small>}
          </div>
          {row.cells.map((cell) => (
            <div
              key={cell.date}
              className={cn("availability-room-cell", `is-${cell.state}`, cell.date === todayKey && "is-today")}
              title={cell.reference || cell.label}
            >
              <span className="truncate">{cell.label}</span>
              <div className="availability-room-flags">
                {cell.arrival && <b>In</b>}
                {cell.departure && <b>Out</b>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DateHeader({
  dates,
  todayKey,
  gridTemplateColumns,
}: {
  dates: string[];
  todayKey: string;
  gridTemplateColumns: string;
}) {
  return (
    <div className="availability-grid-row availability-date-header" style={{ gridTemplateColumns }}>
      <div className="availability-sticky-cell availability-corner">
        <span>Room / date</span>
      </div>
      {dates.map((date) => {
        const parsed = parseISO(date);
        return (
          <div key={date} className={cn("availability-date-cell", date === todayKey && "is-today")}>
            <span>{format(parsed, "EEE")}</span>
            <strong>{format(parsed, "d")}</strong>
            <small>{format(parsed, "MMM")}</small>
          </div>
        );
      })}
    </div>
  );
}
