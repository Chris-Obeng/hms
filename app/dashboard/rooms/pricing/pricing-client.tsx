"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AlertDialog,
  Button,
  ButtonGroup,
  Calendar,
  Card,
  Chip,
  DateField,
  DateRangePicker,
  Drawer,
  Dropdown,
  FieldError,
  Input,
  InputGroup,
  Label,
  Modal,
  Popover,
  RangeCalendar,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  toast,
} from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import { parseDate as parseCalendarDate } from "@internationalized/date";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  EllipsisVertical,
  Pencil,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { format, addDays, subDays, parseISO } from "date-fns";

import { qk } from "@/lib/query-keys";
import { businessToday } from "@/lib/business-date";
import { useIsMobile } from "@/hooks/use-mobile";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toCalendarDate, fromCalendarDate } from "@/lib/date-convert";
import { usePricingStore } from "@/lib/store/pricing-store";
import { ListEmpty } from "@/components/ui/list-card";
import { LIST_CARD, LIST_HEADER, LIST_ROWS } from "@/components/ui/list-styles";
import { RoomsTabs } from "../_components/rooms-tabs";

// Server Actions
import {
  createSeasonalRate,
  updateSeasonalRate,
  deleteSeasonalRate,
  duplicateSeasonalRate,
  upsertSeasonalRateOverride,
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

/** Seasons list: one template for header band and rows (lg and up). */
const SEASON_GRID =
  "lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_7rem_6rem_10rem] lg:items-center lg:gap-4";

/** Calm, distinct fills for the season timeline bars. */
const SEASON_BAR = [
  "bg-primary/80",
  "bg-emerald-500/80",
  "bg-violet-500/80",
  "bg-amber-500/80",
  "bg-rose-500/80",
  "bg-cyan-600/80",
];

interface PricingClientProps {
  hotelId: string;
  orgId: string;
  currency: string;
  hotelTimezone?: string;
  propertyToday?: string;
  canManagePricing?: boolean;
  initialTab?: "calendar" | "seasons";
  roomTypes: {
    id: string;
    name: string;
    base_price: number;
    weekend_price: number | null;
  }[];
}

interface SeasonOverrideRow {
  id: string;
  room_type_id: string;
  base_price: number;
  weekend_price: number | null;
}

interface SeasonRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  /** Higher wins where seasons cover the same night. See lib/pricing/season-layering.ts. */
  priority: number;
  overrides: SeasonOverrideRow[];
}

function isWeekend(dateStr: string): boolean {
  const date = parseISO(dateStr);
  const day = date.getDay();
  return day === 5 || day === 6; // Friday and Saturday rate nights (property default)
}

function resolveFallbackCell(
  rt: PricingClientProps["roomTypes"][number] | undefined,
  dateStr: string,
  seasons: SeasonRow[],
  existingCell?: ResolvedPriceCell
): Pick<ResolvedPriceCell, "price" | "source" | "seasonName"> {
  const we = isWeekend(dateStr);
  // `seasons` is ordered priority DESC, start_date ASC — first covering season wins
  const coveringSeason = seasons.find((s) => s.start_date <= dateStr && s.end_date >= dateStr);
  if (coveringSeason && rt) {
    const override = coveringSeason.overrides?.find((o) => o.room_type_id === rt.id);
    if (override) {
      const price = we && override.weekend_price != null ? override.weekend_price : override.base_price;
      return { price, source: "seasonal", seasonName: coveringSeason.name };
    }
    const basePrice = we && rt.weekend_price != null ? rt.weekend_price : rt.base_price;
    return { price: basePrice, source: "base", seasonName: coveringSeason.name };
  }
  if (rt) {
    const basePrice = we && rt.weekend_price != null ? rt.weekend_price : rt.base_price;
    return { price: basePrice, source: "base", seasonName: undefined };
  }
  return { price: existingCell?.price ?? 0, source: "base", seasonName: undefined };
}

