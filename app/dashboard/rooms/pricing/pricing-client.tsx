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
  const date = new Date(dateStr + "T12:00:00");
  const day = date.getDay();
  return day === 5 || day === 6; // Friday and Saturday rate nights (property default)
}

export function PricingClient({ hotelId, orgId, currency, roomTypes }: PricingClientProps) {
  const queryClient = useQueryClient();

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

  // Generate date columns dynamically based on the current range
  const dateColumns = useMemo(() => {
    const list: string[] = [];
    const start = new Date(startDateStr + "T12:00:00");
    const end = new Date(endDateStr + "T12:00:00");
    const cur = new Date(start);
    while (cur <= end) {
      list.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }, [startDateStr, endDateStr]);

  // How many days are in the current window
  const windowDays = dateColumns.length;

  // Adjust dates viewport — jump by the current window size
  const handlePrevWindow = () => {
    const currentStart = new Date(startDateStr + "T12:00:00");
    const newStart = subDays(currentStart, windowDays).toISOString().split("T")[0];
    const newEnd = subDays(currentStart, 1).toISOString().split("T")[0];
    setDateRange(newStart, newEnd);
    clearSelection();
  };

  const handleNextWindow = () => {
    const currentStart = new Date(startDateStr + "T12:00:00");
    const newStart = addDays(currentStart, windowDays).toISOString().split("T")[0];
    const newEnd = addDays(currentStart, windowDays * 2 - 1).toISOString().split("T")[0];
    setDateRange(newStart, newEnd);
    clearSelection();
  };

  const handleSetWindow = (days: number) => {
    const today = new Date();
    const start = today.toISOString().split("T")[0];
    const end = addDays(today, days - 1).toISOString().split("T")[0];
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
    queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map((rt) => rt.id), startDateStr, endDateStr),
    queryFn: async () => {
      const res = await getResolvedRates(roomTypes.map((rt) => rt.id), startDateStr, endDateStr);
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
    queryKey: qk.pricingOccupancy(orgId, hotelId, startDateStr, endDateStr),
    queryFn: async () => {
      const res = await getOccupancyByDate(startDateStr, endDateStr);
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
    const startStr = seasonStart.toISOString().split("T")[0];
    const endStr = seasonEnd.toISOString().split("T")[0];

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
      const startStr = seasonStart.toISOString().split("T")[0];
      const endStr = seasonEnd.toISOString().split("T")[0];
      const res = await createSeasonalRate(seasonName, startStr, endStr, seasonPriorityValue);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Season created successfully");
      queryClient.invalidateQueries({ queryKey: qk.pricingSeasons(orgId, hotelId) });
      // The rate grid labels every night with the season covering it, so a new
      // season changes those cells even before any override is configured.
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
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
      const startStr = seasonStart.toISOString().split("T")[0];
      const endStr = seasonEnd.toISOString().split("T")[0];
      const res = await updateSeasonalRate(editSeasonId, seasonName, startStr, endStr, seasonPriorityValue);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Season updated successfully");
      queryClient.invalidateQueries({ queryKey: qk.pricingSeasons(orgId, hotelId) });
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
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
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
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
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
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
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
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
      // Cancel queries
      const queryKey = qk.pricingResolved(orgId, hotelId, roomTypes.map((rt) => rt.id), startDateStr, endDateStr);
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous value
      const previousRates = queryClient.getQueryData<ResolvedPriceCell[]>(queryKey);

      // Optimistic update
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

      return { previousRates };
    },
    onSuccess: () => {
      toast.success("Price updated");
      setEditingCell(null);
    },
    onError: (err, variables, context) => {
      toast.danger(err.message || "Failed to update price");
      // Rollback
      if (context?.previousRates) {
        const queryKey = qk.pricingResolved(orgId, hotelId, roomTypes.map((rt) => rt.id), startDateStr, endDateStr);
        queryClient.setQueryData(queryKey, context.previousRates);
      }
    },
    onSettled: () => {
      const queryKey = qk.pricingResolved(orgId, hotelId, roomTypes.map((rt) => rt.id), startDateStr, endDateStr);
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Clear Single Cell Daily Override
  const clearDailyOverrideMutation = useMutation({
    mutationFn: async ({ roomTypeId, date }: { roomTypeId: string; date: string }) => {
      const res = await deleteDailyRateOverride(roomTypeId, date);
      if (!res.success) {
        throw new Error(res.error || "Failed to clear daily override");
      }
    },
    onSuccess: () => {
      toast.success("Override cleared");
      setEditingCell(null);
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
    },
    onError: (err) => {
      toast.danger(err.message || "Failed to clear override");
    },
  });

  // Bulk Daily Override Mutation
  const bulkSaveDailyOverridesMutation = useMutation({
    mutationFn: async ({ price }: { price: number }) => {
      const upserts = selectedCells.map((cell) => ({
        roomTypeId: cell.roomTypeId,
        date: cell.date,
        price,
      }));
      const res = await bulkUpsertDailyRateOverrides(upserts);
      if (!res.success) {
        throw new Error(res.error || "Failed to save bulk prices");
      }
    },
    onSuccess: () => {
      toast.success(`Updated prices for ${selectedCells.length} date(s)`);
      setBulkPriceInput("");
      clearSelection();
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
    },
    onError: (err) => {
      toast.danger(err.message || "Failed to save bulk prices");
    },
  });

  // Bulk Clear Daily Override Mutation
  const bulkClearDailyOverridesMutation = useMutation({
    mutationFn: async () => {
      const deletes = selectedCells.map((cell) => ({
        roomTypeId: cell.roomTypeId,
        date: cell.date,
      }));
      const res = await bulkDeleteDailyRateOverrides(deletes);
      if (!res.success) {
        throw new Error(res.error || "Failed to clear overrides");
      }
    },
    onSuccess: () => {
      toast.success(`Cleared overrides for ${selectedCells.length} date(s)`);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
    },
    onError: (err) => {
      toast.danger(err.message || "Failed to clear overrides");
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
    setSeasonStart(new Date(season.start_date + "T12:00:00"));
    setSeasonEnd(new Date(season.end_date + "T12:00:00"));
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

  // Keyboard navigation
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
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (dateIndex > 0) {
          nextDate = dateColumns[dateIndex - 1];
        } else if (rtIndex > 0) {
          nextRtId = roomTypes[rtIndex - 1].id;
          nextDate = dateColumns[dateColumns.length - 1];
        }
      } else {
        if (dateIndex < dateColumns.length - 1) {
          nextDate = dateColumns[dateIndex + 1];
        } else if (rtIndex < roomTypes.length - 1) {
          nextRtId = roomTypes[rtIndex + 1].id;
          nextDate = dateColumns[0];
        }
      }
    } else if (e.key === "Escape") {
      clearSelection();
      setEditingCell(null);
      return;
    } else if (e.key === "Enter") {
      setEditingCell({ roomTypeId: currentRtId, date: currentDate });
      return;
    } else {
      return; // Do nothing for other keys
    }

    e.preventDefault();
    setSelectedCells([{ roomTypeId: nextRtId, date: nextDate }]);
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
    const today = new Date().toISOString().split("T")[0];
    if (endDate < today) {
      return <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted-foreground/20 font-medium">Past</Badge>;
    }
    if (startDate <= today && endDate >= today) {
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-semibold animate-pulse">Active</Badge>;
    }
    return <Badge variant="outline" className="bg-blue-500/5 text-blue-500 border-blue-500/20 font-medium">Upcoming</Badge>;
  };

  // Inline single save action
  const handleSaveSingleOverride = (roomTypeId: string, date: string) => {
    const price = parseFloat(singlePriceInput);
    if (isNaN(price) || price <= 0) {
      toast.danger("Please enter a valid price greater than 0");
      return;
    }
    saveDailyOverrideMutation.mutate({ roomTypeId, date, price });
  };

  // Bulk save action
  const handleSaveBulkOverride = () => {
    const price = parseFloat(bulkPriceInput);
    if (isNaN(price) || price <= 0) {
      toast.danger("Please enter a valid price greater than 0");
      return;
    }
    bulkSaveDailyOverridesMutation.mutate({ price });
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
    <div className="space-y-5">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Revenue controls</p>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl">Rates</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Set daily room prices, review demand, and maintain seasonal rate periods.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "seasons" && (
            <Dialog open={newSeasonOpen} onOpenChange={(open) => {
              setNewSeasonOpen(open);
              if (!open) {
                setEditSeasonId(null);
                resetSeasonForm();
              }
            }}>
              <DialogTrigger render={
                <HeroButton size="sm" variant="primary">
                  <Plus className="size-4 mr-1.5" />
                  New Season
                </HeroButton>
              } />
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-foreground">
                    {editSeasonId ? "Edit Season" : "Add Seasonal Rate Period"}
                  </DialogTitle>
                  <DialogDescription>
                    Define a seasonal period. You can configure custom rates for room types during this range.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-1">
                    <label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Season Name</label>
                    <Input
                      id="name"
                      placeholder="e.g. Christmas Peak 2026"
                      value={seasonName}
                      onChange={(e) => setSeasonName(e.target.value)}
                    />
                  </div>

                  <DateRangePicker
                    value={seasonStart && seasonEnd ? {
                      start: parseCalendarDate(format(seasonStart, "yyyy-MM-dd")),
                      end: parseCalendarDate(format(seasonEnd, "yyyy-MM-dd")),
                    } : null}
                    onChange={(range) => {
                      setSeasonStart(range ? new Date(`${range.start.toString()}T12:00:00`) : undefined);
                      setSeasonEnd(range ? new Date(`${range.end.toString()}T12:00:00`) : undefined);
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
                      <RangeCalendar aria-label="Season date range" visibleDuration={{ months: 2 }}>
                        <RangeCalendar.Header>
                          <RangeCalendar.YearPickerTrigger>
                            <RangeCalendar.YearPickerTriggerHeading />
                            <RangeCalendar.YearPickerTriggerIndicator />
                          </RangeCalendar.YearPickerTrigger>
                          <RangeCalendar.NavButton slot="previous" />
                          <RangeCalendar.NavButton slot="next" />
                        </RangeCalendar.Header>
                        <div className="flex gap-4">
                          {[0, 1].map((monthOffset) => (
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

                  <div className="space-y-1">
                    <label htmlFor="season-priority" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                    />
                    <p id="season-priority-hint" className="text-[11px] leading-relaxed text-muted-foreground">
                      Higher wins when two seasons cover the same night — put a conference
                      week above the summer season it sits inside. Seasons may only overlap
                      if their priorities differ. Leave at 0 for an ordinary season.
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
                  }} className="border-border hover:bg-accent/40">Cancel</Button>
                  <Button
                    disabled={createSeasonMutation.isPending || updateSeasonMutation.isPending || !!clientOverlapSeason || !seasonName.trim() || !seasonStart || !seasonEnd}
                    onClick={() => {
                      if (editSeasonId) {
                        updateSeasonMutation.mutate();
                      } else {
                        createSeasonMutation.mutate();
                      }
                    }}
                    className="font-medium bg-primary text-primary-foreground hover:bg-primary/90"
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
              <HeroButton variant="ghost" size="sm" isIconOnly aria-label="Previous date range" onPress={handlePrevWindow}>
                <ChevronLeft className="size-4" />
              </HeroButton>
              
              <Popover open={rangePopoverOpen} onOpenChange={setRangePopoverOpen}>
                <PopoverTrigger render={
                  <Button variant="outline" className="font-semibold border-input/60 hover:bg-accent/40 min-w-[240px] justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{format(parseISO(startDateStr), "MMM dd, yyyy")} – {format(parseISO(endDateStr), "MMM dd, yyyy")}</span>
                  </Button>
                } />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseISO(startDateStr)}
                    onSelect={(d) => {
                      if (d) {
                        const start = d.toISOString().split("T")[0];
                        const end = addDays(d, windowDays - 1).toISOString().split("T")[0];
                        setDateRange(start, end);
                        clearSelection();
                        setTimeout(() => setRangePopoverOpen(false), 0);
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>

              <HeroButton variant="ghost" size="sm" isIconOnly aria-label="Next date range" onPress={handleNextWindow}>
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
                    className="min-w-10 text-xs"
                  >
                    {d}d
                  </HeroButton>
                ))}
                <HeroButton variant="ghost" size="sm" onPress={handleDateReset} className="ml-1 text-xs">
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

          <Surface variant="secondary" className="rounded-lg border border-border/70 p-3 shadow-none">
            {selectedCells.length === 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
                    <SlidersHorizontal className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Change a daily rate</p>
                    <p className="text-xs leading-5 text-muted-foreground">Select one cell, or drag across dates and room types. Then enter one price and apply it.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded border border-border bg-background px-2 py-1">1. Select</span>
                  <span>→</span>
                  <span className="rounded border border-border bg-background px-2 py-1">2. Enter price</span>
                  <span>→</span>
                  <span className="rounded border border-border bg-background px-2 py-1">3. Apply</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedCells.length} rate {selectedCells.length === 1 ? "selected" : "cells selected"}</p>
                  <p className="text-xs text-muted-foreground">New price replaces daily rate for selected date{selectedCells.length === 1 ? "" : "s"}.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <HeroInput
                    type="number"
                    min="0.01"
                    step="0.01"
                    aria-label={`New price in ${currency}`}
                    placeholder={`Price (${currency})`}
                    value={bulkPriceInput}
                    onChange={(event) => setBulkPriceInput(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") handleSaveBulkOverride(); }}
                    variant="secondary"
                    className="w-36"
                  />
                  <HeroButton variant="primary" size="sm" isPending={bulkSaveDailyOverridesMutation.isPending} onPress={handleSaveBulkOverride}>
                    Apply price
                  </HeroButton>
                  <HeroButton variant="outline" size="sm" isPending={bulkClearDailyOverridesMutation.isPending} onPress={() => bulkClearDailyOverridesMutation.mutate()}>
                    Clear override
                  </HeroButton>
                  <HeroButton variant="ghost" size="sm" onPress={clearSelection}>Cancel</HeroButton>
                </div>
              </div>
            )}
          </Surface>

          {/* ── Mobile/Tablet View (Date Scroller & Room type List) ── */}
          <div className="block lg:hidden">
            <div className="space-y-4">
              {roomTypes.map((rt) => (
                <div key={rt.id} className="bg-card rounded-xl border border-border/50 p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2">
                    <span className="font-bold text-foreground text-base">{rt.name}</span>
                    <span className="text-xs text-muted-foreground">Default: {formatCurrency(rt.base_price, currency)} / {rt.weekend_price ? formatCurrency(rt.weekend_price, currency) : "N/A"}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {dateColumns.map((dateStr) => {
                      const dateObj = parseISO(dateStr);
                      const key = `${rt.id}_${dateStr}`;
                      const cell = resolvedRateMap.get(key);
                      const active = selectedCells.some((c) => c.roomTypeId === rt.id && c.date === dateStr);

                      return (
                        <div
                          key={dateStr}
                          onClick={(e) => handleCellClick(rt.id, dateStr, e)}
                          className={cn(
                            "flex flex-col justify-between p-2 rounded-lg border text-left cursor-pointer transition-all hover:bg-accent/10 select-none",
                            active && "ring-2 ring-primary border-primary",
                            cell?.source === "seasonal" && "bg-emerald-500/5 border-emerald-500/15 text-emerald-800",
                            cell?.source === "daily" && "bg-violet-500/5 border-violet-500/15 text-violet-800",
                            cell?.source === "base" && "bg-muted/10 border-border/80"
                          )}
                        >
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            {format(dateObj, "EEE dd MMM")}
                          </span>
                          <span className="font-bold text-sm mt-1">
                            {cell ? formatCurrency(cell.price, currency) : <Skeleton className="h-4 w-12" />}
                          </span>
                        </div>
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
                            <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                              {format(dateObj, "EEE")}
                            </div>
                            <div className="font-bold text-xs text-foreground mt-0.5">
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
                      <tr className="border-b-2 border-border/60 bg-muted/20">
                        <td className="sticky left-0 z-10 bg-muted/30 border-r border-border/80 px-4 py-2 font-bold text-foreground align-middle">
                          <div className="text-xs font-bold text-foreground">Occupancy</div>
                          <div className="text-[10px] text-muted-foreground font-normal mt-0.5">rooms sold / total</div>
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
                                  <span className={cn("text-[10px] tabular-nums", textColor)}>
                                    {pct}%
                                  </span>
                                  {/* Mini bar */}
                                  <div className="w-full h-1 rounded-full bg-border/60 overflow-hidden">
                                    <div
                                      className={cn("h-full rounded-full transition-all", barColor)}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-muted-foreground/60 tabular-nums">
                                    {occ.occupied}/{occ.total}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/40">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {roomTypes.map((rt) => (
                      <tr key={rt.id} className="border-b border-border/40 hover:bg-accent/5 transition-colors">
                        <td className="sticky left-0 z-10 bg-card border-r border-border/80 px-4 py-3 font-semibold text-foreground align-middle shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          <div className="truncate text-sm">{rt.name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 font-normal">
                            Def: {formatCurrency(rt.base_price, currency)}
                          </div>
                        </td>
                        {dateColumns.map((dateStr) => {
                          const key = `${rt.id}_${dateStr}`;
                          const cell = resolvedRateMap.get(key);
                          const isWe = isWeekend(dateStr);
                          
                          // Selection highlights
                          const isSelected = selectedCells.some(
                            (c) => c.roomTypeId === rt.id && c.date === dateStr
                          );
                          const isEditing = editingCell?.roomTypeId === rt.id && editingCell?.date === dateStr;
                          // Season is active for this date but no rate override configured for this room type
                          const isSeasonUnconfigured = cell?.source === "base" && !!cell?.seasonName;

                          return (
                            <td
                              key={dateStr}
                              id={`cell-${rt.id}-${dateStr}`}
                              tabIndex={0}
                              onKeyDown={(e) => handleKeyDown(e, rt.id, dateStr)}
                              onMouseDown={(e) => handleCellMouseDown(rt.id, dateStr, e)}
                              onMouseEnter={() => handleCellMouseEnter(rt.id, dateStr)}
                              onMouseUp={() => handleCellMouseUp(rt.id, dateStr)}
                              onClick={(e) => handleCellClick(rt.id, dateStr, e)}
                              className={cn(
                                "relative px-3 py-3.5 text-center align-middle border-r border-border/40 cursor-pointer select-none transition-all focus:outline-none focus:ring-1 focus:ring-primary/80",
                                isWe && "bg-muted-foreground/[0.015] shadow-[inset_0_0_0_999px_rgba(0,0,0,0.01)]",
                                isSelected && "ring-2 ring-primary border-primary z-10 shadow-sm",
                                !isSelected && cell?.source === "seasonal" && "bg-emerald-500/5 text-emerald-800",
                                !isSelected && cell?.source === "daily" && "bg-violet-500/5 text-violet-800 font-medium",
                                !isSelected && isSeasonUnconfigured && "bg-amber-500/5"
                              )}
                            >
                              {/* Price */}
                              {cell ? (
                                <div className="font-bold text-xs select-none">
                                  {formatCurrency(cell.price, currency)}
                                </div>
                              ) : (
                                <Skeleton className="h-4 w-12 mx-auto" />
                              )}

                              {/* Overrides Indicators */}
                              {cell?.source === "daily" && (
                                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-violet-500 animate-in zoom-in duration-300" />
                              )}
                              
                              {cell?.source === "seasonal" && (
                                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-500 animate-in zoom-in duration-300" />
                              )}

                              {/* Amber dot: season active but this room type has no rate configured */}
                              {isSeasonUnconfigured && (
                                <Tooltip>
                                  <TooltipTrigger render={
                                    <span className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-500 animate-in zoom-in duration-300 cursor-help" />
                                  } />
                                  <TooltipContent side="top" className="text-xs max-w-[180px]">
                                    Season &ldquo;{cell?.seasonName}&rdquo; is active but no rate is configured for this room type. Using base price.
                                  </TooltipContent>
                                </Tooltip>
                              )}

                              {/* Single Cell Edit Inline Popover */}
                              {isEditing && (
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Popover open={isEditing} onOpenChange={(open) => !open && setEditingCell(null)}>
                                    <PopoverTrigger render={
                                      <button className="absolute inset-0 w-full h-full border-0 bg-transparent p-0 cursor-pointer outline-none" />
                                    } />
                                    <PopoverContent className="w-64 p-3 shadow-xl border-border/80" side="top" align="center" style={{ zIndex: 100 }}>
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                                          <span className="font-bold text-xs text-foreground truncate max-w-[140px]">{rt.name}</span>
                                          <span className="text-[10px] text-muted-foreground font-semibold">{format(parseISO(dateStr), "MMM dd")}</span>
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Price ({currency})</label>
                                          <Input
                                            type="number"
                                            value={singlePriceInput}
                                            onChange={(e) => setSinglePriceInput(e.target.value)}
                                            className="h-8 focus:ring-1 focus:ring-primary"
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
                                              className="text-destructive hover:bg-destructive/10 text-xs px-2 h-7 font-medium"
                                            >
                                              Clear
                                            </Button>
                                          )}
                                          <div className="flex items-center gap-1.5 ml-auto">
                                            <Button size="sm" variant="ghost" onClick={() => setEditingCell(null)} className="h-7 text-xs px-2 border border-border">Cancel</Button>
                                            <Button
                                              size="sm"
                                              onClick={() => handleSaveSingleOverride(rt.id, dateStr)}
                                              disabled={saveDailyOverrideMutation.isPending}
                                              className="h-7 text-xs bg-primary text-primary-foreground font-medium"
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
                  <HeroButton variant="primary" onPress={() => setNewSeasonOpen(true)}>
                    Create season
                  </HeroButton>
                </HeroCard.Footer>
              </HeroCard>
            ) : (
              <div className="space-y-5">
                {/* ── Season Timeline / Gantt View ─────────────────────────── */}
                {(() => {
                  // Build a 12-month window from today for the Gantt
                  const ganttStart = new Date();
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

                  const today = new Date().toISOString().split("T")[0];
                  const todayPct = Math.max(0, Math.min(100,
                    ((new Date(today).getTime() - ganttStart.getTime()) / ganttTotalMs) * 100
                  ));

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">Season Timeline</span>
                        <span className="text-[10px] text-muted-foreground">12-month view · {format(ganttStart, "MMM yyyy")} – {format(ganttEnd, "MMM yyyy")}</span>
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
                            <span className="absolute top-1 left-1 text-[9px] text-muted-foreground/60 whitespace-nowrap font-medium select-none">
                              {mo.label}
                            </span>
                          </div>
                        ))}

                        {/* Today marker */}
                        <div
                          className="absolute top-0 bottom-0 w-px bg-primary/60 z-10"
                          style={{ left: `${todayPct}%` }}
                        >
                          <span className="absolute -top-0 left-1 text-[9px] text-primary font-bold whitespace-nowrap select-none">Today</span>
                        </div>

                        {/* Season bars */}
                        {seasons.map((season, idx) => {
                          const startMs = Math.max(new Date(season.start_date).getTime(), ganttStart.getTime());
                          const endMs = Math.min(new Date(season.end_date).getTime(), ganttEnd.getTime());
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
                                    "absolute h-5 rounded-md flex items-center px-2 cursor-pointer transition-opacity hover:opacity-90",
                                    color,
                                    isActive && "ring-2 ring-white/40 ring-offset-1"
                                  )}
                                  style={{ left: `${leftPct}%`, width: `max(${widthPct}%, 4px)`, top: `${top}px` }}
                                >
                                  <span className="text-[10px] text-white font-semibold truncate select-none leading-none">
                                    {widthPct > 4 ? season.name : ""}
                                  </span>
                                </div>
                              } />
                              <TooltipContent side="top" className="text-xs">
                                <div className="font-bold">{season.name}</div>
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
                        // Sweep with a running furthest end date. Seasons may now
                        // overlap and nest, so comparing each season only against
                        // the next one by start date would report a gap that an
                        // earlier, longer season already covers.
                        let reach: string | null = null;
                        for (const period of covered) {
                          if (reach !== null && period.start > reach) {
                            const gapStart = new Date(reach + "T12:00:00");
                            gapStart.setDate(gapStart.getDate() + 1);
                            const gapEnd = new Date(period.start + "T12:00:00");
                            gapEnd.setDate(gapEnd.getDate() - 1);
                            if (gapStart <= gapEnd) {
                              gaps.push({
                                from: gapStart.toISOString().split("T")[0],
                                to: gapEnd.toISOString().split("T")[0],
                              });
                            }
                          }
                          if (reach === null || period.end > reach) reach = period.end;
                        }
                        if (gaps.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {gaps.map((g, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-700 rounded-md px-2 py-0.5">
                                <AlertTriangle className="size-3 shrink-0" />
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
                      <TableHead className="font-bold text-foreground">Season Name</TableHead>
                      <TableHead className="font-bold text-foreground">Start Date</TableHead>
                      <TableHead className="font-bold text-foreground">End Date</TableHead>
                      <TableHead className="font-bold text-foreground">
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
                      <TableHead className="font-bold text-foreground">Status</TableHead>
                      <TableHead className="font-bold text-foreground text-center">Room Rates Covered</TableHead>
                      <TableHead className="text-right font-bold text-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seasons.map((season) => {
                      const coveredCount = season.overrides?.length || 0;
                      return (
                        <TableRow key={season.id} className="border-b border-border/40 hover:bg-accent/5">
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
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenOverrides(season)}
                                className="font-semibold border-input/60 hover:bg-accent/40 text-xs"
                              >
                                Configure Rates
                              </Button>

                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  handleOpenEditSeason(season);
                                  setNewSeasonOpen(true);
                                }}
                                className="size-8 hover:bg-accent/40"
                              >
                                <Edit2 className="size-3.5 text-muted-foreground" />
                              </Button>

                              <Tooltip>
                                <TooltipTrigger render={
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => duplicateSeasonMutation.mutate(season.id)}
                                    disabled={duplicateSeasonMutation.isPending}
                                    className="size-8 hover:bg-accent/40"
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
                                    className="size-8 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                } />
                                <PopoverContent className="w-56 p-3 shadow-xl border border-destructive/20" align="end">
                                  <div className="space-y-2.5">
                                    <div className="text-xs font-bold text-foreground">Are you absolutely sure?</div>
                                    <p className="text-[10px] text-muted-foreground leading-normal">
                                      This will permanently delete &ldquo;{season.name}&rdquo; and revert rates to default.
                                    </p>
                                    <div className="flex items-center gap-2 justify-end">
                                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2 border border-border">No</Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => deleteSeasonMutation.mutate(season.id)}
                                        disabled={deleteSeasonMutation.isPending}
                                        className="h-7 text-xs px-2 font-semibold"
                                      >
                                        {deleteSeasonMutation.isPending ? "..." : "Yes, Delete"}
                                      </Button>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
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
            {/* ── Apply to All Room Types shortcut ── industry standard ── */}
            {roomTypes.length > 1 && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="size-3.5 text-primary" />
                  <span className="text-xs font-bold text-foreground">Apply to all room types</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">Fills all fields below</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Base Price ({currency})</label>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        placeholder="e.g. 150"
                        value={applyAllBase}
                        onChange={(e) => setApplyAllBase(e.target.value)}
                        className="h-8 text-sm border-input/60 focus:ring-1 focus:ring-primary"
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
                        className="h-8 px-2.5 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10 shrink-0"
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Weekend Price ({currency})</label>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        placeholder="Optional"
                        value={applyAllWeekend}
                        onChange={(e) => setApplyAllWeekend(e.target.value)}
                        className="h-8 text-sm border-input/60 focus:ring-1 focus:ring-primary"
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
                        className="h-8 px-2.5 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10 shrink-0"
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
                    <span className="font-bold text-sm text-foreground">{rt.name}</span>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      Default: {formatCurrency(rt.base_price, currency)} / {rt.weekend_price ? formatCurrency(rt.weekend_price, currency) : "N/A"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Base Price ({currency})</label>
                      <Input
                        type="number"
                        placeholder="e.g. 150"
                        value={values.basePrice}
                        onChange={(e) => {
                          setSeasonalOverrides((prev) => ({
                            ...prev,
                            [rt.id]: { ...prev[rt.id], basePrice: e.target.value },
                          }));
                        }}
                        className="h-9 focus:ring-1 focus:ring-primary border-input/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Weekend Price ({currency})</label>
                      <Input
                        type="number"
                        placeholder="Optional (e.g. 180)"
                        value={values.weekendPrice}
                        onChange={(e) => {
                          setSeasonalOverrides((prev) => ({
                            ...prev,
                            [rt.id]: { ...prev[rt.id], weekendPrice: e.target.value },
                          }));
                        }}
                        className="h-9 focus:ring-1 focus:ring-primary border-input/60"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <SheetFooter className="border-t border-border/40 pt-4">
            <Button variant="outline" onClick={() => setSeasonDetailOpen(false)} className="border-border hover:bg-accent/40">Cancel</Button>
            <Button
              disabled={saveSeasonalOverridesMutation.isPending}
              onClick={() => saveSeasonalOverridesMutation.mutate()}
              className="font-semibold bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm"
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
