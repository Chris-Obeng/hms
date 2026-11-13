"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ButtonGroup,
  Calendar,
  Card,
  FieldError,
  InputGroup,
  Label,
  Popover,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  toast,
} from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import { CalendarDays, ChevronLeft, ChevronRight, Tag } from "lucide-react";
import { format, addDays, subDays, parseISO } from "date-fns";

import { qk } from "@/lib/query-keys";
import { businessToday } from "@/lib/business-date";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toCalendarDate, fromCalendarDate } from "@/lib/date-convert";
import { usePricingStore } from "@/lib/store/pricing-store";
import { ListEmpty } from "@/components/ui/list-card";
import { LIST_CARD } from "@/components/ui/list-styles";
import { RoomsTabs } from "../_components/rooms-tabs";

// Server Actions
import {
  upsertDailyRateOverride,
  deleteDailyRateOverride,
  getResolvedRates,
  getRoomsLeft,
  ResolvedPriceCell,
} from "@/app/actions/pricing";
import { restrictionMarkers } from "@/lib/pricing/restriction-markers";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";

const ENTER = "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-[var(--ease-out-ui)] motion-reduce:animate-none";
const FIELD_LABEL = "text-xs font-medium text-muted-foreground";

/** Day windows on offer; the first is the default. */
const WINDOW_OPTIONS = [14, 30] as const;

/** Prices show as plain numbers; the currency appears once, in the legend and the editor. */
const PRICE_FORMAT = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
function formatPrice(amount: number): string {
  return PRICE_FORMAT.format(amount);
}

interface PricingClientProps {
  hotelId: string;
  orgId: string;
  currency: string;
  hotelTimezone?: string;
  propertyToday?: string;
  canManagePricing?: boolean;
  roomTypes: {
    id: string;
    name: string;
    base_price: number;
    weekend_price: number | null;
  }[];
}

function isWeekend(dateStr: string): boolean {
  const date = parseISO(dateStr);
  const day = date.getDay();
  return day === 5 || day === 6; // Friday and Saturday rate nights (property default)
}

/** The price a night falls back to once its one-night change is removed. */
function baseFallbackCell(
  rt: PricingClientProps["roomTypes"][number] | undefined,
  dateStr: string,
  existingCell?: ResolvedPriceCell
): Pick<ResolvedPriceCell, "price" | "source" | "seasonName"> {
  if (!rt) return { price: existingCell?.price ?? 0, source: "base", seasonName: undefined };
  const price = isWeekend(dateStr) && rt.weekend_price != null ? rt.weekend_price : rt.base_price;
  return { price, source: "base", seasonName: undefined };
}

