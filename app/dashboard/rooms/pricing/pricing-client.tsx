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
  Description,
  Drawer,
  Dropdown,
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
import { formatCurrency } from "@/lib/format";
import { toCalendarDate, fromCalendarDate } from "@/lib/date-convert";
import { usePricingStore, SelectedCell } from "@/lib/store/pricing-store";
import { ListEmpty } from "@/components/ui/list-card";
import { LIST_CARD, LIST_HEADER, LIST_ROWS } from "@/components/ui/list-styles";
import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";
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
  bulkUpsertDailyRateOverrides,
  bulkDeleteDailyRateOverrides,
  getResolvedRates,
  getOccupancyByDate,
  ResolvedPriceCell,
  OccupancyCell,
} from "@/app/actions/pricing";

const ENTER = "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-[var(--ease-out-ui)] motion-reduce:animate-none";
const FIELD_LABEL = "text-xs font-medium text-muted-foreground";

/** Seasons list: one template for header band and rows (lg and up). */
const SEASON_GRID =
  "lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_5rem_7rem_6rem_10rem] lg:items-center lg:gap-4";

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
    selectedCells,
    setSelectedCells,
    clearSelection,
    dragStartCell,
    setDragStartCell,
    editingCell,
    setEditingCell,
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
  
  // Single/Bulk daily price edit state
  const [bulkPriceInput, setBulkPriceInput] = useState("");
  const [singlePriceInput, setSinglePriceInput] = useState("");

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
      const propEnd = format(addDays(parseISO(todayStr), 29), "yyyy-MM-dd");
      setDateRange(propStart, propEnd);
    }
  }, [initialTab, rangeInitialized, setActiveTab, setDateRange, todayStr]);

  useEffect(() => {
    if (activeTab !== view) setActiveTab(view);
  }, [activeTab, view, setActiveTab]);

  const effectiveStart = rangeInitialized ? startDateStr : todayStr;
  const effectiveEnd = rangeInitialized
    ? endDateStr
    : format(addDays(parseISO(todayStr), 29), "yyyy-MM-dd");

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
    clearSelection();
  };

  const handleNextWindow = () => {
    const currentStart = parseISO(effectiveStart);
    const newStart = format(addDays(currentStart, windowDays), "yyyy-MM-dd");
    const newEnd = format(addDays(currentStart, windowDays * 2 - 1), "yyyy-MM-dd");
    setDateRange(newStart, newEnd);
    clearSelection();
  };

  const handleSetWindow = (days: number) => {
    const base = parseISO(todayStr);
    const start = format(base, "yyyy-MM-dd");
    const end = format(addDays(base, days - 1), "yyyy-MM-dd");
    setDateRange(start, end);
    clearSelection();
  };

  const handleDateReset = () => {
    handleSetWindow(30);
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

  // Fetch occupancy per date for the calendar header row
  const { data: occupancyCells = [] } = useQuery({
    queryKey: qk.pricingOccupancy(orgId, hotelId, effectiveStart, effectiveEnd),
    queryFn: async () => {
      const res = await getOccupancyByDate(effectiveStart, effectiveEnd);
      if (!res.success) return [] as OccupancyCell[];
      return res.data;
    },
    staleTime: 60_000, // 1 min — occupancy changes less frequently than rates
  });

  const occupancyMap = useMemo(() => {
    const map = new Map<string, OccupancyCell>();
    occupancyCells.forEach((c) => map.set(c.date, c));
    return map;
  }, [occupancyCells]);

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
      void queryClient.invalidateQueries({ queryKey: ["availability-rates", hotelId] });
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
      void queryClient.invalidateQueries({ queryKey: ["availability-rates", hotelId] });
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
      void queryClient.invalidateQueries({ queryKey: ["availability-rates", hotelId] });
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
      void queryClient.invalidateQueries({ queryKey: ["availability-rates", hotelId] });
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
      void queryClient.invalidateQueries({ queryKey: ["availability-rates", hotelId] });
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

      setEditingCell(null);
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
      void queryClient.invalidateQueries({ queryKey: ["availability-rates", hotelId] });
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
      setEditingCell(null);
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
      void queryClient.invalidateQueries({ queryKey: ["availability-rates", hotelId] });
    },
  });

  // Bulk Daily Override Mutation (Optimistic)
  const bulkSaveDailyOverridesMutation = useMutation({
    mutationFn: async ({ price, cells }: { price: number; cells: SelectedCell[] }) => {
      const upserts = cells.map((cell) => ({
        roomTypeId: cell.roomTypeId,
        date: cell.date,
        price,
      }));
      const res = await bulkUpsertDailyRateOverrides(upserts);
      if (!res.success) {
        throw new Error(res.error || "Failed to save bulk prices");
      }
    },
    onMutate: async ({ price, cells }) => {
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
        const keySet = new Set(cells.map((c) => `${c.roomTypeId}_${c.date}`));
        queryClient.setQueryData(
          queryKey,
          previousRates.map((cell) =>
            keySet.has(`${cell.roomTypeId}_${cell.date}`)
              ? { ...cell, price, source: "daily" as const }
              : cell
          )
        );
      }
      setBulkPriceInput("");
      clearSelection();
      return { previousRates, queryKey, count: cells.length };
    },
    onSuccess: (_data, variables) => {
      toast.success(`Updated ${variables.cells.length} rate${variables.cells.length === 1 ? "" : "s"}`);
    },
    onError: (err, _variables, context) => {
      if (context?.previousRates && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousRates);
      }
      toast.danger(err.message || "Failed to save bulk prices");
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
      void queryClient.invalidateQueries({ queryKey: ["availability-rates", hotelId] });
    },
  });

  // Bulk Clear Daily Override Mutation (Optimistic)
  const bulkClearDailyOverridesMutation = useMutation({
    mutationFn: async ({ cells }: { cells: SelectedCell[] }) => {
      const deletes = cells.map((cell) => ({
        roomTypeId: cell.roomTypeId,
        date: cell.date,
      }));
      const res = await bulkDeleteDailyRateOverrides(deletes);
      if (!res.success) {
        throw new Error(res.error || "Failed to clear overrides");
      }
    },
    onMutate: async ({ cells }) => {
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
        const keySet = new Set(cells.map((c) => `${c.roomTypeId}_${c.date}`));
        const rtMap = new Map(roomTypes.map((rt) => [rt.id, rt]));
        queryClient.setQueryData(
          queryKey,
          previousRates.map((cell) => {
            if (!keySet.has(`${cell.roomTypeId}_${cell.date}`)) return cell;
            const fallback = resolveFallbackCell(
              rtMap.get(cell.roomTypeId),
              cell.date,
              seasons,
              cell
            );
            return { ...cell, ...fallback };
          })
        );
      }
      clearSelection();
      return { previousRates, queryKey };
    },
    onSuccess: (_data, variables) => {
      toast.success(`Cleared ${variables.cells.length} override${variables.cells.length === 1 ? "" : "s"}`);
    },
    onError: (err, _variables, context) => {
      if (context?.previousRates && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousRates);
      }
      toast.danger(err.message || "Failed to clear overrides");
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
      void queryClient.invalidateQueries({ queryKey: ["availability-rates", hotelId] });
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

  // Click cell handler (Daily Calendar Grid)
  const handleCellClick = (roomTypeId: string, date: string, e: React.MouseEvent) => {
    if (!canManagePricing) return;
    // If shift key or drag active, handle range selection
    if (e.shiftKey && selectedCells.length > 0) {
      const first = selectedCells[0];
      const newSelection = getCellRange(first.roomTypeId, first.date, roomTypeId, date);
      setSelectedCells(newSelection);
      setEditingCell(null);
      return;
    }

    setSelectedCells([{ roomTypeId, date }]);
    const cellData = resolvedRateMap.get(`${roomTypeId}_${date}`);
    const price = cellData ? String(cellData.price) : "";
    setSinglePriceInput(price);
    setBulkPriceInput(price);
    setEditingCell(null);
  };

  // Bounding box range calculation (spreadsheet selection)
  const getCellRange = (
    rtStartId: string,
    dateStart: string,
    rtEndId: string,
    dateEnd: string
  ): SelectedCell[] => {
    const rtStartIndex = roomTypes.findIndex((r) => r.id === rtStartId);
    const rtEndIndex = roomTypes.findIndex((r) => r.id === rtEndId);
    const dateStartIndex = dateColumns.indexOf(dateStart);
    const dateEndIndex = dateColumns.indexOf(dateEnd);

    if (rtStartIndex === -1 || rtEndIndex === -1 || dateStartIndex === -1 || dateEndIndex === -1) {
      return [];
    }

    const minRt = Math.min(rtStartIndex, rtEndIndex);
    const maxRt = Math.max(rtStartIndex, rtEndIndex);
    const minDate = Math.min(dateStartIndex, dateEndIndex);
    const maxDate = Math.max(dateStartIndex, dateEndIndex);

    const range: SelectedCell[] = [];
    for (let r = minRt; r <= maxRt; r++) {
      for (let d = minDate; d <= maxDate; d++) {
        range.push({
          roomTypeId: roomTypes[r].id,
          date: dateColumns[d],
        });
      }
    }
    return range;
  };

  // Drag selection handlers
  const handleCellMouseDown = (roomTypeId: string, date: string, e: React.MouseEvent) => {
    if (!canManagePricing) return;
    if (e.button !== 0) return; // Left click only
    if (e.shiftKey) return;

    setDragStartCell({ roomTypeId, date });
    
    // Select the single cell immediately for responsive visuals
    setSelectedCells([{ roomTypeId, date }]);
    
    // Auto fill single edit
    const cellData = resolvedRateMap.get(`${roomTypeId}_${date}`);
    setSinglePriceInput(cellData ? String(cellData.price) : "");
  };

  const handleCellMouseEnter = (roomTypeId: string, date: string) => {
    if (!dragStartCell) return;
    const range = getCellRange(dragStartCell.roomTypeId, dragStartCell.date, roomTypeId, date);
    setSelectedCells(range);
    
    // Clear editing cell if dragging to multiple cells
    if (range.length > 1) {
      setEditingCell(null);
    }
  };

  const handleCellMouseUp = (roomTypeId: string, date: string) => {
    if (!dragStartCell) return;

    const isSingleClick = dragStartCell.roomTypeId === roomTypeId && dragStartCell.date === date;
    if (isSingleClick) {
      // Establish single selection. Persistent editor handles price changes.
      setSelectedCells([{ roomTypeId, date }]);
      const cellData = resolvedRateMap.get(`${roomTypeId}_${date}`);
      const price = cellData ? String(cellData.price) : "";
      setSinglePriceInput(price);
      setBulkPriceInput(price);
      setEditingCell(null);
    } else {
      // Range drag finished
      setEditingCell(null);
    }
    setDragStartCell(null);
  };

  useEffect(() => {
    // Attach mouseup on window to catch drops outside grid
    const handleUp = () => setDragStartCell(null);
    window.addEventListener("mouseup", handleUp);
    return () => window.removeEventListener("mouseup", handleUp);
  }, [setDragStartCell]);

  // Keyboard navigation (roving tabIndex — Arrow keys move within grid; Tab exits naturally)
  const handleKeyDown = (e: React.KeyboardEvent, currentRtId: string, currentDate: string) => {
    const rtIndex = roomTypes.findIndex((r) => r.id === currentRtId);
    const dateIndex = dateColumns.indexOf(currentDate);

    let nextRtId = currentRtId;
    let nextDate = currentDate;

    if (e.key === "ArrowUp" && rtIndex > 0) {
      nextRtId = roomTypes[rtIndex - 1].id;
    } else if (e.key === "ArrowDown" && rtIndex < roomTypes.length - 1) {
      nextRtId = roomTypes[rtIndex + 1].id;
    } else if (e.key === "ArrowLeft" && dateIndex > 0) {
      nextDate = dateColumns[dateIndex - 1];
    } else if (e.key === "ArrowRight" && dateIndex < dateColumns.length - 1) {
      nextDate = dateColumns[dateIndex + 1];
    } else if (e.key === "Home" && dateColumns.length > 0) {
      nextDate = dateColumns[0];
    } else if (e.key === "End" && dateColumns.length > 0) {
      nextDate = dateColumns[dateColumns.length - 1];
    } else if (e.key === "Escape") {
      clearSelection();
      setEditingCell(null);
      return;
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (canManagePricing) setEditingCell({ roomTypeId: currentRtId, date: currentDate });
      return;
    } else {
      return; // Allow Tab / Shift+Tab to exit the grid cleanly
    }

    e.preventDefault();
    if (canManagePricing) {
      setSelectedCells([{ roomTypeId: nextRtId, date: nextDate }]);
    }
    setEditingCell(null);

    // Autofill single edit value
    const cellData = resolvedRateMap.get(`${nextRtId}_${nextDate}`);
    setSinglePriceInput(cellData ? String(cellData.price) : "");

    // Scroll active element into view if needed
    const cellElement = document.getElementById(`cell-${nextRtId}-${nextDate}`);
    cellElement?.focus();
  };

  // Season status: past, active or upcoming relative to the property date
  const getSeasonStatus = (startDate: string, endDate: string) => {
    if (endDate < todayStr) return <Chip size="sm" variant="soft" color="default">Past</Chip>;
    if (startDate <= todayStr && endDate >= todayStr) return <Chip size="sm" variant="soft" color="success">Active</Chip>;
    return <Chip size="sm" variant="soft" color="accent">Upcoming</Chip>;
  };

  // Inline single save action
  const handleSaveSingleOverride = (roomTypeId: string, date: string) => {
    const price = parseFloat(singlePriceInput);
    if (!Number.isFinite(price) || price < 0.01) {
      toast.danger("Enter a valid rate of at least 0.01");
      return;
    }
    saveDailyOverrideMutation.mutate({ roomTypeId, date, price });
  };

  // Bulk save action
  const handleSaveBulkOverride = () => {
    const price = parseFloat(bulkPriceInput);
    if (!Number.isFinite(price) || price < 0.01) {
      toast.danger("Enter a valid rate of at least 0.01");
      return;
    }
    bulkSaveDailyOverridesMutation.mutate({ price, cells: selectedCells });
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
                        clearSelection();
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
              selectedKeys={[30, 60, 90].includes(windowDays) ? [String(windowDays)] : []}
              onSelectionChange={(keys) => {
                const next = Number([...keys][0]);
                if (next) handleSetWindow(next);
              }}
            >
              {[30, 60, 90].map((d, i) => (
                <ToggleButton key={d} id={String(d)} aria-label={`${d} days`} className="tabular-nums max-md:h-11">
                  {i > 0 && <ToggleButtonGroup.Separator />}
                  {d}d
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {!isWindowAtToday && (
              <Button variant="ghost" onPress={handleDateReset} className="font-semibold text-primary max-md:h-11">
                Today
              </Button>
            )}

            <RateLegend />
          </div>

          {roomTypes.length === 0 ? (
            <Card className={LIST_CARD}>
              <ListEmpty icon={Tag} title="No active room types" />
            </Card>
          ) : (
            <>
              {/* Desktop: spreadsheet grid (keyboard: arrows move, Enter edits, Esc clears) */}
              <Card className={cn(LIST_CARD, "hidden lg:flex")}>
                {loadingRates ? (
                  <div className="space-y-3 p-6">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
                  </div>
                ) : (
                  <div className="native-scroll relative max-h-[600px] overflow-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 z-20 bg-card">
                        <tr className="border-b border-border/60">
                          <th scope="col" className="sticky left-0 z-30 min-w-48 border-r border-border/60 bg-card px-4 py-2 text-2xs font-medium text-muted-foreground">
                            Room type
                          </th>
                          {dateColumns.map((dateStr) => {
                            const d = parseISO(dateStr);
                            const isToday = dateStr === todayStr;
                            return (
                              <th
                                key={dateStr}
                                scope="col"
                                className={cn(
                                  "min-w-24 border-r border-border/40 px-2 py-2 text-center font-normal",
                                  isWeekend(dateStr) && "bg-secondary/50",
                                  isToday && "shadow-[inset_0_2px_0_var(--primary)]"
                                )}
                              >
                                <div className={cn("text-2xs text-muted-foreground", isToday && "text-primary")}>{format(d, "EEE")}</div>
                                <div className={cn("mt-1 text-xs font-semibold tabular-nums text-foreground", isToday && "text-primary")}>{format(d, "d MMM")}</div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {occupancyCells.length > 0 && (
                          <tr className="border-b border-border/60 bg-secondary/30">
                            <th scope="row" className="sticky left-0 z-10 border-r border-border/60 bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
                              Occupancy
                            </th>
                            {dateColumns.map((dateStr) => {
                              const occ = occupancyMap.get(dateStr);
                              const pct = occ?.pct ?? 0;
                              return (
                                <td key={dateStr} className={cn("border-r border-border/40 px-2 py-2 text-center align-middle", isWeekend(dateStr) && "bg-secondary/50")}>
                                  {occ ? (
                                    <div className="flex flex-col items-center gap-1" title={`${occ.occupied} of ${occ.total} rooms sold`}>
                                      <span className={cn("text-2xs font-semibold tabular-nums", pct >= 90 ? "text-danger" : pct >= 70 ? "text-amber-700" : "text-muted-foreground")}>
                                        {pct}%
                                      </span>
                                      <div className="h-1 w-full max-w-12 overflow-hidden rounded-full bg-border/60" aria-hidden="true">
                                        <div className={cn("h-full rounded-full", pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-amber-500" : "bg-primary/60")} style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-2xs text-muted-foreground">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        )}
                        {roomTypes.map((rt, rtIdx) => (
                          <tr key={rt.id} className="border-b border-border/40 last:border-b-0">
                            <th scope="row" className="sticky left-0 z-10 border-r border-border/60 bg-card px-4 py-3 align-middle font-normal">
                              <div className="truncate text-sm font-semibold text-foreground">{rt.name}</div>
                              <div className="mt-1 text-2xs tabular-nums text-muted-foreground">Base {formatCurrency(rt.base_price, currency)}</div>
                            </th>
                            {dateColumns.map((dateStr, dateIdx) => {
                              const cell = resolvedRateMap.get(`${rt.id}_${dateStr}`);
                              const isSelected = selectedCells.some((c) => c.roomTypeId === rt.id && c.date === dateStr);
                              const isTabStop =
                                selectedCells.length > 0
                                  ? selectedCells[0]?.roomTypeId === rt.id && selectedCells[0]?.date === dateStr
                                  : rtIdx === 0 && dateIdx === 0;
                              const isEditing = editingCell?.roomTypeId === rt.id && editingCell?.date === dateStr;
                              // A season covers this date but sets no rate for this room type
                              const isSeasonUnconfigured = cell?.source === "base" && !!cell?.seasonName;
                              const sourceLabel =
                                cell?.source === "daily" ? "daily override" : cell?.source === "seasonal" ? `season ${cell.seasonName ?? ""}` : isSeasonUnconfigured ? `base, season ${cell?.seasonName} has no rate` : "base rate";

                              return (
                                <td
                                  key={dateStr}
                                  id={`cell-${rt.id}-${dateStr}`}
                                  tabIndex={isTabStop ? 0 : -1}
                                  aria-label={`${rt.name}, ${format(parseISO(dateStr), "EEE d MMM")}: ${cell ? formatCurrency(cell.price, currency) : "loading"}, ${sourceLabel}`}
                                  aria-selected={isSelected}
                                  onKeyDown={(e) => handleKeyDown(e, rt.id, dateStr)}
                                  onMouseDown={(e) => handleCellMouseDown(rt.id, dateStr, e)}
                                  onMouseEnter={() => handleCellMouseEnter(rt.id, dateStr)}
                                  onMouseUp={() => handleCellMouseUp(rt.id, dateStr)}
                                  onClick={(e) => handleCellClick(rt.id, dateStr, e)}
                                  className={cn(
                                    "relative select-none border-r border-border/40 px-2 py-3 text-center align-middle outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                                    canManagePricing && "cursor-pointer [@media(hover:hover)_and_(pointer:fine)]:hover:bg-primary/[0.04]",
                                    isWeekend(dateStr) && "bg-secondary/50",
                                    !isSelected && cell?.source === "seasonal" && "bg-emerald-500/[0.06] text-emerald-800",
                                    !isSelected && cell?.source === "daily" && "bg-primary/[0.07] font-semibold text-primary",
                                    isSelected && "z-10 bg-primary/10 ring-2 ring-inset ring-primary"
                                  )}
                                >
                                  {cell ? (
                                    <span className="text-xs font-medium tabular-nums">{formatCurrency(cell.price, currency)}</span>
                                  ) : (
                                    <Skeleton className="mx-auto h-4 w-12 rounded-md" />
                                  )}
                                  {cell?.source === "daily" && <span aria-hidden="true" className="absolute right-1 top-1 size-1 rounded-full bg-primary" />}
                                  {isSeasonUnconfigured && <span aria-hidden="true" className="absolute right-1 top-1 size-1 rounded-full bg-amber-500" />}

                                  {canManagePricing && isEditing && (
                                    <SingleRatePopover
                                      label={`${rt.name} · ${format(parseISO(dateStr), "EEE d MMM")}`}
                                      currency={currency}
                                      value={singlePriceInput}
                                      onValue={setSinglePriceInput}
                                      onClose={() => setEditingCell(null)}
                                      onSave={() => handleSaveSingleOverride(rt.id, dateStr)}
                                      saving={saveDailyOverrideMutation.isPending}
                                      canClear={cell?.source === "daily"}
                                      clearing={clearDailyOverrideMutation.isPending}
                                      onClear={() => clearDailyOverrideMutation.mutate({ roomTypeId: rt.id, date: dateStr })}
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Below lg: one card per room type with a scrollable day grid */}
              <div className="space-y-4 lg:hidden">
                {roomTypes.map((rt) => (
                  <PenCard key={rt.id}>
                    <PenCardHead
                      title={rt.name}
                      actions={
                        <span className="text-xs tabular-nums text-muted-foreground">
                          Base {formatCurrency(rt.base_price, currency)}
                          {rt.weekend_price ? ` · Weekend ${formatCurrency(rt.weekend_price, currency)}` : ""}
                        </span>
                      }
                    />
                    <div className="native-scroll grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
                      {dateColumns.map((dateStr) => {
                        const cell = resolvedRateMap.get(`${rt.id}_${dateStr}`);
                        const active = selectedCells.some((c) => c.roomTypeId === rt.id && c.date === dateStr);
                        return (
                          <button
                            type="button"
                            key={dateStr}
                            disabled={!canManagePricing}
                            aria-pressed={active}
                            onClick={(e) => handleCellClick(rt.id, dateStr, e)}
                            className={cn(
                              "relative flex min-h-14 select-none flex-col justify-between rounded-xl border border-border/60 p-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                              isWeekend(dateStr) && "bg-secondary/50",
                              cell?.source === "seasonal" && "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-800",
                              cell?.source === "daily" && "border-primary/20 bg-primary/[0.07] text-primary",
                              active && "border-primary ring-2 ring-primary"
                            )}
                          >
                            <span className="text-2xs font-medium text-muted-foreground">{format(parseISO(dateStr), "EEE d MMM")}</span>
                            <span className="mt-1 text-sm font-semibold tabular-nums">
                              {cell ? formatCurrency(cell.price, currency) : <Skeleton className="h-4 w-12 rounded-md" />}
                            </span>
                            {cell?.source === "daily" && <span aria-hidden="true" className="absolute right-2 top-2 size-1 rounded-full bg-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </PenCard>
                ))}
              </div>
            </>
          )}

          {/* Selection bar: appears only while nights are selected */}
          {canManagePricing && selectedCells.length > 0 && (
            <div className="sticky bottom-4 z-20">
              <Card className="flex-col gap-3 rounded-2xl border border-border/70 px-4 py-3 shadow-[0_8px_30px_rgb(15_23_42/0.12)] animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-[var(--ease-out-ui)] motion-reduce:animate-none sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {selectedCells.length} {selectedCells.length === 1 ? "night" : "nights"} selected
                  </p>
                  <Button variant="ghost" onPress={clearSelection} className="rounded-xl max-md:h-11">
                    Cancel
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <TextField
                    aria-label={`New rate in ${currency}`}
                    value={bulkPriceInput}
                    onChange={setBulkPriceInput}
                    type="number"
                    className="w-36"
                  >
                    <InputGroup className="rounded-xl max-md:h-11">
                      <InputGroup.Prefix className="text-xs font-medium text-muted-foreground">{currency}</InputGroup.Prefix>
                      <InputGroup.Input
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0.00"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveBulkOverride();
                        }}
                        className="min-w-0 tabular-nums max-md:text-base"
                      />
                    </InputGroup>
                  </TextField>
                  <Button
                    variant="primary"
                    isPending={bulkSaveDailyOverridesMutation.isPending}
                    onPress={handleSaveBulkOverride}
                    className="rounded-xl font-semibold max-md:h-11"
                  >
                    Set rate
                  </Button>
                  <Dropdown>
                    <Button isIconOnly variant="secondary" aria-label="More selection actions" className="rounded-xl max-md:size-11">
                      <EllipsisVertical className="size-4" />
                    </Button>
                    <Dropdown.Popover placement="top end">
                      <Dropdown.Menu
                        aria-label="More selection actions"
                        onAction={(key) => {
                          if (key === "clear-override") bulkClearDailyOverridesMutation.mutate({ cells: selectedCells });
                        }}
                      >
                        <Dropdown.Item id="clear-override" textValue="Remove overrides">
                          <X className="size-4 text-muted-foreground" aria-hidden="true" />
                          <Label>Remove overrides</Label>
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                </div>
              </Card>
            </div>
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
                <span>Priority</span>
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
                      <span className="hidden text-sm tabular-nums text-muted-foreground lg:block">{season.priority}</span>
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

              <TextField value={seasonPriority} onChange={setSeasonPriority} type="number" className="w-full">
                <Label className={FIELD_LABEL}>Priority</Label>
                <Input inputMode="numeric" min={0} max={1000} step={1} className="rounded-xl tabular-nums max-md:h-11 max-md:text-base" />
                <Description className="text-xs text-muted-foreground">Higher wins where seasons overlap</Description>
              </TextField>

              {clientOverlapSeason && (
                <Alert status="danger" className="rounded-2xl">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Overlaps {clientOverlapSeason.name}</Alert.Title>
                    <Alert.Description>
                      Same priority ({clientOverlapSeason.priority}), {clientOverlapSeason.start_date} to {clientOverlapSeason.end_date}. Change the dates or the priority.
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
                          Now {formatCurrency(rt.base_price, currency)}
                          {rt.weekend_price ? ` · ${formatCurrency(rt.weekend_price, currency)}` : ""}
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

/** Swatches explain the cell tints; each also carries text, so state is never colour-only. */
function RateLegend() {
  const items = [
    { label: "Base", swatch: "border border-border bg-card" },
    { label: "Season", swatch: "bg-emerald-500/30" },
    { label: "Override", swatch: "bg-primary/40" },
    { label: "Season, no rate", swatch: "border border-border bg-card", dot: "bg-amber-500" },
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground lg:ml-auto" aria-label="Rate colours">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn("relative size-3 rounded", i.swatch)}>
            {i.dot && <span className={cn("absolute right-0 top-0 size-1 rounded-full", i.dot)} />}
          </span>
          {i.label}
        </li>
      ))}
    </ul>
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

/** Inline editor for one night (opened with Enter on a focused cell). */
function SingleRatePopover({ label, currency, value, onValue, onClose, onSave, saving, canClear, clearing, onClear }: {
  label: string;
  currency: string;
  value: string;
  onValue: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  canClear: boolean;
  clearing: boolean;
  onClear: () => void;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <Popover isOpen onOpenChange={(open) => !open && onClose()}>
        <Popover.Trigger>
          <button type="button" aria-label={`Edit ${label}`} className="absolute inset-0 size-full cursor-pointer bg-transparent outline-none" />
        </Popover.Trigger>
        <Popover.Content placement="top" className="w-64 rounded-2xl p-0">
          <Popover.Dialog aria-label={label} className="grid gap-3 p-4 outline-none">
            <p className="truncate text-xs font-semibold text-foreground">{label}</p>
            <TextField aria-label={`Rate in ${currency}`} value={value} onChange={onValue} type="number" autoFocus className="w-full min-w-0">
              <InputGroup className="w-full min-w-0 rounded-xl">
                <InputGroup.Prefix className="text-xs font-medium text-muted-foreground">{currency}</InputGroup.Prefix>
                <InputGroup.Input
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSave();
                    else if (e.key === "Escape") onClose();
                  }}
                  className="min-w-0 tabular-nums"
                />
              </InputGroup>
            </TextField>
            <div className="flex items-center gap-2">
              {canClear && (
                <Button size="sm" variant="ghost" isPending={clearing} onPress={onClear} className="rounded-lg text-danger">
                  Remove
                </Button>
              )}
              <Button size="sm" variant="tertiary" onPress={onClose} className="ml-auto rounded-lg">
                Cancel
              </Button>
              <Button size="sm" variant="primary" isPending={saving} onPress={onSave} className="rounded-lg font-semibold">
                Save
              </Button>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
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
          const label = `${season.name}, ${format(parseISO(season.start_date), "MMM d")} – ${format(parseISO(season.end_date), "MMM d, yyyy")}, priority ${season.priority}`;
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
                  {format(parseISO(season.start_date), "MMM d")} – {format(parseISO(season.end_date), "MMM d, yyyy")} · priority {season.priority}
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
