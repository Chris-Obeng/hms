"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO, subDays } from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  Button as HeroButton,
  Calendar,
  Popover,
  toast,
} from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { toCalendarDate, fromCalendarDate } from "@/lib/date-convert";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";
import {
  deleteDailyRateOverride,
  getResolvedRates,
  upsertDailyRateOverride,
  type ResolvedPriceCell as ResolvedRate,
} from "@/app/actions/pricing";
import { restrictionMarkers } from "@/lib/pricing/restriction-markers";
import "./availability.css";

export type AvailabilityMatrixData = {
  hotelId: string;
  hotelName: string;
  currency: string;
  propertyToday?: string;
  startDate: string;
  days: number;
  dates: string[];
  roomTypes: { id: string; name: string; slug: string; basePrice: number; sortOrder: number }[];
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

const DAY_PRESETS = [7, 14, 30] as const;

export function AvailabilityMatrixClient({
  data,
  hotelId,
}: {
  data: AvailabilityMatrixData;
  hotelId: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [query, setQuery] = React.useState("");
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);
  const deferredQuery = React.useDeferredValue(query);
  const [editing, setEditing] = React.useState<{ roomTypeId: string; date: string } | null>(null);
  const [price, setPrice] = React.useState("");

  const resolvedKey = React.useMemo(
    () => ["availability-rates", hotelId, data.startDate, data.days] as const,
    [hotelId, data.startDate, data.days]
  );

  const { data: rates = [], isLoading: ratesLoading } = useQuery({
    queryKey: resolvedKey,
    queryFn: async () => {
      const r = await getResolvedRates(
        data.roomTypes.map((x) => x.id),
        data.startDate,
        format(addDays(parseISO(data.startDate), data.days - 1), "yyyy-MM-dd")
      );
      return r.success ? r.data : [];
    },
  });

  const rateMap = React.useMemo(
    () => new Map(rates.map((r) => [`${r.roomTypeId}_${r.date}`, r])),
    [rates]
  );

  const save = useMutation({
    mutationFn: async (v: { roomTypeId: string; date: string; price: number }) => {
      const r = await upsertDailyRateOverride(v.roomTypeId, v.date, v.price);
      if (!r.success) throw new Error("error" in r ? r.error : "Failed to save rate");
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: resolvedKey });
      const previous = qc.getQueryData<ResolvedRate[]>(resolvedKey);
      qc.setQueryData<ResolvedRate[]>(resolvedKey, (current = []) => {
        const exists = current.some(
          (cell) => cell.roomTypeId === v.roomTypeId && cell.date === v.date
        );
        if (!exists) {
          return [
            ...current,
            {
              roomTypeId: v.roomTypeId,
              date: v.date,
              price: v.price,
              source: "daily" as const,
              isWeekend: [5, 6].includes(parseISO(v.date).getDay()),
            },
          ];
        }
        return current.map((cell) =>
          cell.roomTypeId === v.roomTypeId && cell.date === v.date
            ? { ...cell, price: v.price, source: "daily" as const }
            : cell
        );
      });
      setEditing(null);
      return { previous };
    },
    onError: (error, _v, context) => {
      if (context?.previous) qc.setQueryData(resolvedKey, context.previous);
      toast.danger(error instanceof Error ? error.message : "Could not save rate");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: resolvedKey });
      void qc.invalidateQueries({ queryKey: ["pricing", "resolved"] });
    },
  });

  const clear = useMutation({
    mutationFn: async (v: { roomTypeId: string; date: string; fallbackPrice: number }) => {
      const r = await deleteDailyRateOverride(v.roomTypeId, v.date);
      if (!r.success) throw new Error("error" in r ? r.error : "Failed to clear rate override");
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: resolvedKey });
      const previous = qc.getQueryData<ResolvedRate[]>(resolvedKey);
      qc.setQueryData<ResolvedRate[]>(resolvedKey, (current = []) =>
        current.map((cell) =>
          cell.roomTypeId === v.roomTypeId && cell.date === v.date
            ? { ...cell, price: v.fallbackPrice, source: "base" as const }
            : cell
        )
      );
      setEditing(null);
      return { previous };
    },
    onError: (error, _v, context) => {
      if (context?.previous) qc.setQueryData(resolvedKey, context.previous);
      toast.danger(error instanceof Error ? error.message : "Could not clear rate override");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: resolvedKey });
      void qc.invalidateQueries({ queryKey: ["pricing", "resolved"] });
    },
  });

  React.useEffect(() => {
    const sb = createClient();
    const inventory = createCoalescer();
    const rateCoalescer = createCoalescer();
    const report = onRealtimeStatus({
      label: "availability",
      hotelId,
      table: "bookings,daily_rate_overrides",
    });
    const ch = sb
      .channel(`hotel:${hotelId}:merged-inventory`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () => inventory.schedule(() => router.refresh())
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_rate_overrides",
          filter: `hotel_id=eq.${hotelId}`,
        },
        () => rateCoalescer.schedule(() => void qc.invalidateQueries({ queryKey: resolvedKey }))
      )
      .subscribe((s, err) => {
        report(s, err);
      });
    return () => {
      inventory.cancel();
      rateCoalescer.cancel();
      sb.removeChannel(ch);
    };
  }, [hotelId, router, qc, resolvedKey]);

  const start = parseISO(data.startDate);
  const todayKey = data.propertyToday ?? format(new Date(), "yyyy-MM-dd");
  const filtered = data.roomTypeRows.filter(
    (r) => !deferredQuery.trim() || r.name.toLowerCase().includes(deferredQuery.trim().toLowerCase())
  );

  const openEditor = (id: string, date: string, fallbackPrice: number) => {
    setEditing({ roomTypeId: id, date });
    setPrice(String(rateMap.get(`${id}_${date}`)?.price ?? fallbackPrice));
  };

  const navigate = (d: Date, nextDays = data.days) =>
    router.push(`/dashboard/availability?start=${format(d, "yyyy-MM-dd")}&days=${nextDays}`);

  const rangeLabel = `${format(start, "MMM d")} – ${format(
    addDays(start, data.days - 1),
    "MMM d, yyyy"
  )}`;

  const matrixStyle = { "--av-days": data.dates.length } as React.CSSProperties;

  return (
    <div className="availability-page mx-auto w-full max-w-[1600px] space-y-4 pt-1 md:space-y-5">
      {/* Header & compact date/horizon bar */}
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[24px]">
            Availability &amp; rates
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.currency} nightly rates · tap any rate cell to override
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date stepper */}
          <div className="inline-flex items-center rounded-xl border border-border/70 bg-card p-1">
            <button
              type="button"
              aria-label={`Previous ${data.days} days`}
              onClick={() => navigate(subDays(start, data.days))}
              className="ui-press grid size-11 cursor-pointer place-items-center rounded-[9px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-9 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="h-4 w-px bg-border/60" aria-hidden="true" />
            <button
              type="button"
              onClick={() => navigate(parseISO(todayKey))}
              className="ui-press h-11 cursor-pointer rounded-[9px] px-3 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:px-3 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted"
            >
              Today
            </button>
            <div className="h-4 w-px bg-border/60" aria-hidden="true" />
            <button
              type="button"
              aria-label={`Next ${data.days} days`}
              onClick={() => navigate(addDays(start, data.days))}
              className="ui-press grid size-11 cursor-pointer place-items-center rounded-[9px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-9 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Calendar start-date picker */}
          <Popover isOpen={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <Popover.Trigger>
              <button
                type="button"
                aria-label="Pick start date"
                className="ui-press inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-card px-3 text-xs font-semibold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/50"
              >
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
                {rangeLabel}
              </button>
            </Popover.Trigger>
            <Popover.Content
              placement="bottom start"
              className="w-auto rounded-2xl border border-border/60 bg-popover p-0 shadow-xl"
            >
              <Popover.Dialog className="p-3 outline-none">
                <Calendar
                  aria-label="Matrix start date"
                  value={toCalendarDate(start)}
                  onChange={(d) => {
                    if (d) {
                      setDatePickerOpen(false);
                      navigate(fromCalendarDate(d as CalendarDate));
                    }
                  }}
                >
                  <Calendar.Header>
                    <Calendar.NavButton slot="previous" />
                    <Calendar.Heading />
                    <Calendar.NavButton slot="next" />
                  </Calendar.Header>
                  <Calendar.Grid>
                    <Calendar.GridHeader>
                      {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                    </Calendar.GridHeader>
                    <Calendar.GridBody>
                      {(date) => <Calendar.Cell date={date} />}
                    </Calendar.GridBody>
                  </Calendar.Grid>
                </Calendar>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>

          {/* Horizon pills */}
          <div
            role="group"
            aria-label="Visible days"
            className="inline-flex items-center rounded-xl border border-border/60 bg-muted/35 p-1"
          >
            {DAY_PRESETS.map((d) => {
              const active = data.days === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={active}
                  onClick={() => navigate(start, d)}
                  className={cn(
                    "ui-press h-11 min-w-11 cursor-pointer rounded-[9px] px-3 text-xs font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:min-w-0 sm:px-3",
                    active
                      ? "bg-card font-semibold text-foreground shadow-2xs ring-1 ring-border/60"
                      : "text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                  )}
                >
                  {d}d
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="Refresh inventory"
            onClick={() => router.refresh()}
            className="ui-press grid size-12 cursor-pointer place-items-center rounded-xl border border-border/70 bg-card text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-10 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/50 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </header>

      {/* Filter input */}
      <div className="flex items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
            }}
            placeholder="Filter room types…"
            aria-label="Filter room types"
            className="h-11 w-full rounded-xl border border-border/70 bg-card pl-10 pr-10 text-base text-foreground outline-none transition-[border-color] duration-150 placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9 sm:text-[13px]"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setQuery("")}
              className="ui-press absolute right-1 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted-foreground sm:right-2 sm:size-7 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {query.trim() && (
          <p className="font-mono text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {filtered.length}/{data.roomTypeRows.length}
          </p>
        )}
      </div>

      {/* Matrix */}
      <div className="availability-grid-shell" style={matrixStyle}>
        <DateHeader dates={data.dates} todayKey={todayKey} />

        {/* Property-wide totals row */}
        <div className="availability-grid-row availability-grid-total">
          <div className="availability-sticky-cell">
            <strong>All rooms</strong>
            <span>Available · % sold</span>
          </div>
          {data.totals.map((c) => {
            const weekend = [0, 6].includes(parseISO(c.date).getDay());
            return (
              <div
                key={c.date}
                className={cn(
                  "availability-total-cell",
                  weekend && "is-weekend",
                  c.date === todayKey && "is-today"
                )}
              >
                <strong className={c.available === 0 ? "text-amber-600" : undefined}>
                  {c.available}
                </strong>
                <span>{c.occupancy}%</span>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-semibold text-foreground">
              {query.trim()
                ? `No room types match “${query.trim()}”`
                : "No active room types"}
            </p>
            {query.trim() && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="ui-press mt-3 inline-flex min-h-9 cursor-pointer items-center rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          filtered.map((row) => (
            <React.Fragment key={row.id}>
              {/* Room type availability row */}
              <div className="availability-grid-row availability-room-type-heading">
                <div className="availability-sticky-cell">
                  <strong>{row.name}</strong>
                  <span>
                    {row.roomCount} {row.roomCount === 1 ? "room" : "rooms"}
                  </span>
                </div>
                {row.cells.map((c) => {
                  const weekend = [0, 6].includes(parseISO(c.date).getDay());
                  return (
                    <div
                      key={c.date}
                      className={cn(
                        "availability-total-cell",
                        weekend && "is-weekend",
                        c.date === todayKey && "is-today"
                      )}
                    >
                      <strong className={c.available === 0 ? "text-amber-600" : undefined}>
                        {c.available}
                      </strong>
                    </div>
                  );
                })}
              </div>

              {/* Editable nightly rate row */}
              <div className="availability-grid-row">
                <div className="availability-sticky-cell">
                  <span>Rate ({data.currency})</span>
                </div>
                {row.cells.map((c) => {
                  const cell = rateMap.get(`${row.id}_${c.date}`);
                  const active = editing?.roomTypeId === row.id && editing.date === c.date;
                  const weekend = [0, 6].includes(parseISO(c.date).getDay());
                  const marks = cell?.restrictions ? restrictionMarkers(cell.restrictions) : [];
                  const displayPrice = cell?.price ?? row.basePrice;

                  return (
                    <Popover
                      key={c.date}
                      isOpen={active}
                      onOpenChange={(open) => {
                        if (open) openEditor(row.id, c.date, row.basePrice);
                        else setEditing(null);
                      }}
                    >
                      <Popover.Trigger>
                        <button
                          type="button"
                          aria-label={`${row.name} rate on ${format(parseISO(c.date), "MMM d")}: ${data.currency} ${displayPrice}`}
                          title={marks.length ? marks.map((m) => m.title).join(" · ") : undefined}
                          className={cn(
                            "availability-rate-cell",
                            weekend && "is-weekend",
                            c.date === todayKey && "is-today",
                            cell?.source === "daily" && "is-daily",
                            cell?.source === "seasonal" && "is-seasonal",
                            cell?.restrictions?.stopSell && "is-stop-sell",
                            marks.length > 0 && "has-restrictions",
                            active && "z-10 ring-2 ring-inset ring-primary"
                          )}
                        >
                          <strong>{ratesLoading ? "…" : displayPrice}</strong>
                          {cell?.source === "daily" && (
                            <span className="rate-dot" aria-hidden="true" />
                          )}
                          {marks.length > 0 && (
                            <>
                              <span className="rate-restrictions" aria-hidden="true">
                                {marks.slice(0, 2).map((m) => (
                                  <span
                                    key={m.code}
                                    className={cn("rate-restriction", `is-${m.code}`)}
                                  >
                                    {m.label}
                                  </span>
                                ))}
                                {marks.length > 2 && (
                                  <span className="rate-restriction is-more">
                                    +{marks.length - 2}
                                  </span>
                                )}
                              </span>
                              <span className="sr-only">
                                {`${row.name} ${format(parseISO(c.date), "MMM d")}: ${marks.map((m) => m.title).join(". ")}`}
                              </span>
                            </>
                          )}
                        </button>
                      </Popover.Trigger>

                      <Popover.Content
                        placement="bottom"
                        offset={6}
                        className="w-[236px] rounded-2xl border border-border/70 bg-popover p-0 shadow-xl"
                      >
                        <Popover.Dialog className="grid gap-3 p-4 outline-none">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-foreground">
                              {row.name}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                              {format(parseISO(c.date), "EEE, MMM d")}
                            </span>
                          </div>

                          {marks.length > 0 && (
                            <ul className="grid gap-1 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-[11px] leading-snug text-amber-900">
                              {marks.map((m) => (
                                <li key={m.code}>{m.title}</li>
                              ))}
                            </ul>
                          )}

                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                              {data.currency}
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0.01"
                              step="0.01"
                              value={price}
                              onChange={(e) => setPrice(e.target.value)}
                              autoFocus
                              aria-label={`Nightly rate in ${data.currency}`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const n = Number(price);
                                  if (n > 0)
                                    save.mutate({ roomTypeId: row.id, date: c.date, price: n });
                                }
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className="h-10 w-full rounded-xl border border-border/70 bg-background pl-12 pr-3 font-mono text-base font-semibold tabular-nums text-foreground outline-none focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9 sm:text-sm"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <HeroButton
                              size="sm"
                              variant="primary"
                              isPending={save.isPending}
                              onPress={() => {
                                const n = Number(price);
                                if (n > 0)
                                  save.mutate({ roomTypeId: row.id, date: c.date, price: n });
                              }}
                              className="ui-press h-11 flex-1 rounded-xl text-xs font-semibold sm:h-9"
                            >
                              Save rate
                            </HeroButton>
                            {cell?.source === "daily" && (
                              <HeroButton
                                size="sm"
                                variant="tertiary"
                                isPending={clear.isPending}
                                onPress={() =>
                                  clear.mutate({
                                    roomTypeId: row.id,
                                    date: c.date,
                                    fallbackPrice: row.basePrice,
                                  })
                                }
                                className="ui-press h-11 rounded-xl border border-border/70 bg-background px-3 text-xs font-semibold text-destructive sm:h-9"
                              >
                                Reset
                              </HeroButton>
                            )}
                          </div>
                        </Popover.Dialog>
                      </Popover.Content>
                    </Popover>
                  );
                })}
              </div>
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}

function DateHeader({ dates, todayKey }: { dates: string[]; todayKey: string }) {
  return (
    <div className="availability-grid-row availability-date-header">
      <div className="availability-sticky-cell availability-corner">
        <span>Room type</span>
      </div>
      {dates.map((d) => {
        const p = parseISO(d);
        const weekend = [0, 6].includes(p.getDay());
        return (
          <div
            key={d}
            className={cn(
              "availability-date-cell",
              d === todayKey && "is-today",
              weekend && "is-weekend"
            )}
          >
            <span>{format(p, "EEE")}</span>
            <strong>{format(p, "d")}</strong>
            <small>{format(p, "MMM")}</small>
          </div>
        );
      })}
    </div>
  );
}