export function PricingClient({
  hotelId,
  orgId,
  currency,
  hotelTimezone = "UTC",
  propertyToday,
  canManagePricing = true,
  roomTypes,
}: PricingClientProps) {
  const queryClient = useQueryClient();
  const todayStr = propertyToday ?? businessToday(hotelTimezone);

  const { startDateStr, endDateStr, rangeInitialized, setDateRange } = usePricingStore();

  // Popover open state for the start-date picker
  const [rangePopoverOpen, setRangePopoverOpen] = useState(false);

  // Anchor the store to the property's business date on first mount so SSR and
  // the first client queries never use the browser's local date.
  useEffect(() => {
    if (!rangeInitialized) {
      const propStart = todayStr;
      const propEnd = format(addDays(parseISO(todayStr), WINDOW_OPTIONS[0] - 1), "yyyy-MM-dd");
      setDateRange(propStart, propEnd);
    }
  }, [rangeInitialized, setDateRange, todayStr]);

  const effectiveStart = rangeInitialized ? startDateStr : todayStr;
  const effectiveEnd = rangeInitialized
    ? endDateStr
    : format(addDays(parseISO(todayStr), WINDOW_OPTIONS[0] - 1), "yyyy-MM-dd");

  // Generate date columns dynamically based on the current range (timezone-safe calendar math)
  const dateColumns = useMemo(() => {
    const list: string[] = [];
    const start = parseISO(effectiveStart);
    const end = parseISO(effectiveEnd);
    let cur = start;
    while (cur <= end) {
      list.push(format(cur, "yyyy-MM-dd"));
      cur = addDays(cur, 1);
    }
    return list;
  }, [effectiveStart, effectiveEnd]);

  // How many days are in the current window
  const windowDays = Math.max(1, dateColumns.length);

  // Adjust dates viewport — jump by the current window size
  const handlePrevWindow = () => {
    const currentStart = parseISO(effectiveStart);
    const newStart = format(subDays(currentStart, windowDays), "yyyy-MM-dd");
    const newEnd = format(subDays(currentStart, 1), "yyyy-MM-dd");
    setDateRange(newStart, newEnd);
  };

  const handleNextWindow = () => {
    const currentStart = parseISO(effectiveStart);
    const newStart = format(addDays(currentStart, windowDays), "yyyy-MM-dd");
    const newEnd = format(addDays(currentStart, windowDays * 2 - 1), "yyyy-MM-dd");
    setDateRange(newStart, newEnd);
  };

  const handleSetWindow = (days: number) => {
    const base = parseISO(todayStr);
    const start = format(base, "yyyy-MM-dd");
    const end = format(addDays(base, days - 1), "yyyy-MM-dd");
    setDateRange(start, end);
  };

  const handleDateReset = () => {
    handleSetWindow(windowDays);
  };

  // ── Queries ────────────────────────────────────────────────────────

  // Fetch Resolved Pricing for date grid
  const { data: resolvedRates = [], isLoading: loadingRates } = useQuery({
    queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map((rt) => rt.id), effectiveStart, effectiveEnd),
    queryFn: async () => {
      const res = await getResolvedRates(roomTypes.map((rt) => rt.id), effectiveStart, effectiveEnd);
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
    enabled: roomTypes.length > 0,
  });

  // Map resolved rates for fast index lookups
  const resolvedRateMap = useMemo(() => {
    const map = new Map<string, ResolvedPriceCell>();
    resolvedRates.forEach((cell) => {
      map.set(`${cell.roomTypeId}_${cell.date}`, cell);
    });
    return map;
  }, [resolvedRates]);

  // Rooms left to sell per room type per night, and for the whole property
  const { data: roomsLeft = null } = useQuery({
    queryKey: qk.pricingOccupancy(orgId, hotelId, effectiveStart, effectiveEnd),
    queryFn: async () => {
      const res = await getRoomsLeft(effectiveStart, effectiveEnd);
      return res.success ? res.data : null;
    },
    staleTime: 60_000,
  });

  const roomsLeftByCell = useMemo(() => {
    const map = new Map<string, number>();
    roomsLeft?.types.forEach((t) => t.cells.forEach((c) => map.set(`${t.roomTypeId}_${c.date}`, c.available)));
    return map;
  }, [roomsLeft]);

  // Realtime: bookings change rooms left; overrides made elsewhere change rates.
  useEffect(() => {
    const supabase = createClient();
    const inventory = createCoalescer();
    const rates = createCoalescer();
    const channel = supabase
      .channel(`hotel:${hotelId}:rates`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` }, () =>
        inventory.schedule(() => void queryClient.invalidateQueries({ queryKey: ["pricing", "occupancy"] }))
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_rate_overrides", filter: `hotel_id=eq.${hotelId}` }, () =>
        rates.schedule(() => void queryClient.invalidateQueries({ queryKey: ["pricing", "resolved"] }))
      )
      .subscribe(onRealtimeStatus({ label: "rates", hotelId, table: "bookings,daily_rate_overrides" }));
    return () => {
      inventory.cancel();
      rates.cancel();
      void supabase.removeChannel(channel);
    };
  }, [hotelId, queryClient]);

  // Single Cell Daily Override Mutation
  const saveDailyOverrideMutation = useMutation({
    mutationFn: async ({ roomTypeId, date, price }: { roomTypeId: string; date: string; price: number }) => {
      const res = await upsertDailyRateOverride(roomTypeId, date, price);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onMutate: async (variables) => {
      const queryKey = qk.pricingResolved(
        orgId,
        hotelId,
        roomTypes.map((rt) => rt.id),
        effectiveStart,
        effectiveEnd
      );
      await queryClient.cancelQueries({ queryKey });
      const previousRates = queryClient.getQueryData<ResolvedPriceCell[]>(queryKey);

      if (previousRates) {
        const updated = previousRates.map((cell) => {
          if (cell.roomTypeId === variables.roomTypeId && cell.date === variables.date) {
            return {
              ...cell,
              price: variables.price,
              source: "daily" as const,
            };
          }
          return cell;
        });
        queryClient.setQueryData(queryKey, updated);
      }

      return { previousRates, queryKey };
    },
    onSuccess: () => {
      toast.success("Price updated");
    },
    onError: (err, _variables, context) => {
      if (context?.previousRates && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousRates);
      }
      toast.danger(err.message || "Failed to update price");
    },
    onSettled: (_data, _err, _variables, context) => {
      const queryKey =
        context?.queryKey ??
        qk.pricingResolved(
          orgId,
          hotelId,
          roomTypes.map((rt) => rt.id),
          effectiveStart,
          effectiveEnd
        );
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  // Clear Single Cell Daily Override (Optimistic)
  const clearDailyOverrideMutation = useMutation({
    mutationFn: async ({ roomTypeId, date }: { roomTypeId: string; date: string }) => {
      const res = await deleteDailyRateOverride(roomTypeId, date);
      if (!res.success) {
        throw new Error(res.error || "Failed to clear daily override");
      }
    },
    onMutate: async (variables) => {
      const queryKey = qk.pricingResolved(
        orgId,
        hotelId,
        roomTypes.map((rt) => rt.id),
        effectiveStart,
        effectiveEnd
      );
      await queryClient.cancelQueries({ queryKey });
      const previousRates = queryClient.getQueryData<ResolvedPriceCell[]>(queryKey);
      if (previousRates) {
        const rt = roomTypes.find((r) => r.id === variables.roomTypeId);
        queryClient.setQueryData(
          queryKey,
          previousRates.map((cell) => {
            if (cell.roomTypeId !== variables.roomTypeId || cell.date !== variables.date) {
              return cell;
            }
            const fallback = baseFallbackCell(rt, variables.date, cell);
            return { ...cell, ...fallback };
          })
        );
      }
      return { previousRates, queryKey };
    },
    onSuccess: () => {
      toast.success("Override cleared");
    },
    onError: (err, _variables, context) => {
      if (context?.previousRates && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousRates);
      }
      toast.danger(err.message || "Failed to clear override");
    },
    onSettled: (_data, _err, _variables, context) => {
      const queryKey =
        context?.queryKey ??
        qk.pricingResolved(
          orgId,
          hotelId,
          roomTypes.map((rt) => rt.id),
          effectiveStart,
          effectiveEnd
        );
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const isWindowAtToday = effectiveStart === todayStr;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pt-6 md:pt-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Rooms</h1>
      </header>

      <RoomsTabs />

      <div className={cn("space-y-4", ENTER)}>
        {/* Window controls */}
        <div className="flex flex-wrap items-center gap-2">
          <ButtonGroup variant="secondary" className="min-w-0">
            <Button isIconOnly aria-label="Previous dates" onPress={handlePrevWindow} className="text-muted-foreground max-md:size-11">
              <ChevronLeft className="size-4" />
            </Button>
            <Popover isOpen={rangePopoverOpen} onOpenChange={setRangePopoverOpen}>
              <Button
                variant="secondary"
                aria-label={`Change start date, showing ${format(parseISO(effectiveStart), "MMM d")} to ${format(parseISO(effectiveEnd), "MMM d, yyyy")}`}
                className="min-w-0 gap-2 px-3 font-semibold tabular-nums max-md:h-11"
              >
                <ButtonGroup.Separator />
                <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">
                  {format(parseISO(effectiveStart), "MMM d")} – {format(parseISO(effectiveEnd), "MMM d, yyyy")}
                </span>
              </Button>
              <Popover.Content placement="bottom" className="w-auto rounded-2xl p-0">
                <Popover.Dialog aria-label="Start date" className="p-3 outline-none">
                  <Calendar
                    aria-label="Start date"
                    value={toCalendarDate(parseISO(effectiveStart))}
                    onChange={(d) => {
                      if (!d) return;
                      const startDate = fromCalendarDate(d as CalendarDate);
                      setDateRange(format(startDate, "yyyy-MM-dd"), format(addDays(startDate, windowDays - 1), "yyyy-MM-dd"));
                      setRangePopoverOpen(false);
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
            <Button isIconOnly aria-label="Next dates" onPress={handleNextWindow} className="text-muted-foreground max-md:size-11">
              <ButtonGroup.Separator />
              <ChevronRight className="size-4" />
            </Button>
          </ButtonGroup>

          <ToggleButtonGroup
            aria-label="Days shown"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={(WINDOW_OPTIONS as readonly number[]).includes(windowDays) ? [String(windowDays)] : []}
            onSelectionChange={(keys) => {
              const next = Number([...keys][0]);
              if (next) handleSetWindow(next);
            }}
          >
            {WINDOW_OPTIONS.map((d, i) => (
              <ToggleButton key={d} id={String(d)} className="tabular-nums max-md:h-11">
                {i > 0 && <ToggleButtonGroup.Separator />}
                {d} days
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {!isWindowAtToday && (
            <Button variant="ghost" onPress={handleDateReset} className="font-semibold text-primary max-md:h-11">
              Today
            </Button>
          )}

          <RateLegend currency={currency} canEdit={canManagePricing} />
        </div>

        {roomTypes.length === 0 ? (
          <Card className={LIST_CARD}>
            <ListEmpty icon={Tag} title="No active room types" />
          </Card>
        ) : (
          <>
            {/* Desktop: room types down, nights across. Each price opens its own editor. */}
            <Card className={cn(LIST_CARD, "hidden lg:flex")}>
              {loadingRates ? (
                <div className="space-y-3 p-6">
                  {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
                </div>
              ) : (
                <div className="native-scroll overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th scope="col" className="sticky left-0 z-10 w-48 min-w-48 bg-card px-6 pb-3 pt-4 text-left align-bottom text-xs font-medium text-muted-foreground">
                          Room type
                        </th>
                        {dateColumns.map((dateStr, index) => {
                          const d = parseISO(dateStr);
                          const isToday = dateStr === todayStr;
                          const showMonth = index === 0 || d.getDate() === 1;
                          return (
                            <th
                              key={dateStr}
                              scope="col"
                              aria-label={format(d, "EEEE, MMMM d")}
                              className={cn("min-w-16 px-1 pb-3 pt-4 text-center align-bottom font-normal", isWeekend(dateStr) && "bg-secondary/50")}
                            >
                              <span className={cn("block text-2xs text-muted-foreground", isToday && "font-medium text-primary")}>
                                {isToday ? "Today" : format(d, "EEE")}
                              </span>
                              <span
                                className={cn(
                                  "mx-auto mt-1 flex h-6 w-fit min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums text-foreground",
                                  isToday && "bg-primary text-primary-foreground"
                                )}
                              >
                                {showMonth ? format(d, "MMM d") : format(d, "d")}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {roomTypes.map((rt) => (
                        <tr key={rt.id} className="border-t border-border/60">
                          <th scope="row" className="sticky left-0 z-10 bg-card px-6 py-2 text-left align-middle font-normal">
                            <span className="block max-w-40 truncate text-sm font-semibold text-foreground">{rt.name}</span>
                            <span className="mt-1 block text-2xs tabular-nums text-muted-foreground">Base {formatPrice(rt.base_price)}</span>
                          </th>
                          {dateColumns.map((dateStr) => (
                            <td key={dateStr} className={cn("px-1 py-2 align-middle", isWeekend(dateStr) && "bg-secondary/50")}>
                              <RateCell
                                layout="grid"
                                roomTypeName={rt.name}
                                dateStr={dateStr}
                                isToday={dateStr === todayStr}
                                cell={resolvedRateMap.get(`${rt.id}_${dateStr}`)}
                                left={roomsLeftByCell.get(`${rt.id}_${dateStr}`)}
                                currency={currency}
                                canEdit={canManagePricing}
                                onSave={(price) => saveDailyOverrideMutation.mutate({ roomTypeId: rt.id, date: dateStr, price })}
                                onReset={() => clearDailyOverrideMutation.mutate({ roomTypeId: rt.id, date: dateStr })}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Below lg: one card per room type with a tile per night */}
            <div className="space-y-4 lg:hidden">
              {roomTypes.map((rt) => (
                <Card key={rt.id} className="gap-4 rounded-3xl border border-border/60 p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="truncate text-md font-semibold text-foreground">{rt.name}</h2>
                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground">Base {formatPrice(rt.base_price)}</p>
                  </div>
                  {loadingRates ? (
                    <Skeleton className="h-16 w-full rounded-2xl" />
                  ) : (
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
                      {dateColumns.map((dateStr) => (
                        <li key={dateStr} className="min-w-0">
                          <RateCell
                            layout="tile"
                            roomTypeName={rt.name}
                            dateStr={dateStr}
                            isToday={dateStr === todayStr}
                            cell={resolvedRateMap.get(`${rt.id}_${dateStr}`)}
                            left={roomsLeftByCell.get(`${rt.id}_${dateStr}`)}
                            currency={currency}
                            canEdit={canManagePricing}
                            onSave={(price) => saveDailyOverrideMutation.mutate({ roomTypeId: rt.id, date: dateStr, price })}
                            onReset={() => clearDailyOverrideMutation.mutate({ roomTypeId: rt.id, date: dateStr })}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function leftLabel(left: number) {
  return left === 0 ? "Full" : `${left} left`;
}

/** Where a night's price comes from, in words, for the editor. */
function sourceText(cell: ResolvedPriceCell | undefined): string {
  if (!cell) return "";
  if (cell.source === "daily") return "Changed for this night only";
  if (cell.source === "seasonal") return "Season price";
  return cell.isWeekend ? "Base weekend price" : "Base price";
}

/** One line beside the toolbar: the currency, the one highlight, and how to edit. */
function RateLegend({ currency, canEdit }: { currency: string; canEdit: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground lg:ml-auto" aria-label="Price key">
      <li>Prices in {currency}</li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
        Changed for one night
      </li>
      {canEdit && <li>Select a price to change it</li>}
    </ul>
  );
}

interface RateCellProps {
  layout: "grid" | "tile";
  roomTypeName: string;
  dateStr: string;
  isToday: boolean;
  cell: ResolvedPriceCell | undefined;
  left: number | undefined;
  currency: string;
  canEdit: boolean;
  onSave: (price: number) => void;
  onReset: () => void;
}

/** A night's price. Managers tap it to open a small editor in a popover. */
function RateCell({ layout, roomTypeName, dateStr, isToday, cell, left, currency, canEdit, onSave, onReset }: RateCellProps) {
  const [open, setOpen] = useState(false);
  const date = parseISO(dateStr);
  const marks = cell?.restrictions ? restrictionMarkers(cell.restrictions) : [];
  const stopSell = !!cell?.restrictions?.stopSell;
  const isTile = layout === "tile";

  // Only a one-night change stands out.
  const priceTone = cell?.source === "daily" ? "text-primary" : "text-foreground";

  const body = (
    <>
      {isTile && (
        <span className={cn("text-xs text-muted-foreground", isToday && "font-medium text-primary")}>
          {isToday ? "Today" : format(date, date.getDate() === 1 ? "MMM d" : "EEE d")}
        </span>
      )}
      {cell ? (
        <span className={cn("font-semibold tabular-nums", isTile ? "text-md" : "text-sm", priceTone, stopSell && "text-muted-foreground line-through")}>
          {formatPrice(cell.price)}
        </span>
      ) : (
        <Skeleton className="h-4 w-12 rounded-md" />
      )}
      {(left !== undefined || marks.length > 0) && (
        <span className="flex items-center gap-1 whitespace-nowrap text-2xs tabular-nums">
          {left !== undefined && (
            <span className={left === 0 ? "font-medium text-amber-700" : "text-muted-foreground"}>{leftLabel(left)}</span>
          )}
          {marks[0] && (
            <span className={cn("font-semibold", marks[0].code === "stop" ? "text-danger" : "text-amber-800")}>
              {marks[0].label}
              {marks.length > 1 ? ` +${marks.length - 1}` : ""}
            </span>
          )}
        </span>
      )}
      {cell?.source === "daily" && (
        <span aria-hidden="true" className={cn("absolute size-2 rounded-full bg-primary", isTile ? "right-3 top-3" : "right-1 top-1")} />
      )}
    </>
  );

  const shape = isTile
    ? cn(
        "relative flex min-h-16 w-full flex-col items-start gap-1 rounded-2xl border border-border/60 p-3 text-left",
        isToday ? "border-primary/40" : "",
        isWeekend(dateStr) ? "bg-secondary/50" : "bg-card"
      )
    : "relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-center";

  const label = `${roomTypeName}, ${format(date, "EEEE, MMMM d")}: ${cell ? `${formatPrice(cell.price)} ${currency}` : "loading"}${cell ? `, ${sourceText(cell)}` : ""}${left !== undefined ? `, ${leftLabel(left)}` : ""}${marks.length ? `. ${marks.map((m) => m.title).join(". ")}` : ""}`;

  if (!canEdit || !cell) {
    return (
      <div aria-label={label} role="group" className={shape}>
        {body}
      </div>
    );
  }

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`${label}. Change price`}
        className={cn(
          shape,
          "cursor-pointer outline-none transition-[background-color,transform] duration-150 ease-[var(--ease-out-ui)] focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
          "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary",
          isTile && "active:scale-[0.97]",
          open && "bg-primary/10 ring-2 ring-primary"
        )}
      >
        {body}
      </Popover.Trigger>
      <Popover.Content placement="bottom" className="w-72 rounded-2xl p-0">
        <Popover.Dialog aria-label={`${roomTypeName}, ${format(date, "EEEE, MMMM d")}`} className="p-0 outline-none">
          <RateEditor
            roomTypeName={roomTypeName}
            dateStr={dateStr}
            cell={cell}
            left={left}
            currency={currency}
            notes={marks.map((m) => m.title)}
            onClose={() => setOpen(false)}
            onSave={(price) => {
              setOpen(false);
              onSave(price);
            }}
            onReset={() => {
              setOpen(false);
              onReset();
            }}
          />
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

/** The popover body: one price field, where the price comes from, and Save. */
function RateEditor({ roomTypeName, dateStr, cell, left, currency, notes, onClose, onSave, onReset }: {
  roomTypeName: string;
  dateStr: string;
  cell: ResolvedPriceCell;
  left: number | undefined;
  currency: string;
  notes: string[];
  onClose: () => void;
  onSave: (price: number) => void;
  onReset: () => void;
}) {
  const [value, setValue] = useState(String(cell.price));
  const price = Number.parseFloat(value);
  const isValid = Number.isFinite(price) && price >= 0.01;

  const submit = () => {
    if (!isValid) return;
    if (price === cell.price) {
      onClose();
      return;
    }
    onSave(price);
  };

  return (
    <form
      className="grid gap-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="min-w-0">
        <Popover.Heading className="truncate text-sm font-semibold text-foreground">{roomTypeName}</Popover.Heading>
        <p className="mt-1 text-xs text-muted-foreground">
          {format(parseISO(dateStr), "EEEE, MMM d")}
          {left !== undefined ? ` · ${left === 0 ? "Sold out" : `${left} left`}` : ""}
        </p>
      </div>

      <TextField value={value} onChange={setValue} type="number" isInvalid={value !== "" && !isValid} autoFocus className="w-full min-w-0">
        <Label className={FIELD_LABEL}>Price per night</Label>
        <InputGroup className="w-full min-w-0 rounded-xl max-md:h-11">
          <InputGroup.Prefix className="text-xs font-medium text-muted-foreground">{currency}</InputGroup.Prefix>
          <InputGroup.Input
            inputMode="decimal"
            min="0.01"
            step="0.01"
            onFocus={(event) => event.target.select()}
            className="min-w-0 tabular-nums max-md:text-base"
          />
        </InputGroup>
        <FieldError>Enter a price above 0</FieldError>
      </TextField>

      <p className="text-xs text-muted-foreground">{sourceText(cell)}</p>

      {notes.length > 0 && (
        <ul className="grid gap-1 rounded-xl bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-900">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        {cell.source === "daily" && (
          <Button size="sm" variant="ghost" onPress={onReset} className="rounded-lg text-danger max-md:h-11">
            Reset
          </Button>
        )}
        <Button size="sm" variant="tertiary" onPress={onClose} className="ml-auto rounded-lg max-md:h-11">
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary" isDisabled={!isValid} className="rounded-lg font-semibold max-md:h-11">
          Save
        </Button>
      </div>
    </form>
  );
}
