"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO, subDays } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Table2 } from "lucide-react";
import {
  Button,
  ButtonGroup,
  Calendar,
  Card,
  InputGroup,
  Popover,
  SearchField,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
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
import { ListEmpty } from "@/components/ui/list-card";
import { LIST_CARD } from "@/components/ui/list-styles";
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

  const atToday = data.startDate === todayKey;
  const filtering = query.trim().length > 0;

  return (
    <div className="availability-page mx-auto w-full max-w-7xl space-y-6 pt-6 md:pt-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Availability</h1>
        <Tooltip delay={300}>
          <Button isIconOnly variant="secondary" aria-label="Refresh availability" onPress={() => router.refresh()} className="rounded-xl max-md:size-11">
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
          <Tooltip.Content>
            <p>Refresh</p>
          </Tooltip.Content>
        </Tooltip>
      </header>

      {/* Window controls */}
      <div className="flex flex-wrap items-center gap-2">
        <ButtonGroup variant="secondary" className="min-w-0">
          <Button isIconOnly aria-label={`Previous ${data.days} days`} onPress={() => navigate(subDays(start, data.days))} className="text-muted-foreground max-md:size-11">
            <ChevronLeft className="size-4" />
          </Button>
          <Popover isOpen={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <Button
              variant="secondary"
              aria-label={`Change start date, showing ${rangeLabel}`}
              className="min-w-0 gap-2 px-3 font-semibold tabular-nums max-md:h-11"
            >
              <ButtonGroup.Separator />
              <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">{rangeLabel}</span>
            </Button>
            <Popover.Content placement="bottom" className="w-auto rounded-2xl p-0">
              <Popover.Dialog aria-label="Start date" className="p-3 outline-none">
                <Calendar
                  aria-label="Start date"
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
                    <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
                    <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                  </Calendar.Grid>
                </Calendar>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
          <Button isIconOnly aria-label={`Next ${data.days} days`} onPress={() => navigate(addDays(start, data.days))} className="text-muted-foreground max-md:size-11">
            <ButtonGroup.Separator />
            <ChevronRight className="size-4" />
          </Button>
        </ButtonGroup>

        <ToggleButtonGroup
          aria-label="Days shown"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={(DAY_PRESETS as readonly number[]).includes(data.days) ? [String(data.days)] : []}
          onSelectionChange={(keys) => {
            const next = Number([...keys][0]);
            if (next) navigate(start, next);
          }}
        >
          {DAY_PRESETS.map((d, i) => (
            <ToggleButton key={d} id={String(d)} aria-label={`${d} days`} className="tabular-nums max-md:h-11">
              {i > 0 && <ToggleButtonGroup.Separator />}
              {d}d
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {!atToday && (
          <Button variant="ghost" onPress={() => navigate(parseISO(todayKey))} className="font-semibold text-primary max-md:h-11">
            Today
          </Button>
        )}

        <SearchField aria-label="Filter room types" value={query} onChange={setQuery} className="w-full sm:ml-auto sm:w-64">
          <SearchField.Group className="w-full rounded-xl max-md:h-11">
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Filter room types" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <span className="sr-only" aria-live="polite">
          {filtering ? `${filtered.length} of ${data.roomTypeRows.length} room types` : ""}
        </span>
      </div>

      <Card className={LIST_CARD}>
        <div className="availability-grid-shell" style={matrixStyle}>
          <DateHeader dates={data.dates} todayKey={todayKey} />

          {/* Property-wide: rooms left to sell and % sold */}
          <div className="availability-grid-row availability-grid-total">
            <div className="availability-sticky-cell">
              <strong>All rooms</strong>
              <span>Left · sold</span>
            </div>
            {data.totals.map((c) => (
              <div
                key={c.date}
                className={cn("availability-total-cell", isWeekendDay(c.date) && "is-weekend", c.date === todayKey && "is-today")}
              >
                <strong className={c.available === 0 ? "is-full" : undefined}>{c.available}</strong>
                <span>{c.occupancy}%</span>
              </div>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="availability-empty">
              <ListEmpty
                icon={Table2}
                title={filtering ? `No room types match “${query.trim()}”` : "No active room types"}
                action={
                  filtering ? (
                    <Button size="sm" variant="secondary" onPress={() => setQuery("")} className="rounded-xl max-md:h-11">
                      Clear filter
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            filtered.map((row) => (
              <React.Fragment key={row.id}>
                {/* Rooms left for this type */}
                <div className="availability-grid-row availability-room-type-heading">
                  <div className="availability-sticky-cell">
                    <strong>{row.name}</strong>
                    <span>
                      {row.roomCount} {row.roomCount === 1 ? "room" : "rooms"}
                    </span>
                  </div>
                  {row.cells.map((c) => (
                    <div
                      key={c.date}
                      className={cn("availability-total-cell", isWeekendDay(c.date) && "is-weekend", c.date === todayKey && "is-today")}
                    >
                      <strong className={c.available === 0 ? "is-full" : undefined}>{c.available}</strong>
                    </div>
                  ))}
                </div>

                {/* Nightly rate; press a cell to override it */}
                <div className="availability-grid-row">
                  <div className="availability-sticky-cell">
                    <span>Rate · {data.currency}</span>
                  </div>
                  {row.cells.map((c) => {
                    const cell = rateMap.get(`${row.id}_${c.date}`);
                    const active = editing?.roomTypeId === row.id && editing.date === c.date;
                    const marks = cell?.restrictions ? restrictionMarkers(cell.restrictions) : [];
                    const displayPrice = cell?.price ?? row.basePrice;
                    const dayLabel = format(parseISO(c.date), "EEE, MMM d");
                    const sourceLabel = cell?.source === "daily" ? "override" : cell?.source === "seasonal" ? "season rate" : "base rate";

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
                            aria-label={`${row.name}, ${dayLabel}: ${data.currency} ${displayPrice}, ${sourceLabel}${marks.length ? `. ${marks.map((m) => m.title).join(". ")}` : ""}`}
                            title={marks.length ? marks.map((m) => m.title).join(" · ") : undefined}
                            className={cn(
                              "availability-rate-cell",
                              isWeekendDay(c.date) && "is-weekend",
                              c.date === todayKey && "is-today",
                              cell?.source === "daily" && "is-daily",
                              cell?.source === "seasonal" && "is-seasonal",
                              cell?.restrictions?.stopSell && "is-stop-sell",
                              marks.length > 0 && "has-restrictions",
                              active && "is-active"
                            )}
                          >
                            <strong>{ratesLoading ? "…" : displayPrice}</strong>
                            {cell?.source === "daily" && <span className="rate-dot" aria-hidden="true" />}
                            {marks.length > 0 && (
                              <span className="rate-restrictions" aria-hidden="true">
                                {marks.slice(0, 2).map((m) => (
                                  <span key={m.code} className={cn("rate-restriction", `is-${m.code}`)}>
                                    {m.label}
                                  </span>
                                ))}
                                {marks.length > 2 && <span className="rate-restriction is-more">+{marks.length - 2}</span>}
                              </span>
                            )}
                          </button>
                        </Popover.Trigger>

                        <Popover.Content placement="bottom" offset={8} className="w-64 rounded-2xl p-0">
                          <Popover.Dialog aria-label={`${row.name} rate, ${dayLabel}`} className="grid gap-3 p-4 outline-none">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-foreground">{row.name}</span>
                              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{dayLabel}</span>
                            </div>

                            {marks.length > 0 && (
                              <ul className="grid gap-1 rounded-xl bg-amber-500/[0.08] px-3 py-2 text-2xs leading-snug text-amber-900">
                                {marks.map((m) => (
                                  <li key={m.code}>{m.title}</li>
                                ))}
                              </ul>
                            )}

                            <TextField aria-label={`Nightly rate in ${data.currency}`} value={price} onChange={setPrice} type="number" autoFocus className="w-full min-w-0">
                              <InputGroup className="w-full min-w-0 rounded-xl max-md:h-11">
                                <InputGroup.Prefix className="text-xs font-medium text-muted-foreground">{data.currency}</InputGroup.Prefix>
                                <InputGroup.Input
                                  inputMode="decimal"
                                  min="0.01"
                                  step="0.01"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const n = Number(price);
                                      if (n > 0) save.mutate({ roomTypeId: row.id, date: c.date, price: n });
                                    }
                                    if (e.key === "Escape") setEditing(null);
                                  }}
                                  className="min-w-0 font-semibold tabular-nums max-md:text-base"
                                />
                              </InputGroup>
                            </TextField>

                            <div className="flex items-center gap-2">
                              {cell?.source === "daily" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  isPending={clear.isPending}
                                  onPress={() => clear.mutate({ roomTypeId: row.id, date: c.date, fallbackPrice: row.basePrice })}
                                  className="rounded-lg text-danger max-md:h-11"
                                >
                                  Reset
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="primary"
                                isPending={save.isPending}
                                onPress={() => {
                                  const n = Number(price);
                                  if (n > 0) save.mutate({ roomTypeId: row.id, date: c.date, price: n });
                                }}
                                className="ml-auto rounded-lg font-semibold max-md:h-11"
                              >
                                Save rate
                              </Button>
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
      </Card>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Rate colours">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded bg-emerald-500/30" />
          Season rate
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded bg-primary/40" />
          Override
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded bg-danger/20" />
          Closed to sale
        </li>
      </ul>
    </div>
  );
}

function isWeekendDay(date: string) {
  return [0, 6].includes(parseISO(date).getDay());
}

function DateHeader({ dates, todayKey }: { dates: string[]; todayKey: string }) {
  return (
    <div className="availability-grid-row availability-date-header">
      <div className="availability-sticky-cell availability-corner">
        <span>Room type</span>
      </div>
      {dates.map((d) => {
        const p = parseISO(d);
        return (
          <div key={d} className={cn("availability-date-cell", d === todayKey && "is-today", isWeekendDay(d) && "is-weekend")}>
            <span>{format(p, "EEE")}</span>
            <strong>{format(p, "d")}</strong>
            <small>{format(p, "MMM")}</small>
          </div>
        );
      })}
    </div>
  );
}
