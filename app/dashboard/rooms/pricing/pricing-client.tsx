"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button as HeroButton,
  Card as HeroCard,
  DateField,
  DateRangePicker,
  Input as HeroInput,
  Label,
  RangeCalendar,
  Surface,
  Tabs as HeroTabs,
  toast,
} from "@heroui/react";
import { parseDate as parseCalendarDate } from "@internationalized/date";
import {
  CalendarDays,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Edit2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Tag,
  AlertTriangle,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { format, addDays, subDays, parseISO } from "date-fns";

import { qk } from "@/lib/query-keys";
import { businessToday } from "@/lib/business-date";
import { useIsMobile } from "@/hooks/use-mobile";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { usePricingStore, SelectedCell } from "@/lib/store/pricing-store";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

  // Determine current season status badge
  const getSeasonStatus = (startDate: string, endDate: string) => {
    if (endDate < todayStr) {
      return <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted-foreground/20 font-medium">Past</Badge>;
    }
    if (startDate <= todayStr && endDate >= todayStr) {
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 font-semibold">Active</Badge>;
    }
    return <Badge variant="outline" className="bg-blue-500/5 text-blue-600 border-blue-500/20 font-medium">Upcoming</Badge>;
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

  return (
    <TooltipProvider>
    <div className="mx-auto w-full max-w-7xl space-y-5 pt-1">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[24px]">Rates &amp; seasons</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Daily rate overrides and seasonal pricing rules
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManagePricing && activeTab === "seasons" && (
            <Dialog open={newSeasonOpen} onOpenChange={(open) => {
              setNewSeasonOpen(open);
              if (!open) {
                setEditSeasonId(null);
                resetSeasonForm();
              }
            }}>
              <DialogTrigger render={
                <HeroButton size="sm" variant="primary" className="ui-press h-11 rounded-xl sm:h-9">
                  <Plus className="size-4 mr-1.5" aria-hidden="true" />
                  New season
                </HeroButton>
              } />
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold text-foreground">
                    {editSeasonId ? "Edit season" : "New seasonal rate period"}
                  </DialogTitle>
                  <DialogDescription>
                    Set a date range for custom room-type rates.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="text-xs font-medium text-muted-foreground">Season name</label>
                    <Input
                      id="name"
                      placeholder="e.g. Christmas Peak 2026"
                      value={seasonName}
                      onChange={(e) => setSeasonName(e.target.value)}
                      className="h-11 sm:h-9"
                    />
                  </div>

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
                    <Label className="text-xs font-medium text-muted-foreground">Season dates</Label>
                    <DateField.Group fullWidth variant="secondary" className="rounded-lg border border-border/70 shadow-none">
                      <DateField.InputContainer>
                        <DateField.Input slot="start">
                          {(segment) => <DateField.Segment segment={segment} />}
                        </DateField.Input>
                        <DateRangePicker.RangeSeparator className="px-2 text-muted-foreground" />
                        <DateField.Input slot="end">
                          {(segment) => <DateField.Segment segment={segment} />}
                        </DateField.Input>
                      </DateField.InputContainer>
                      <DateField.Suffix>
                        <DateRangePicker.Trigger>
                          <DateRangePicker.TriggerIndicator />
                        </DateRangePicker.Trigger>
                      </DateField.Suffix>
                    </DateField.Group>
                    <DateRangePicker.Popover className="rounded-xl border border-border p-2 shadow-lg">
                      <RangeCalendar
                        aria-label="Season date range"
                        visibleDuration={{ months: isMobile ? 1 : 2 }}
                      >
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
                              <RangeCalendar.GridHeader>
                                {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                              </RangeCalendar.GridHeader>
                              <RangeCalendar.GridBody>
                                {(date) => <RangeCalendar.Cell date={date} />}
                              </RangeCalendar.GridBody>
                            </RangeCalendar.Grid>
                          ))}
                        </div>
                      </RangeCalendar>
                    </DateRangePicker.Popover>
                  </DateRangePicker>

                  <div className="space-y-1.5">
                    <label htmlFor="season-priority" className="text-xs font-medium text-muted-foreground">
                      Priority
                    </label>
                    <Input
                      id="season-priority"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={1000}
                      step={1}
                      value={seasonPriority}
                      onChange={(e) => setSeasonPriority(e.target.value)}
                      aria-describedby="season-priority-hint"
                      className="h-11 sm:h-9"
                    />
                    <p id="season-priority-hint" className="text-[11px] leading-relaxed text-muted-foreground">
                      Higher priority wins when seasons overlap. Keep at 0 for standard seasons.
                    </p>
                  </div>

                  {/* Overlaps warning */}
                  {clientOverlapSeason && (
                    <Alert status="danger" className="rounded-lg border border-danger/20 shadow-none">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>Overlaps a season on the same layer</Alert.Title>
                        <Alert.Description>
                          {clientOverlapSeason.name} runs {clientOverlapSeason.start_date} to {clientOverlapSeason.end_date} at priority {clientOverlapSeason.priority}. Give this season a different priority to layer them, or change the dates.
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setNewSeasonOpen(false);
                    resetSeasonForm();
                  }} className="ui-press h-11 sm:h-9 border-border [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/40">Cancel</Button>
                  <Button
                    disabled={createSeasonMutation.isPending || updateSeasonMutation.isPending || !!clientOverlapSeason || !seasonName.trim() || !seasonStart || !seasonEnd}
                    onClick={() => {
                      if (editSeasonId) {
                        updateSeasonMutation.mutate();
                      } else {
                        createSeasonMutation.mutate();
                      }
                    }}
                    className="ui-press h-11 sm:h-9 font-medium bg-primary text-primary-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-primary/90"
                  >
                    {createSeasonMutation.isPending || updateSeasonMutation.isPending ? "Saving..." : "Save Season"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      {/* ── Main Tabs ───────────────────────────────────────────── */}
      <HeroTabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(String(key) as "calendar" | "seasons")} variant="secondary" className="w-full">
        <HeroTabs.ListContainer className="w-fit max-w-full">
          <HeroTabs.List aria-label="Pricing views" className="w-fit gap-6 *:h-9 *:w-fit *:px-0 *:text-sm *:font-medium">
          <HeroTabs.Tab id="calendar">
            <CalendarDays className="size-4 mr-2" />
            Rate Calendar
            <HeroTabs.Indicator />
          </HeroTabs.Tab>
          <HeroTabs.Tab id="seasons">
            <Tag className="size-4 mr-2" />
            Seasons
            <HeroTabs.Indicator />
          </HeroTabs.Tab>
          </HeroTabs.List>
        </HeroTabs.ListContainer>

        {/* ── Tab Content: Rate Calendar ────────────────────────────── */}
        <HeroTabs.Panel id="calendar" className="mt-4 space-y-4 px-0">
          
          {/* Controls Bar */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <HeroButton variant="ghost" size="sm" isIconOnly aria-label="Previous date range" onPress={handlePrevWindow} className="ui-press size-11 min-w-11 sm:size-8 sm:min-w-8">
                <ChevronLeft className="size-4" />
              </HeroButton>
              
              <Popover open={rangePopoverOpen} onOpenChange={setRangePopoverOpen}>
                <PopoverTrigger render={
                  <Button variant="outline" className="ui-press h-11 sm:h-9 font-semibold border-input/60 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/40 min-w-[240px] justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{format(parseISO(effectiveStart), "MMM dd, yyyy")} – {format(parseISO(effectiveEnd), "MMM dd, yyyy")}</span>
                  </Button>
                } />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseISO(effectiveStart)}
                    onSelect={(d) => {
                      if (d) {
                        const start = format(d, "yyyy-MM-dd");
                        const end = format(addDays(d, windowDays - 1), "yyyy-MM-dd");
                        setDateRange(start, end);
                        clearSelection();
                        setTimeout(() => setRangePopoverOpen(false), 0);
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>

              <HeroButton variant="ghost" size="sm" isIconOnly aria-label="Next date range" onPress={handleNextWindow} className="ui-press size-11 min-w-11 sm:size-8 sm:min-w-8">
                <ChevronRight className="size-4" />
              </HeroButton>

              {/* Quick-range buttons — industry standard: 30 / 60 / 90 */}
              <div className="flex items-center gap-1 ml-1 border-l border-border/60 pl-3">
                {([30, 60, 90] as const).map((d) => (
                  <HeroButton
                    key={d}
                    variant={windowDays === d ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => handleSetWindow(d)}
                    className="ui-press h-11 min-w-11 text-xs sm:h-8 sm:min-w-10"
                  >
                    {d}d
                  </HeroButton>
                ))}
                <HeroButton variant="ghost" size="sm" onPress={handleDateReset} className="ui-press ml-1 h-11 text-xs sm:h-8">
                  Today
                </HeroButton>
              </div>
            </div>

            {/* Legend & Quick Actions */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground select-none">
              <div className="flex items-center gap-2">
                <span className="inline-block size-3 rounded bg-muted border border-border/80" />
                <span>Base Rate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block size-3 rounded bg-emerald-500/15 border border-emerald-500/20" />
                <span className="text-emerald-700 font-semibold">Seasonal Rate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block size-3 rounded bg-amber-500/10 border border-amber-500/20 relative">
                  <span className="absolute top-0.5 right-0.5 size-1 rounded-full bg-amber-500" />
                </span>
                <span className="text-amber-700 font-semibold">Season / No Rate Set</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block size-3 rounded bg-violet-500/20 border border-violet-500/40 relative">
                  <span className="absolute top-0.5 right-0.5 size-1 rounded-full bg-violet-600" />
                </span>
                <span className="text-violet-700 font-semibold">Daily Override</span>
              </div>
            </div>
          </div>

          {canManagePricing && selectedCells.length > 0 && (
            <Surface variant="secondary" className="rounded-xl border border-border/70 p-3 shadow-none">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedCells.length} {selectedCells.length === 1 ? "night selected" : "nights selected"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Applies a daily rate override across the selection
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <HeroInput
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    aria-label={`New price in ${currency}`}
                    placeholder={`Price (${currency})`}
                    value={bulkPriceInput}
                    onChange={(event) => setBulkPriceInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleSaveBulkOverride();
                    }}
                    variant="secondary"
                    className="h-11 w-36 text-base sm:h-9 sm:text-sm"
                  />
                  <HeroButton
                    variant="primary"
                    size="sm"
                    isPending={bulkSaveDailyOverridesMutation.isPending}
                    onPress={handleSaveBulkOverride}
                    className="ui-press h-11 rounded-xl sm:h-9"
                  >
                    Apply price
                  </HeroButton>
                  <HeroButton
                    variant="outline"
                    size="sm"
                    isPending={bulkClearDailyOverridesMutation.isPending}
                    onPress={() => bulkClearDailyOverridesMutation.mutate({ cells: selectedCells })}
                    className="ui-press h-11 rounded-xl sm:h-9"
                  >
                    Clear override
                  </HeroButton>
                  <HeroButton
                    variant="ghost"
                    size="sm"
                    onPress={clearSelection}
                    className="ui-press h-11 rounded-xl sm:h-9"
                  >
                    Cancel
                  </HeroButton>
                </div>
              </div>
            </Surface>
          )}

          {/* ── Mobile/Tablet View (Date Scroller & Room type List) ── */}
          <div className="block lg:hidden">
            <div className="space-y-4">
              {roomTypes.map((rt) => (
                <div key={rt.id} className="bg-card rounded-xl border border-border/50 p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2">
                    <span className="font-semibold text-foreground text-base">{rt.name}</span>
                    <span className="text-xs text-muted-foreground">Default: {formatCurrency(rt.base_price, currency)} / {rt.weekend_price ? formatCurrency(rt.weekend_price, currency) : "N/A"}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {dateColumns.map((dateStr) => {
                      const dateObj = parseISO(dateStr);
                      const key = `${rt.id}_${dateStr}`;
                      const cell = resolvedRateMap.get(key);
                      const active = selectedCells.some((c) => c.roomTypeId === rt.id && c.date === dateStr);

                      return (
                        <button
                          type="button"
                          key={dateStr}
                          disabled={!canManagePricing}
                          onClick={(e) => handleCellClick(rt.id, dateStr, e)}
                          className={cn(
                            "flex min-h-14 flex-col justify-between rounded-xl border p-2.5 text-left transition-colors duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                            canManagePricing && "cursor-pointer [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/10",
                            active && "ring-2 ring-primary border-primary",
                            cell?.source === "seasonal" && "bg-emerald-500/5 border-emerald-500/15 text-emerald-800",
                            cell?.source === "daily" && "bg-violet-500/5 border-violet-500/15 text-violet-800",
                            cell?.source === "base" && "bg-muted/10 border-border/80"
                          )}
                        >
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {format(dateObj, "EEE dd MMM")}
                          </span>
                          <span className="mt-1 text-sm font-semibold tabular-nums">
                            {cell ? formatCurrency(cell.price, currency) : <Skeleton className="h-4 w-12" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Desktop Grid Calendar View ──────────────────────── */}
          <div className="hidden lg:block">
            {loadingRates ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-[400px] w-full rounded-xl" />
              </div>
            ) : roomTypes.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border border-dashed border-border">
                <Info className="size-10 text-muted-foreground/30 mb-3" />
                <span className="font-bold text-lg text-foreground">No room types configured</span>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Create room types in the Rooms Directory before setting rates.
                </p>
              </div>
            ) : (
              <div className="relative overflow-x-auto rounded-xl border border-border/50 shadow-sm bg-card max-h-[600px] native-scroll">
                <table className="w-full border-collapse text-sm text-left">
                  <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-sm border-b border-border/80">
                    <tr>
                      <th className="sticky left-0 z-30 bg-muted/95 border-r border-border/80 px-4 py-3 min-w-[200px] max-w-[200px] font-bold text-foreground">
                        Room Type
                      </th>
                      {dateColumns.map((dateStr) => {
                        const dateObj = parseISO(dateStr);
                        const isWe = isWeekend(dateStr);
                        return (
                          <th
                            key={dateStr}
                            className={cn(
                              "px-3 py-2 text-center min-w-[100px] border-r border-border/80",
                              isWe && "bg-muted-foreground/5 shadow-[inset_0_0_0_999px_rgba(0,0,0,0.03)]"
                            )}
                          >
                            <div className="text-[11px] font-medium text-muted-foreground">
                              {format(dateObj, "EEE")}
                            </div>
                            <div className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">
                              {format(dateObj, "dd MMM")}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {/* ── Occupancy Row ── pinned above room types, industry standard */}
                    {occupancyCells.length > 0 && (
                      <tr className="border-b border-border/70 bg-muted/20">
                        <td className="sticky left-0 z-10 bg-muted/30 border-r border-border/80 px-4 py-2 font-bold text-foreground align-middle">
                          <div className="text-xs font-semibold text-foreground">Occupancy</div>
                          <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">rooms sold / total</div>
                        </td>
                        {dateColumns.map((dateStr) => {
                          const occ = occupancyMap.get(dateStr);
                          const pct = occ?.pct ?? 0;
                          const isWe = isWeekend(dateStr);
                          // Color bands: <40% low (muted), 40-70% medium (blue), >70% high (amber→red)
                          const barColor =
                            pct >= 90 ? "bg-red-500" :
                            pct >= 70 ? "bg-amber-500" :
                            pct >= 40 ? "bg-blue-500" :
                            "bg-muted-foreground/30";
                          const textColor =
                            pct >= 90 ? "text-red-600 font-bold" :
                            pct >= 70 ? "text-amber-600 font-semibold" :
                            pct >= 40 ? "text-blue-600 font-semibold" :
                            "text-muted-foreground";
                          return (
                            <td
                              key={dateStr}
                              className={cn(
                                "px-2 py-2 text-center align-middle border-r border-border/40",
                                isWe && "bg-muted-foreground/[0.015]"
                              )}
                            >
                              {occ ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className={cn("text-[11px] tabular-nums", textColor)}>
                                    {pct}%
                                  </span>
                                  {/* Mini bar — static, no layout animation */}
                                  <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
                                    <div
                                      className={cn("h-full rounded-full", barColor)}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] tabular-nums text-muted-foreground/70">
                                    {occ.occupied}/{occ.total}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground/40">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {roomTypes.map((rt, rtIdx) => (
                      <tr key={rt.id} className="border-b border-border/40 transition-colors [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5">
                        <td className="sticky left-0 z-10 bg-card border-r border-border/80 px-4 py-3 font-semibold text-foreground align-middle shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          <div className="truncate text-sm">{rt.name}</div>
                          <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                            Def: {formatCurrency(rt.base_price, currency)}
                          </div>
                        </td>
                        {dateColumns.map((dateStr, dateIdx) => {
                          const key = `${rt.id}_${dateStr}`;
                          const cell = resolvedRateMap.get(key);
                          const isWe = isWeekend(dateStr);
                          
                          // Selection highlights
                          const isSelected = selectedCells.some(
                            (c) => c.roomTypeId === rt.id && c.date === dateStr
                          );
                          const isTabStop =
                            selectedCells.length > 0
                              ? selectedCells[0]?.roomTypeId === rt.id &&
                                selectedCells[0]?.date === dateStr
                              : rtIdx === 0 && dateIdx === 0;
                          const isEditing = editingCell?.roomTypeId === rt.id && editingCell?.date === dateStr;
                          // Season is active for this date but no rate override configured for this room type
                          const isSeasonUnconfigured = cell?.source === "base" && !!cell?.seasonName;

                          return (
                            <td
                              key={dateStr}
                              id={`cell-${rt.id}-${dateStr}`}
                              tabIndex={isTabStop ? 0 : -1}
                              onKeyDown={(e) => handleKeyDown(e, rt.id, dateStr)}
                              onMouseDown={(e) => handleCellMouseDown(rt.id, dateStr, e)}
                              onMouseEnter={() => handleCellMouseEnter(rt.id, dateStr)}
                              onMouseUp={() => handleCellMouseUp(rt.id, dateStr)}
                              onClick={(e) => handleCellClick(rt.id, dateStr, e)}
                              className={cn(
                                "relative px-3 py-3.5 text-center align-middle border-r border-border/40 select-none transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/80",
                                canManagePricing && "cursor-pointer",
                                isWe && "bg-muted-foreground/[0.015] shadow-[inset_0_0_0_999px_rgba(0,0,0,0.01)]",
                                isSelected && "ring-2 ring-primary border-primary z-10 shadow-sm",
                                !isSelected && cell?.source === "seasonal" && "bg-emerald-500/5 text-emerald-800",
                                !isSelected && cell?.source === "daily" && "bg-violet-500/5 text-violet-800 font-medium",
                                !isSelected && isSeasonUnconfigured && "bg-amber-500/5"
                              )}
                            >
                              {/* Price */}
                              {cell ? (
                                <div className="select-none text-xs font-semibold tabular-nums">
                                  {formatCurrency(cell.price, currency)}
                                </div>
                              ) : (
                                <Skeleton className="h-4 w-12 mx-auto" />
                              )}

                              {/* Overrides Indicators */}
                              {cell?.source === "daily" && (
                                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-violet-500" />
                              )}
                              
                              {cell?.source === "seasonal" && (
                                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-emerald-500" />
                              )}

                              {/* Amber dot: season active but this room type has no rate configured */}
                              {isSeasonUnconfigured && (
                                <Tooltip>
                                  <TooltipTrigger render={
                                    <span className="absolute right-1 top-1 size-1.5 cursor-help rounded-full bg-amber-500" />
                                  } />
                                  <TooltipContent side="top" className="text-xs max-w-[180px]">
                                    Season &ldquo;{cell?.seasonName}&rdquo; is active but no rate is configured for this room type. Using base price.
                                  </TooltipContent>
                                </Tooltip>
                              )}

                              {/* Single Cell Edit Inline Popover */}
                              {canManagePricing && isEditing && (
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Popover open={isEditing} onOpenChange={(open) => !open && setEditingCell(null)}>
                                    <PopoverTrigger render={
                                      <button type="button" aria-label={`Edit ${rt.name} rate on ${dateStr}`} className="absolute inset-0 w-full h-full border-0 bg-transparent p-0 cursor-pointer outline-none" />
                                    } />
                                    <PopoverContent className="w-64 p-3 shadow-xl border-border/80" side="top" align="center" style={{ zIndex: 100 }}>
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                                          <span className="font-semibold text-xs text-foreground truncate max-w-[140px]">{rt.name}</span>
                                          <span className="text-[11px] text-muted-foreground font-medium">{format(parseISO(dateStr), "MMM dd")}</span>
                                        </div>
                                        <div className="space-y-1">
                                          <label htmlFor={`inline-price-${rt.id}-${dateStr}`} className="text-[11px] font-medium text-muted-foreground">Price ({currency})</label>
                                          <Input
                                            id={`inline-price-${rt.id}-${dateStr}`}
                                            type="number"
                                            inputMode="decimal"
                                            min="0.01"
                                            step="0.01"
                                            value={singlePriceInput}
                                            onChange={(e) => setSinglePriceInput(e.target.value)}
                                            className="h-9 focus:ring-1 focus:ring-primary"
                                            autoFocus
                                            onFocus={(e) => e.target.select()}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                handleSaveSingleOverride(rt.id, dateStr);
                                              } else if (e.key === "Escape") {
                                                setEditingCell(null);
                                              }
                                            }}
                                          />
                                        </div>
                                        <div className="flex items-center justify-between gap-1.5 pt-1">
                                          {cell?.source === "daily" && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => clearDailyOverrideMutation.mutate({ roomTypeId: rt.id, date: dateStr })}
                                              disabled={clearDailyOverrideMutation.isPending}
                                              className="ui-press h-8 px-2.5 text-xs font-medium text-destructive [@media(hover:hover)_and_(pointer:fine)]:hover:bg-destructive/10"
                                            >
                                              Clear
                                            </Button>
                                          )}
                                          <div className="flex items-center gap-1.5 ml-auto">
                                            <Button size="sm" variant="ghost" onClick={() => setEditingCell(null)} className="ui-press h-8 px-2.5 text-xs border border-border">Cancel</Button>
                                            <Button
                                              size="sm"
                                              onClick={() => handleSaveSingleOverride(rt.id, dateStr)}
                                              disabled={saveDailyOverrideMutation.isPending}
                                              className="ui-press h-8 px-2.5 text-xs bg-primary text-primary-foreground font-medium"
                                            >
                                              {saveDailyOverrideMutation.isPending ? "..." : "Save"}
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
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
          </div>
        </HeroTabs.Panel>

        {/* ── Tab Content: Seasonal Rates ──────────────────────────── */}
        <HeroTabs.Panel id="seasons" className="mt-4 px-0">
          <div className="rounded-lg border border-border/60 bg-card p-4">
            {loadingSeasons ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : seasons.length === 0 ? (
              <HeroCard className="mx-auto max-w-xl border-border/60 bg-background p-6 text-center shadow-none sm:p-8">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
                  <Tag className="size-5 text-muted-foreground" />
                </div>
                <HeroCard.Header className="items-center gap-1.5">
                  <HeroCard.Title className="text-base font-semibold">No pricing seasons yet</HeroCard.Title>
                  <HeroCard.Description className="max-w-md text-sm leading-6">
                    Set rates for a date period, such as holidays or peak months. Daily overrides remain in control.
                  </HeroCard.Description>
                </HeroCard.Header>
                <HeroCard.Footer className="justify-center">
                  {canManagePricing && (
                    <HeroButton variant="primary" onPress={() => setNewSeasonOpen(true)} className="ui-press">
                      Create season
                    </HeroButton>
                  )}
                </HeroCard.Footer>
              </HeroCard>
            ) : (
              <div className="space-y-5">
                {/* ── Season Timeline / Gantt View ─────────────────────────── */}
                {(() => {
                  // Build a 12-month window from property today for the Gantt
                  const ganttStart = parseISO(todayStr);
                  ganttStart.setDate(1); // first of current month
                  const ganttEnd = new Date(ganttStart);
                  ganttEnd.setFullYear(ganttEnd.getFullYear() + 1);
                  ganttEnd.setDate(ganttEnd.getDate() - 1);
                  const ganttTotalMs = ganttEnd.getTime() - ganttStart.getTime();

                  // Month tick marks
                  const months: { label: string; pct: number }[] = [];
                  const m = new Date(ganttStart);
                  while (m <= ganttEnd) {
                    const pct = ((m.getTime() - ganttStart.getTime()) / ganttTotalMs) * 100;
                    months.push({ label: format(m, "MMM yy"), pct });
                    m.setMonth(m.getMonth() + 1);
                  }

                  // Palette of distinct colors for seasons
                  const palette = [
                    "bg-blue-500/80",
                    "bg-emerald-500/80",
                    "bg-violet-500/80",
                    "bg-amber-500/80",
                    "bg-rose-500/80",
                    "bg-cyan-500/80",
                    "bg-indigo-500/80",
                    "bg-orange-500/80",
                  ];

                  const today = todayStr;
                  const todayPct = Math.max(0, Math.min(100,
                    ((parseISO(today).getTime() - ganttStart.getTime()) / ganttTotalMs) * 100
                  ));

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Season timeline</span>
                        <span className="text-[11px] text-muted-foreground">12-month view · {format(ganttStart, "MMM yyyy")} – {format(ganttEnd, "MMM yyyy")}</span>
                      </div>

                      {/* Gantt chart */}
                      <div className="relative bg-muted/30 rounded-lg border border-border/50 overflow-hidden" style={{ height: `${Math.max(48, seasons.length * 28 + 28)}px` }}>
                        {/* Month grid lines */}
                        {months.map((mo, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 border-l border-border/40"
                            style={{ left: `${mo.pct}%` }}
                          >
                            <span className="absolute top-1 left-1 text-[11px] text-muted-foreground/60 whitespace-nowrap font-medium select-none">
                              {mo.label}
                            </span>
                          </div>
                        ))}

                        {/* Today marker */}
                        <div
                          className="absolute top-0 bottom-0 w-px bg-primary/60 z-10"
                          style={{ left: `${todayPct}%` }}
                        >
                          <span className="absolute -top-0 left-1 text-[11px] text-primary font-semibold whitespace-nowrap select-none">Today</span>
                        </div>

                        {/* Season bars */}
                        {seasons.map((season, idx) => {
                          const startMs = Math.max(parseISO(season.start_date).getTime(), ganttStart.getTime());
                          const endMs = Math.min(parseISO(season.end_date).getTime(), ganttEnd.getTime());
                          if (startMs > endMs) return null; // outside window

                          const leftPct = ((startMs - ganttStart.getTime()) / ganttTotalMs) * 100;
                          const widthPct = ((endMs - startMs) / ganttTotalMs) * 100;
                          const top = 20 + idx * 28;
                          const color = palette[idx % palette.length];
                          const isActive = season.start_date <= today && season.end_date >= today;

                          return (
                            <Tooltip key={season.id}>
                              <TooltipTrigger render={
                                <div
                                  className={cn(
                                    "absolute h-5 rounded-md flex items-center px-2 cursor-pointer transition-opacity [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-90",
                                    color,
                                    isActive && "ring-2 ring-white/40 ring-offset-1"
                                  )}
                                  style={{ left: `${leftPct}%`, width: `max(${widthPct}%, 4px)`, top: `${top}px` }}
                                >
                                  <span className="text-[11px] text-white font-semibold truncate select-none leading-none">
                                    {widthPct > 4 ? season.name : ""}
                                  </span>
                                </div>
                              } />
                              <TooltipContent side="top" className="text-xs">
                                <div className="font-semibold">{season.name}</div>
                                <div className="text-muted-foreground">{season.start_date} &ndash; {season.end_date}</div>
                                <div className="text-muted-foreground">Priority {season.priority}</div>
                                {isActive && <div className="text-emerald-400 font-semibold">Active now</div>}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>

                      {/* Gap detection — highlight uncovered stretches */}
                      {(() => {
                        const covered = seasons
                          .map((s) => ({ start: s.start_date, end: s.end_date }))
                          .sort((a, b) => a.start.localeCompare(b.start));
                        const gaps: { from: string; to: string }[] = [];
                        let reach: string | null = null;
                        for (const period of covered) {
                          if (reach !== null && period.start > reach) {
                            const gapStart = addDays(parseISO(reach), 1);
                            const gapEnd = subDays(parseISO(period.start), 1);
                            if (gapStart <= gapEnd) {
                              gaps.push({
                                from: format(gapStart, "yyyy-MM-dd"),
                                to: format(gapEnd, "yyyy-MM-dd"),
                              });
                            }
                          }
                          if (reach === null || period.end > reach) reach = period.end;
                        }
                        if (gaps.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {gaps.map((g, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[11px] bg-amber-500/10 border border-amber-500/20 text-amber-700 rounded-md px-2 py-0.5">
                                <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                                Gap: {g.from} &ndash; {g.to} &mdash; no seasonal rate
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/80 bg-muted/30">
                      <TableHead className="normal-case tracking-normal font-medium text-muted-foreground">Season name</TableHead>
                      <TableHead className="normal-case tracking-normal font-medium text-muted-foreground">Start date</TableHead>
                      <TableHead className="normal-case tracking-normal font-medium text-muted-foreground">End date</TableHead>
                      <TableHead className="normal-case tracking-normal font-medium text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger render={
                            <span className="inline-flex items-center gap-1 cursor-help">
                              Priority
                              <Info className="size-3 text-muted-foreground" />
                            </span>
                          } />
                          <TooltipContent side="top" className="max-w-[240px] text-xs">
                            Where two seasons cover the same night, the higher priority wins. Seasons may only overlap if their priorities differ.
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="normal-case tracking-normal font-medium text-muted-foreground">Status</TableHead>
                      <TableHead className="text-center normal-case tracking-normal font-medium text-muted-foreground">Room rates covered</TableHead>
                      <TableHead className="text-right normal-case tracking-normal font-medium text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seasons.map((season) => {
                      const coveredCount = season.overrides?.length || 0;
                      return (
                        <TableRow key={season.id} className="border-b border-border/40 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5">
                          <TableCell className="font-semibold text-foreground">{season.name}</TableCell>
                          <TableCell className="text-muted-foreground">{season.start_date}</TableCell>
                          <TableCell className="text-muted-foreground">{season.end_date}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                              {season.priority}
                            </span>
                          </TableCell>
                          <TableCell>{getSeasonStatus(season.start_date, season.end_date)}</TableCell>
                          <TableCell className="text-center font-medium">
                            <Badge variant={coveredCount === roomTypes.length ? "default" : "outline"} className={cn(
                              coveredCount === roomTypes.length ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground"
                            )}>
                              {coveredCount} / {roomTypes.length} types
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {canManagePricing ? (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenOverrides(season)}
                                  className="ui-press h-11 sm:h-9 font-semibold border-input/60 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/40 text-xs"
                                >
                                  Configure rates
                                </Button>

                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Edit ${season.name}`}
                                  onClick={() => {
                                    handleOpenEditSeason(season);
                                    setNewSeasonOpen(true);
                                  }}
                                  className="ui-press size-11 sm:size-9 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/40"
                                >
                                  <Edit2 className="size-3.5 text-muted-foreground" />
                                </Button>

                                <Tooltip>
                                  <TooltipTrigger render={
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      aria-label={`Duplicate ${season.name}`}
                                      onClick={() => duplicateSeasonMutation.mutate(season.id)}
                                      disabled={duplicateSeasonMutation.isPending}
                                      className="ui-press size-11 sm:size-9 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/40"
                                    >
                                      <Copy className="size-3.5 text-muted-foreground" />
                                    </Button>
                                  } />
                                  <TooltipContent side="top" className="text-xs">Duplicate season</TooltipContent>
                                </Tooltip>

                                <Popover>
                                  <PopoverTrigger render={
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      aria-label={`Delete ${season.name}`}
                                      className="ui-press size-11 sm:size-9 text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-destructive/10 [@media(hover:hover)_and_(pointer:fine)]:hover:text-destructive"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  } />
                                  <PopoverContent className="w-56 p-3 shadow-xl border border-destructive/20" align="end">
                                    <div className="space-y-2.5">
                                      <div className="text-xs font-semibold text-foreground">Delete {season.name}?</div>
                                      <p className="text-[11px] text-muted-foreground leading-normal">
                                        This permanently deletes &ldquo;{season.name}&rdquo; and reverts rates to default.
                                      </p>
                                      <div className="flex items-center gap-2 justify-end">
                                        <Button size="sm" variant="ghost" className="ui-press h-10 sm:h-8 text-xs px-2.5 border border-border">Cancel</Button>
                                        <Button
                                          size="sm"
                                          variant="destructive"
                                          onClick={() => deleteSeasonMutation.mutate(season.id)}
                                          disabled={deleteSeasonMutation.isPending}
                                          className="ui-press h-10 sm:h-8 text-xs px-2.5 font-semibold"
                                        >
                                          {deleteSeasonMutation.isPending ? "Deleting…" : "Delete"}
                                        </Button>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">View only</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              </div>
            )}
          </div>
        </HeroTabs.Panel>
      </HeroTabs>

      {/* ── Per-Season Detail pricing Slide-over Sheet ────────────── */}
      <Sheet open={seasonDetailOpen} onOpenChange={setSeasonDetailOpen}>
        <SheetContent className="sm:max-w-md md:max-w-lg overflow-y-auto native-scroll">
          <SheetHeader className="border-b border-border/40 pb-4">
            <SheetTitle className="text-xl font-bold text-foreground">Configure Season Rates</SheetTitle>
            <SheetDescription>
              Set base and weekend prices for &ldquo;{selectedSeasonForOverrides?.name}&rdquo;. Unconfigured room types will remain on default pricing.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-6">
            {/* ── Apply to All Room Types shortcut ── */}
            {roomTypes.length > 1 && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="size-3.5 text-primary" aria-hidden="true" />
                  <span className="text-xs font-semibold text-foreground">Apply to all room types</span>
                  <span className="text-[11px] text-muted-foreground ml-auto">Fills all fields below</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="apply-all-base" className="text-[11px] font-medium text-muted-foreground">Base price ({currency})</label>
                    <div className="flex gap-1.5">
                      <Input
                        id="apply-all-base"
                        type="number"
                        inputMode="decimal"
                        placeholder="e.g. 150"
                        value={applyAllBase}
                        onChange={(e) => setApplyAllBase(e.target.value)}
                        className="h-11 sm:h-9 border-input/60 focus:ring-1 focus:ring-primary"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && applyAllBase) {
                            setSeasonalOverrides((prev) => {
                              const next = { ...prev };
                              roomTypes.forEach((rt) => {
                                next[rt.id] = { ...next[rt.id], basePrice: applyAllBase };
                              });
                              return next;
                            });
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!applyAllBase.trim()}
                        onClick={() => {
                          setSeasonalOverrides((prev) => {
                            const next = { ...prev };
                            roomTypes.forEach((rt) => {
                              next[rt.id] = { ...(next[rt.id] ?? { basePrice: "", weekendPrice: "" }), basePrice: applyAllBase };
                            });
                            return next;
                          });
                        }}
                        className="ui-press h-11 sm:h-9 px-3 text-xs font-semibold border-primary/30 text-primary shrink-0 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-primary/10"
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="apply-all-weekend" className="text-[11px] font-medium text-muted-foreground">Weekend price ({currency})</label>
                    <div className="flex gap-1.5">
                      <Input
                        id="apply-all-weekend"
                        type="number"
                        inputMode="decimal"
                        placeholder="Optional"
                        value={applyAllWeekend}
                        onChange={(e) => setApplyAllWeekend(e.target.value)}
                        className="h-11 sm:h-9 border-input/60 focus:ring-1 focus:ring-primary"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && applyAllWeekend) {
                            setSeasonalOverrides((prev) => {
                              const next = { ...prev };
                              roomTypes.forEach((rt) => {
                                next[rt.id] = { ...next[rt.id], weekendPrice: applyAllWeekend };
                              });
                              return next;
                            });
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!applyAllWeekend.trim()}
                        onClick={() => {
                          setSeasonalOverrides((prev) => {
                            const next = { ...prev };
                            roomTypes.forEach((rt) => {
                              next[rt.id] = { ...(next[rt.id] ?? { basePrice: "", weekendPrice: "" }), weekendPrice: applyAllWeekend };
                            });
                            return next;
                          });
                        }}
                        className="ui-press h-11 sm:h-9 px-3 text-xs font-semibold border-primary/30 text-primary shrink-0 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-primary/10"
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {roomTypes.map((rt) => {
              const values = seasonalOverrides[rt.id] || { basePrice: "", weekendPrice: "" };
              
              return (
                <div key={rt.id} className="space-y-2 p-3 bg-muted/30 border border-border/40 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-foreground">{rt.name}</span>
                    <span className="text-[11px] text-muted-foreground font-medium">
                      Default: {formatCurrency(rt.base_price, currency)} / {rt.weekend_price ? formatCurrency(rt.weekend_price, currency) : "N/A"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label htmlFor={`season-base-${rt.id}`} className="text-[11px] font-medium text-muted-foreground">Base price ({currency})</label>
                      <Input
                        id={`season-base-${rt.id}`}
                        type="number"
                        inputMode="decimal"
                        placeholder="e.g. 150"
                        value={values.basePrice}
                        onChange={(e) => {
                          setSeasonalOverrides((prev) => ({
                            ...prev,
                            [rt.id]: { ...prev[rt.id], basePrice: e.target.value },
                          }));
                        }}
                        className="h-11 sm:h-9 focus:ring-1 focus:ring-primary border-input/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`season-weekend-${rt.id}`} className="text-[11px] font-medium text-muted-foreground">Weekend price ({currency})</label>
                      <Input
                        id={`season-weekend-${rt.id}`}
                        type="number"
                        inputMode="decimal"
                        placeholder="Optional (e.g. 180)"
                        value={values.weekendPrice}
                        onChange={(e) => {
                          setSeasonalOverrides((prev) => ({
                            ...prev,
                            [rt.id]: { ...prev[rt.id], weekendPrice: e.target.value },
                          }));
                        }}
                        className="h-11 sm:h-9 focus:ring-1 focus:ring-primary border-input/60"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <SheetFooter className="border-t border-border/40 pt-4">
            <Button variant="outline" onClick={() => setSeasonDetailOpen(false)} className="ui-press h-11 sm:h-9 border-border [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/40">Cancel</Button>
            <Button
              disabled={saveSeasonalOverridesMutation.isPending}
              onClick={() => saveSeasonalOverridesMutation.mutate()}
              className="ui-press h-11 sm:h-9 font-semibold bg-primary text-primary-foreground shadow-sm [@media(hover:hover)_and_(pointer:fine)]:hover:bg-primary/95"
            >
              {saveSeasonalOverridesMutation.isPending ? "Saving..." : "Save Rates"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
    </TooltipProvider>
  );
}