export function PricingClient({
  hotelId,
  orgId,
  currency,
  hotelTimezone = "UTC",
  propertyToday,
  canManagePricing = true,
  initialTab,
  roomTypes,
}: PricingClientProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  // The Rates / Seasons route tabs set ?tab=; the store mirrors it for other readers.
  const searchParams = useSearchParams();
  const view: "calendar" | "seasons" = searchParams.get("tab") === "seasons" ? "seasons" : "calendar";
  const todayStr = propertyToday ?? businessToday(hotelTimezone);

  // Connect state to Zustand store
  const {
    activeTab,
    setActiveTab,
    newSeasonOpen,
    setNewSeasonOpen,
    editSeasonId,
    setEditSeasonId,
    seasonDetailOpen,
    setSeasonDetailOpen,
    startDateStr,
    endDateStr,
    rangeInitialized,
    setDateRange,
  } = usePricingStore();

  // Local component states
  const [seasonName, setSeasonName] = useState("");
  const [seasonStart, setSeasonStart] = useState<Date | undefined>(undefined);
  const [seasonEnd, setSeasonEnd] = useState<Date | undefined>(undefined);
  // Layer for overlapping seasons — higher wins. Held as a string because it is
  // bound to a text input; coerced once, below, before it reaches the action.
  const [seasonPriority, setSeasonPriority] = useState("0");
  const [selectedSeasonForOverrides, setSelectedSeasonForOverrides] = useState<SeasonRow | null>(null);
  const [seasonalOverrides, setSeasonalOverrides] = useState<Record<string, { basePrice: string; weekendPrice: string }>>({});

  // Popover open states for date pickers
  const [rangePopoverOpen, setRangePopoverOpen] = useState(false);

  // Anchor the Zustand store to the property's business date on first mount
  // so SSR + initial client queries never fire with browser-local `new Date()`.
  const didSyncInitialTabRef = React.useRef(false);
  useEffect(() => {
    if (!didSyncInitialTabRef.current) {
      didSyncInitialTabRef.current = true;
      if (initialTab) setActiveTab(initialTab);
    }
    if (!rangeInitialized) {
      const propStart = todayStr;
      const propEnd = format(addDays(parseISO(todayStr), WINDOW_OPTIONS[0] - 1), "yyyy-MM-dd");
      setDateRange(propStart, propEnd);
    }
  }, [initialTab, rangeInitialized, setActiveTab, setDateRange, todayStr]);

  useEffect(() => {
    if (activeTab !== view) setActiveTab(view);
  }, [activeTab, view, setActiveTab]);

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

  // Fetch Seasons
  const { data: seasons = [], isLoading: loadingSeasons } = useQuery({
    queryKey: qk.pricingSeasons(orgId, hotelId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("seasonal_rates")
        .select(`
          id,
          name,
          start_date,
          end_date,
          priority,
          overrides:seasonal_rate_overrides (
            id,
            room_type_id,
            base_price,
            weekend_price
          )
        `)
        .eq("hotel_id", hotelId)
        // Highest layer first, then chronological — the same order the resolver
        // reads, so the timeline and the table show which season actually wins.
        .order("priority", { ascending: false })
        .order("start_date", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

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

  // "Apply to all room types" shortcut state (used in Configure Rates sheet)
  const [applyAllBase, setApplyAllBase] = useState("");
  const [applyAllWeekend, setApplyAllWeekend] = useState("");

  // An empty or unparseable input means layer 0 — the same value the server
  // action's schema defaults to, so the two never disagree.
  const seasonPriorityValue = useMemo(() => {
    const parsed = Number.parseInt(seasonPriority, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 1000) : 0;
  }, [seasonPriority]);

  // Client-side overlap validation helper.
  // Only SAME-priority overlap is a problem, and it is the only shape the DB
  // rejects (seasonal_rates_no_same_priority_overlap) — two seasons on one layer
  // leave the resolver with no way to order them. Overlap across different
  // priorities is the layering feature itself (a conference week inside a summer
  // season), so it must not be blocked here.
  const clientOverlapSeason = useMemo(() => {
    if (!seasonStart || !seasonEnd) return null;
    const startStr = format(seasonStart, "yyyy-MM-dd");
    const endStr = format(seasonEnd, "yyyy-MM-dd");

    return seasons.find((s) => {
      // Skip check if editing same season
      if (editSeasonId && s.id === editSeasonId) return false;
      if (s.priority !== seasonPriorityValue) return false;
      return startStr <= s.end_date && endStr >= s.start_date;
    });
  }, [seasonStart, seasonEnd, seasons, editSeasonId, seasonPriorityValue]);

  // ── Mutations ──────────────────────────────────────────────────────

  // Create Season
  const createSeasonMutation = useMutation({
    mutationFn: async () => {
      if (!seasonStart || !seasonEnd || !seasonName.trim()) {
        throw new Error("All fields are required");
      }
      const startStr = format(seasonStart, "yyyy-MM-dd");
      const endStr = format(seasonEnd, "yyyy-MM-dd");
      const res = await createSeasonalRate(seasonName, startStr, endStr, seasonPriorityValue);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Season created successfully");
      queryClient.invalidateQueries({ queryKey: qk.pricingSeasons(orgId, hotelId) });
      // The rate grid labels every night with the season covering it, so a new
      // season changes those cells even before any override is configured.
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), effectiveStart, effectiveEnd) });
      setNewSeasonOpen(false);
      resetSeasonForm();
    },
    onError: (err) => {
      toast.danger(err.message || "Failed to create season");
    },
  });

  // Update Season
  const updateSeasonMutation = useMutation({
    mutationFn: async () => {
      if (!editSeasonId || !seasonStart || !seasonEnd || !seasonName.trim()) {
        throw new Error("All fields are required");
      }
      const startStr = format(seasonStart, "yyyy-MM-dd");
      const endStr = format(seasonEnd, "yyyy-MM-dd");
      const res = await updateSeasonalRate(editSeasonId, seasonName, startStr, endStr, seasonPriorityValue);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Season updated successfully");
      queryClient.invalidateQueries({ queryKey: qk.pricingSeasons(orgId, hotelId) });
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), effectiveStart, effectiveEnd) });
      setNewSeasonOpen(false);
      setEditSeasonId(null);
      resetSeasonForm();
    },
    onError: (err) => {
      toast.danger(err.message || "Failed to update season");
    },
  });

  // Delete Season
  const deleteSeasonMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteSeasonalRate(id);
      if (!res.success) {
        throw new Error(res.error || "Failed to delete season");
      }
    },
    onSuccess: () => {
      toast.success("Season deleted successfully");
      queryClient.invalidateQueries({ queryKey: qk.pricingSeasons(orgId, hotelId) });
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), effectiveStart, effectiveEnd) });
    },
    onError: (err) => {
      toast.danger(err.message || "Failed to delete season");
    },
  });

  // Duplicate Season
  const duplicateSeasonMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await duplicateSeasonalRate(id);
      if (!res.success) {
        throw new Error(res.error || "Failed to duplicate season");
      }
      return res.data;
    },
    onSuccess: () => {
      toast.success("Season duplicated — update the name and dates as needed.");
      queryClient.invalidateQueries({ queryKey: qk.pricingSeasons(orgId, hotelId) });
      // The copy inherits the source's override rows, so resolved rates move too.
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), effectiveStart, effectiveEnd) });
    },
    onError: (err) => {
      toast.danger(err.message || "Failed to duplicate season");
    },
  });

  // Upsert Seasonal Overrides
  const saveSeasonalOverridesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSeasonForOverrides) return;
      const seasonId = selectedSeasonForOverrides.id;

      // Separate valid entries from skipped ones before hitting the server
      const toSave: { roomTypeId: string; base: number; weekend: number | null; name: string }[] = [];
      const skipped: string[] = [];

      Object.entries(seasonalOverrides).forEach(([roomTypeId, prices]) => {
        const base = parseFloat(prices.basePrice);
        const weekend = prices.weekendPrice ? parseFloat(prices.weekendPrice) : null;

        if (!prices.basePrice.trim()) {
          // Blank — user intentionally left empty, silently skip (no override)
          return;
        }
        if (isNaN(base) || base <= 0) {
          const rt = roomTypes.find((r) => r.id === roomTypeId);
          skipped.push(rt?.name ?? roomTypeId);
          return;
        }

        toSave.push({ roomTypeId, base, weekend, name: roomTypes.find((r) => r.id === roomTypeId)?.name ?? roomTypeId });
      });

      if (skipped.length > 0) {
        toast.warning(`Skipped invalid prices for: ${skipped.join(", ")}. Fix and save again.`);
      }

      if (toSave.length === 0) return;

      const upsertPromises = toSave.map(async ({ roomTypeId, base, weekend }) => {
        const res = await upsertSeasonalRateOverride(seasonId, roomTypeId, base, weekend);
        if (!res.success) throw new Error(res.error);
      });

      await Promise.all(upsertPromises);
    },
    onSuccess: () => {
      toast.success("Seasonal room rates updated successfully");
      queryClient.invalidateQueries({ queryKey: qk.pricingSeasons(orgId, hotelId) });
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), effectiveStart, effectiveEnd) });
      setSeasonDetailOpen(false);
    },
    onError: (err) => {
      toast.danger(err.message || "Failed to save seasonal overrides");
    },
  });

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
            const fallback = resolveFallbackCell(rt, variables.date, seasons, cell);
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

  // ── Functions ──────────────────────────────────────────────────────

  const resetSeasonForm = () => {
    setSeasonName("");
    setSeasonStart(undefined);
    setSeasonEnd(undefined);
    setSeasonPriority("0");
  };

  const handleOpenEditSeason = (season: SeasonRow) => {
    setEditSeasonId(season.id);
    setSeasonName(season.name);
    setSeasonStart(parseISO(season.start_date));
    setSeasonEnd(parseISO(season.end_date));
    setSeasonPriority(String(season.priority));
  };

  const handleOpenOverrides = (season: SeasonRow) => {
    setSelectedSeasonForOverrides(season);
    setApplyAllBase("");
    setApplyAllWeekend("");
    
    // Prefill form
    const overridesMap: Record<string, { basePrice: string; weekendPrice: string }> = {};
    roomTypes.forEach((rt) => {
      const match = season.overrides?.find((o) => o.room_type_id === rt.id);
      overridesMap[rt.id] = {
        basePrice: match ? String(match.base_price) : "",
        weekendPrice: match && match.weekend_price ? String(match.weekend_price) : "",
      };
    });

    setSeasonalOverrides(overridesMap);
    setSeasonDetailOpen(true);
  };

  // Season status: past, active or upcoming relative to the property date
  const getSeasonStatus = (startDate: string, endDate: string) => {
    if (endDate < todayStr) return <Chip size="sm" variant="soft" color="default">Past</Chip>;
    if (startDate <= todayStr && endDate >= todayStr) return <Chip size="sm" variant="soft" color="success">Active</Chip>;
    return <Chip size="sm" variant="soft" color="accent">Upcoming</Chip>;
  };

  // ── Render ─────────────────────────────────────────────────────────

  const [seasonToDelete, setSeasonToDelete] = useState<SeasonRow | null>(null);
  const isWindowAtToday = effectiveStart === todayStr;
  const seasonSaving = createSeasonMutation.isPending || updateSeasonMutation.isPending;
  const canSaveSeason = !seasonSaving && !clientOverlapSeason && !!seasonName.trim() && !!seasonStart && !!seasonEnd;

  const closeSeasonModal = (open: boolean) => {
    setNewSeasonOpen(open);
    if (!open) {
      setEditSeasonId(null);
      resetSeasonForm();
    }
  };

  const applyToAll = (field: "basePrice" | "weekendPrice", value: string) => {
    if (!value.trim()) return;
    setSeasonalOverrides((prev) => {
      const next = { ...prev };
      roomTypes.forEach((rt) => {
        next[rt.id] = { ...(next[rt.id] ?? { basePrice: "", weekendPrice: "" }), [field]: value };
      });
      return next;
    });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pt-6 md:pt-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Rooms</h1>
        {canManagePricing && view === "seasons" && (
          <Button variant="primary" onPress={() => setNewSeasonOpen(true)} className="rounded-xl font-semibold max-md:h-11">
            <Plus className="size-4" aria-hidden="true" />
            New season
          </Button>
        )}
      </header>

      <RoomsTabs />

      {view === "calendar" ? (
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
      ) : (
        /* ── Seasons ── */
        <Card className={cn(LIST_CARD, ENTER)}>
          {loadingSeasons ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
            </div>
          ) : seasons.length === 0 ? (
            <ListEmpty
              icon={Tag}
              title="No seasons yet"
              hint="Set rates for holidays or peak months."
              action={
                canManagePricing ? (
                  <Button variant="primary" onPress={() => setNewSeasonOpen(true)} className="rounded-xl font-semibold max-md:h-11">
                    <Plus className="size-4" aria-hidden="true" />
                    New season
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <SeasonTimeline seasons={seasons} todayStr={todayStr} />

              <div className={cn(SEASON_GRID, LIST_HEADER)}>
                <span>Season</span>
                <span>Dates</span>
                <span>Status</span>
                <span>Rates set</span>
                <span className="sr-only">Actions</span>
              </div>
              <ul className={LIST_ROWS}>
                {seasons.map((season, idx) => {
                  const covered = season.overrides?.length || 0;
                  const complete = covered === roomTypes.length;
                  const dates = `${format(parseISO(season.start_date), "MMM d")} – ${format(parseISO(season.end_date), "MMM d, yyyy")}`;
                  return (
                    <li key={season.id} className={cn(SEASON_GRID, "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6")}>
                      <div className="min-w-0 flex-1 lg:flex-none">
                        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", SEASON_BAR[idx % SEASON_BAR.length])} />
                          <span className="truncate">{season.name}</span>
                        </p>
                        <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground lg:hidden">{dates}</p>
                      </div>
                      <span className="hidden text-sm tabular-nums text-foreground lg:block">{dates}</span>
                      <span className="hidden lg:block">{getSeasonStatus(season.start_date, season.end_date)}</span>
                      <span className="flex items-center gap-2 lg:block">
                        <span className="lg:hidden">{getSeasonStatus(season.start_date, season.end_date)}</span>
                        <Chip size="sm" variant="soft" color={complete ? "success" : "warning"}>
                          {covered} of {roomTypes.length}
                        </Chip>
                      </span>
                      {canManagePricing ? (
                        <div className="flex w-full items-center justify-end gap-1 sm:w-auto lg:w-full">
                          <Button size="sm" variant="secondary" onPress={() => handleOpenOverrides(season)} className="rounded-lg font-medium max-md:h-11">
                            Set rates
                          </Button>
                          <Dropdown>
                            <Button isIconOnly size="sm" variant="ghost" aria-label={`Actions for ${season.name}`} className="rounded-lg text-muted-foreground max-md:size-11">
                              <EllipsisVertical className="size-4" />
                            </Button>
                            <Dropdown.Popover placement="bottom end">
                              <Dropdown.Menu
                                aria-label={`Actions for ${season.name}`}
                                onAction={(key) => {
                                  if (key === "edit") {
                                    handleOpenEditSeason(season);
                                    setNewSeasonOpen(true);
                                  }
                                  if (key === "duplicate") duplicateSeasonMutation.mutate(season.id);
                                  if (key === "delete") setSeasonToDelete(season);
                                }}
                              >
                                <Dropdown.Item id="edit" textValue="Edit season">
                                  <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
                                  <Label>Edit season</Label>
                                </Dropdown.Item>
                                <Dropdown.Item id="duplicate" textValue="Duplicate" isDisabled={duplicateSeasonMutation.isPending}>
                                  <Copy className="size-4 text-muted-foreground" aria-hidden="true" />
                                  <Label>Duplicate</Label>
                                </Dropdown.Item>
                                <Dropdown.Item id="delete" textValue="Delete" variant="danger">
                                  <Trash2 className="size-4" aria-hidden="true" />
                                  <Label>Delete</Label>
                                </Dropdown.Item>
                              </Dropdown.Menu>
                            </Dropdown.Popover>
                          </Dropdown>
                        </div>
                      ) : (
                        <span className="hidden lg:block" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      )}

      {/* New / edit season */}
      <Modal.Backdrop isOpen={newSeasonOpen} onOpenChange={closeSeasonModal}>
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog className="rounded-3xl sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="text-lg font-semibold text-foreground">{editSeasonId ? "Edit season" : "New season"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <TextField value={seasonName} onChange={setSeasonName} isRequired className="w-full">
                <Label className={FIELD_LABEL}>Name</Label>
                <Input placeholder="Christmas peak" className="rounded-xl max-md:h-11 max-md:text-base" />
              </TextField>

              <DateRangePicker
                value={seasonStart && seasonEnd ? {
                  start: parseCalendarDate(format(seasonStart, "yyyy-MM-dd")),
                  end: parseCalendarDate(format(seasonEnd, "yyyy-MM-dd")),
                } : null}
                onChange={(range) => {
                  setSeasonStart(range ? parseISO(range.start.toString()) : undefined);
                  setSeasonEnd(range ? parseISO(range.end.toString()) : undefined);
                }}
                className="w-full gap-2"
              >
                <Label className={FIELD_LABEL}>Dates</Label>
                <DateField.Group fullWidth className="date-input-group rounded-xl max-md:h-11">
                  <DateField.InputContainer>
                    <DateField.Input slot="start">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
                    <DateRangePicker.RangeSeparator className="px-2 text-muted-foreground" />
                    <DateField.Input slot="end">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
                  </DateField.InputContainer>
                  <DateField.Suffix>
                    <DateRangePicker.Trigger>
                      <DateRangePicker.TriggerIndicator />
                    </DateRangePicker.Trigger>
                  </DateField.Suffix>
                </DateField.Group>
                <DateRangePicker.Popover className="rounded-2xl p-2">
                  <RangeCalendar aria-label="Season dates" visibleDuration={{ months: isMobile ? 1 : 2 }}>
                    <RangeCalendar.Header>
                      <RangeCalendar.YearPickerTrigger>
                        <RangeCalendar.YearPickerTriggerHeading />
                        <RangeCalendar.YearPickerTriggerIndicator />
                      </RangeCalendar.YearPickerTrigger>
                      <RangeCalendar.NavButton slot="previous" />
                      <RangeCalendar.NavButton slot="next" />
                    </RangeCalendar.Header>
                    <div className="flex gap-4">
                      {(isMobile ? [0] : [0, 1]).map((monthOffset) => (
                        <RangeCalendar.Grid key={monthOffset} offset={{ months: monthOffset }}>
                          <RangeCalendar.GridHeader>{(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
                          <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
                        </RangeCalendar.Grid>
                      ))}
                    </div>
                  </RangeCalendar>
                </DateRangePicker.Popover>
              </DateRangePicker>

              {clientOverlapSeason && (
                <Alert status="danger" className="rounded-2xl">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Overlaps {clientOverlapSeason.name}</Alert.Title>
                    <Alert.Description>
                      It runs {format(parseISO(clientOverlapSeason.start_date), "MMM d")} – {format(parseISO(clientOverlapSeason.end_date), "MMM d, yyyy")}. Change the dates.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer className="m-0 flex-col-reverse gap-2 sm:flex-row">
              <Button slot="close" variant="tertiary" className="rounded-xl max-md:h-11">
                Cancel
              </Button>
              <Button
                variant="primary"
                isPending={seasonSaving}
                isDisabled={!canSaveSeason}
                onPress={() => (editSeasonId ? updateSeasonMutation.mutate() : createSeasonMutation.mutate())}
                className="rounded-xl font-semibold max-md:h-11"
              >
                Save season
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Season rates per room type */}
      <Drawer.Backdrop isOpen={seasonDetailOpen} onOpenChange={setSeasonDetailOpen} variant="opaque" className="bg-black/30">
        <Drawer.Content placement={isMobile ? "bottom" : "right"}>
          <Drawer.Dialog
            className={`
              flex w-full flex-col overflow-hidden rounded-t-3xl bg-card p-0
              h-[min(94dvh,56rem)] max-h-[94dvh]
              md:h-dvh md:max-h-dvh md:w-[min(28rem,100vw)]
              md:rounded-none md:border-l md:border-border/60 md:shadow-[-24px_0_80px_rgb(15_23_42/0.12)]
            `}
          >
            {isMobile && <Drawer.Handle className="mt-3 shrink-0" />}
            <Drawer.Header className="shrink-0 flex-row items-start gap-3 border-b border-border/60 px-6 pb-4 pt-4 md:pt-6">
              <div className="min-w-0 flex-1">
                <Drawer.Heading className="truncate text-lg font-semibold text-foreground">{selectedSeasonForOverrides?.name ?? "Season"} rates</Drawer.Heading>
                {selectedSeasonForOverrides && (
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {format(parseISO(selectedSeasonForOverrides.start_date), "MMM d")} – {format(parseISO(selectedSeasonForOverrides.end_date), "MMM d, yyyy")}
                  </p>
                )}
              </div>
              <Button isIconOnly size="sm" variant="ghost" aria-label="Close season rates" onPress={() => setSeasonDetailOpen(false)} className="hidden shrink-0 rounded-lg text-muted-foreground md:inline-flex">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </Drawer.Header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-6">
              {roomTypes.length > 1 && (
                <section aria-label="All room types" className="space-y-3 rounded-2xl bg-secondary/60 p-4">
                  <h3 className="text-xs font-medium text-muted-foreground">All room types</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <ApplyAllField label="Base" currency={currency} value={applyAllBase} onValue={setApplyAllBase} onApply={() => applyToAll("basePrice", applyAllBase)} />
                    <ApplyAllField label="Weekend" currency={currency} value={applyAllWeekend} onValue={setApplyAllWeekend} onApply={() => applyToAll("weekendPrice", applyAllWeekend)} />
                  </div>
                </section>
              )}

              <ul className="divide-y divide-border/60">
                {roomTypes.map((rt) => {
                  const values = seasonalOverrides[rt.id] || { basePrice: "", weekendPrice: "" };
                  const setField = (field: "basePrice" | "weekendPrice") => (v: string) =>
                    setSeasonalOverrides((prev) => ({ ...prev, [rt.id]: { ...prev[rt.id], [field]: v } }));
                  return (
                    <li key={rt.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-foreground">{rt.name}</p>
                        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          Now {formatPrice(rt.base_price)}
                          {rt.weekend_price ? ` · ${formatPrice(rt.weekend_price)}` : ""}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <RateField label="Base" currency={currency} value={values.basePrice} onValue={setField("basePrice")} placeholder={String(rt.base_price)} />
                        <RateField label="Weekend" currency={currency} value={values.weekendPrice} onValue={setField("weekendPrice")} placeholder="Optional" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-border/60 bg-card px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <Button variant="tertiary" onPress={() => setSeasonDetailOpen(false)} className="rounded-xl max-md:h-11">
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                isPending={saveSeasonalOverridesMutation.isPending}
                onPress={() => saveSeasonalOverridesMutation.mutate()}
                className="rounded-xl font-semibold max-md:h-11"
              >
                Save rates
              </Button>
            </div>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      {/* Delete season */}
      <AlertDialog.Backdrop isOpen={seasonToDelete !== null} onOpenChange={(open) => !open && setSeasonToDelete(null)}>
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="rounded-3xl sm:max-w-sm">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading className="text-lg font-semibold text-foreground">Delete {seasonToDelete?.name}?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-muted-foreground">Its nights go back to base rates.</p>
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row">
              <Button slot="close" variant="tertiary" autoFocus className="rounded-xl max-md:h-11">
                Keep it
              </Button>
              <Button
                variant="danger"
                isPending={deleteSeasonMutation.isPending}
                onPress={() => {
                  if (!seasonToDelete) return;
                  deleteSeasonMutation.mutate(seasonToDelete.id, { onSettled: () => setSeasonToDelete(null) });
                }}
                className="rounded-xl font-semibold max-md:h-11"
              >
                Delete
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
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
  if (cell.source === "seasonal") return cell.seasonName ? `Season: ${cell.seasonName}` : "Season price";
  if (cell.seasonName) return `Base price. ${cell.seasonName} has no price for this room yet.`;
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

  // Only a one-night change stands out; the editor says whether a price is base or season.
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

function RateField({ label, currency, value, onValue, placeholder }: {
  label: string;
  currency: string;
  value: string;
  onValue: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <TextField value={value} onChange={onValue} type="number" className="w-full">
      <Label className={FIELD_LABEL}>{label}</Label>
      <InputGroup className="rounded-xl max-md:h-11">
        <InputGroup.Prefix className="text-xs font-medium text-muted-foreground">{currency}</InputGroup.Prefix>
        <InputGroup.Input inputMode="decimal" min="0" step="0.01" placeholder={placeholder} className="min-w-0 tabular-nums max-md:text-base" />
      </InputGroup>
    </TextField>
  );
}

function ApplyAllField({ label, currency, value, onValue, onApply }: {
  label: string;
  currency: string;
  value: string;
  onValue: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="space-y-2">
      <TextField value={value} onChange={onValue} type="number" className="w-full">
        <Label className={FIELD_LABEL}>{label}</Label>
        <InputGroup className="rounded-xl max-md:h-11">
          <InputGroup.Prefix className="text-xs font-medium text-muted-foreground">{currency}</InputGroup.Prefix>
          <InputGroup.Input
            inputMode="decimal"
            onKeyDown={(e) => {
              if (e.key === "Enter") onApply();
            }}
            className="min-w-0 tabular-nums max-md:text-base"
          />
        </InputGroup>
      </TextField>
      <Button size="sm" variant="secondary" fullWidth isDisabled={!value.trim()} onPress={onApply} className="rounded-lg max-md:h-11">
        Apply to all
      </Button>
    </div>
  );
}

/** Twelve-month strip of seasons from the current month; gaps are listed below it. */
function SeasonTimeline({ seasons, todayStr }: { seasons: SeasonRow[]; todayStr: string }) {
  const start = parseISO(todayStr);
  start.setDate(1);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  const total = end.getTime() - start.getTime();

  const months: { label: string; pct: number }[] = [];
  const m = new Date(start);
  while (m <= end) {
    months.push({ label: format(m, "MMM"), pct: ((m.getTime() - start.getTime()) / total) * 100 });
    m.setMonth(m.getMonth() + 1);
  }
  const todayPct = Math.max(0, Math.min(100, ((parseISO(todayStr).getTime() - start.getTime()) / total) * 100));

  // Uncovered stretches between seasons (same rule as before: between covered periods only)
  const covered = seasons.map((s) => ({ start: s.start_date, end: s.end_date })).sort((a, b) => a.start.localeCompare(b.start));
  const gaps: { from: string; to: string }[] = [];
  let reach: string | null = null;
  for (const period of covered) {
    if (reach !== null && period.start > reach) {
      const gapStart = addDays(parseISO(reach), 1);
      const gapEnd = subDays(parseISO(period.start), 1);
      if (gapStart <= gapEnd) gaps.push({ from: format(gapStart, "yyyy-MM-dd"), to: format(gapEnd, "yyyy-MM-dd") });
    }
    if (reach === null || period.end > reach) reach = period.end;
  }

  return (
    <div className="space-y-3 p-4 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl bg-secondary/40" style={{ height: `${Math.max(56, seasons.length * 32 + 32)}px` }}>
        {months.map((mo, i) => (
          <div key={i} className="absolute inset-y-0 border-l border-border/50" style={{ left: `${mo.pct}%` }}>
            <span className="absolute left-1 top-1 select-none whitespace-nowrap text-2xs text-muted-foreground">{mo.label}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 z-10 w-px bg-primary" style={{ left: `${todayPct}%` }} aria-hidden="true" />
        {seasons.map((season, idx) => {
          const s = Math.max(parseISO(season.start_date).getTime(), start.getTime());
          const e = Math.min(parseISO(season.end_date).getTime(), end.getTime());
          if (s > e) return null;
          const left = ((s - start.getTime()) / total) * 100;
          const width = ((e - s) / total) * 100;
          const label = `${season.name}, ${format(parseISO(season.start_date), "MMM d")} – ${format(parseISO(season.end_date), "MMM d, yyyy")}`;
          return (
            <Tooltip key={season.id} delay={200}>
              <Tooltip.Trigger aria-label={label}>
                <div
                  className={cn("absolute flex h-6 items-center rounded-md px-2", SEASON_BAR[idx % SEASON_BAR.length])}
                  style={{ left: `${left}%`, width: `max(${width}%, 4px)`, top: `${24 + idx * 32}px` }}
                >
                  <span className="select-none truncate text-2xs font-semibold leading-none text-white">{width > 6 ? season.name : ""}</span>
                </div>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <p className="font-semibold">{season.name}</p>
                <p className="text-xs">
                  {format(parseISO(season.start_date), "MMM d")} – {format(parseISO(season.end_date), "MMM d, yyyy")}
                </p>
              </Tooltip.Content>
            </Tooltip>
          );
        })}
      </div>
      {gaps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {gaps.map((g, i) => (
            <Chip key={i} size="sm" variant="soft" color="warning">
              No season {format(parseISO(g.from), "MMM d")} – {format(parseISO(g.to), "MMM d")}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
