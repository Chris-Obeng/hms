"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sliders,
  DollarSign,
  Tag,
  AlertTriangle,
  Info,
  Check,
  CheckCircle2,
  SlidersHorizontal,
  X,
  Keyboard,
} from "lucide-react";
import { format, addDays, subDays, parseISO, isSameDay } from "date-fns";

import { qk } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { usePricingStore, SelectedCell } from "@/lib/store/pricing-store";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  upsertSeasonalRateOverride,
  upsertDailyRateOverride,
  deleteDailyRateOverride,
  bulkUpsertDailyRateOverrides,
  bulkDeleteDailyRateOverrides,
  getResolvedRates,
  ResolvedPriceCell,
} from "@/app/actions/pricing";

interface PricingClientProps {
  hotelId: string;
  orgId: string;
  userId: string;
  currency: string;
  roomTypes: {
    id: string;
    name: string;
    base_price: number;
    weekend_price: number | null;
  }[];
}

function formatCurrency(amount: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr + "T12:00:00");
  const day = date.getDay();
  return day === 5 || day === 6; // 5 is Friday, 6 is Saturday
}

export function PricingClient({ hotelId, orgId, userId, currency, roomTypes }: PricingClientProps) {
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
  const [selectedSeasonForOverrides, setSelectedSeasonForOverrides] = useState<any>(null);
  const [seasonalOverrides, setSeasonalOverrides] = useState<Record<string, { basePrice: string; weekendPrice: string }>>({});
  
  // Single/Bulk daily price edit state
  const [bulkPriceInput, setBulkPriceInput] = useState("");
  const [singlePriceInput, setSinglePriceInput] = useState("");
  const [isBulkEditing, setIsBulkEditing] = useState(false);

  // Popover open states for date pickers
  const [startPopoverOpen, setStartPopoverOpen] = useState(false);
  const [endPopoverOpen, setEndPopoverOpen] = useState(false);
  const [rangePopoverOpen, setRangePopoverOpen] = useState(false);

  // Generate 30 columns for date grid
  const dateColumns = useMemo(() => {
    const list: string[] = [];
    const start = new Date(startDateStr + "T12:00:00");
    for (let i = 0; i < 30; i++) {
      const d = addDays(start, i);
      list.push(d.toISOString().split("T")[0]);
    }
    return list;
  }, [startDateStr]);

  // Adjust dates viewport
  const handlePrev30Days = () => {
    const currentStart = new Date(startDateStr + "T12:00:00");
    const newStart = subDays(currentStart, 30).toISOString().split("T")[0];
    const newEnd = subDays(currentStart, 1).toISOString().split("T")[0];
    setDateRange(newStart, newEnd);
    clearSelection();
  };

  const handleNext30Days = () => {
    const currentStart = new Date(startDateStr + "T12:00:00");
    const newStart = addDays(currentStart, 30).toISOString().split("T")[0];
    const newEnd = addDays(currentStart, 59).toISOString().split("T")[0];
    setDateRange(newStart, newEnd);
    clearSelection();
  };

  const handleDateReset = () => {
    const today = new Date();
    const start = today.toISOString().split("T")[0];
    const end = addDays(today, 29).toISOString().split("T")[0];
    setDateRange(start, end);
    clearSelection();
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
          overrides:seasonal_rate_overrides (
            id,
            room_type_id,
            base_price,
            weekend_price
          )
        `)
        .eq("hotel_id", hotelId)
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

  // Client-side overlap validation helper
  const clientOverlapSeason = useMemo(() => {
    if (!seasonStart || !seasonEnd) return null;
    const startStr = seasonStart.toISOString().split("T")[0];
    const endStr = seasonEnd.toISOString().split("T")[0];

    return seasons.find((s) => {
      // Skip check if editing same season
      if (editSeasonId && s.id === editSeasonId) return false;
      return startStr <= s.end_date && endStr >= s.start_date;
    });
  }, [seasonStart, seasonEnd, seasons, editSeasonId]);

  // ── Mutations ──────────────────────────────────────────────────────

  // Create Season
  const createSeasonMutation = useMutation({
    mutationFn: async () => {
      if (!seasonStart || !seasonEnd || !seasonName.trim()) {
        throw new Error("All fields are required");
      }
      const startStr = seasonStart.toISOString().split("T")[0];
      const endStr = seasonEnd.toISOString().split("T")[0];
      const res = await createSeasonalRate(seasonName, startStr, endStr);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Season created successfully");
      queryClient.invalidateQueries({ queryKey: qk.pricingSeasons(orgId, hotelId) });
      setNewSeasonOpen(false);
      resetSeasonForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create season");
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
      const res = await updateSeasonalRate(editSeasonId, seasonName, startStr, endStr);
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
    onError: (err: any) => {
      toast.error(err.message || "Failed to update season");
    },
  });

  // Delete Season
  const deleteSeasonMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteSeasonalRate(id);
      if (!res.success) {
        throw new Error((res as any).error || "Failed to delete season");
      }
    },
    onSuccess: () => {
      toast.success("Season deleted successfully");
      queryClient.invalidateQueries({ queryKey: qk.pricingSeasons(orgId, hotelId) });
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete season");
    },
  });

  // Upsert Seasonal Overrides
  const saveSeasonalOverridesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSeasonForOverrides) return;
      const seasonId = selectedSeasonForOverrides.id;

      // Promise run upserts for each room type price specified
      const upsertPromises = Object.entries(seasonalOverrides).map(async ([roomTypeId, prices]) => {
        const base = parseFloat(prices.basePrice);
        const weekend = prices.weekendPrice ? parseFloat(prices.weekendPrice) : null;
        if (isNaN(base) || base <= 0) return;
        
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
    onError: (err: any) => {
      toast.error(err.message || "Failed to save seasonal overrides");
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
    onError: (err: any, variables, context) => {
      toast.error(err.message || "Failed to update price");
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
        throw new Error((res as any).error || "Failed to clear daily override");
      }
    },
    onSuccess: () => {
      toast.success("Override cleared");
      setEditingCell(null);
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to clear override");
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
        throw new Error((res as any).error || "Failed to save bulk prices");
      }
    },
    onSuccess: () => {
      toast.success(`Updated prices for ${selectedCells.length} date(s)`);
      setIsBulkEditing(false);
      setBulkPriceInput("");
      clearSelection();
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save bulk prices");
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
        throw new Error((res as any).error || "Failed to clear overrides");
      }
    },
    onSuccess: () => {
      toast.success(`Cleared overrides for ${selectedCells.length} date(s)`);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: qk.pricingResolved(orgId, hotelId, roomTypes.map(rt => rt.id), startDateStr, endDateStr) });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to clear overrides");
    },
  });

  // ── Functions ──────────────────────────────────────────────────────

  const resetSeasonForm = () => {
    setSeasonName("");
    setSeasonStart(undefined);
    setSeasonEnd(undefined);
  };

  const handleOpenEditSeason = (season: any) => {
    setEditSeasonId(season.id);
    setSeasonName(season.name);
    setSeasonStart(new Date(season.start_date + "T12:00:00"));
    setSeasonEnd(new Date(season.end_date + "T12:00:00"));
  };

  const handleOpenOverrides = (season: any) => {
    setSelectedSeasonForOverrides(season);
    
    // Prefill form
    const overridesMap: Record<string, { basePrice: string; weekendPrice: string }> = {};
    roomTypes.forEach((rt) => {
      const match = season.overrides?.find((o: any) => o.room_type_id === rt.id);
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
    }
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

  const handleCellMouseUp = (roomTypeId: string, date: string, e: React.MouseEvent) => {
    if (!dragStartCell) return;

    const isSingleClick = dragStartCell.roomTypeId === roomTypeId && dragStartCell.date === date;
    if (isSingleClick) {
      // Establish single selection and open popup
      setSelectedCells([{ roomTypeId, date }]);
      const cellData = resolvedRateMap.get(`${roomTypeId}_${date}`);
      setSinglePriceInput(cellData ? String(cellData.price) : "");
      setEditingCell({ roomTypeId, date });
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
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-semibold animate-pulse">Active</Badge>;
    }
    return <Badge variant="outline" className="bg-blue-500/5 text-blue-500 border-blue-500/20 font-medium">Upcoming</Badge>;
  };

  // Inline single save action
  const handleSaveSingleOverride = (roomTypeId: string, date: string) => {
    const price = parseFloat(singlePriceInput);
    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a valid price greater than 0");
      return;
    }
    saveDailyOverrideMutation.mutate({ roomTypeId, date, price });
  };

  // Bulk save action
  const handleSaveBulkOverride = () => {
    const price = parseFloat(bulkPriceInput);
    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a valid price greater than 0");
      return;
    }
    bulkSaveDailyOverridesMutation.mutate({ price });
  };

  // ── Render ─────────────────────────────────────────────────────────

  const isCalendarView = activeTab === "calendar";

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Room Rates & Pricing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manually manage seasonal price policies and set daily overrides for room types.
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
                <Button className="font-semibold shadow-sm hover:shadow transition-all bg-primary hover:bg-primary/95 text-primary-foreground">
                  <Plus className="size-4 mr-1.5" />
                  New Season
                </Button>
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Start Date</label>
                      <Popover open={startPopoverOpen} onOpenChange={setStartPopoverOpen}>
                        <PopoverTrigger render={
                          <Button variant="outline" className="w-full justify-start text-left font-normal border-input/60 hover:bg-accent/40">
                            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                            {seasonStart ? format(seasonStart, "yyyy-MM-dd") : <span className="text-muted-foreground text-sm">Select date</span>}
                          </Button>
                        } />
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={seasonStart}
                            onSelect={(d) => {
                              setSeasonStart(d);
                              setStartPopoverOpen(false);
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">End Date</label>
                      <Popover open={endPopoverOpen} onOpenChange={setEndPopoverOpen}>
                        <PopoverTrigger render={
                          <Button variant="outline" className="w-full justify-start text-left font-normal border-input/60 hover:bg-accent/40">
                            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                            {seasonEnd ? format(seasonEnd, "yyyy-MM-dd") : <span className="text-muted-foreground text-sm">Select date</span>}
                          </Button>
                        } />
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={seasonEnd}
                            onSelect={(d) => {
                              setSeasonEnd(d);
                              setEndPopoverOpen(false);
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Overlaps warning */}
                  {clientOverlapSeason && (
                    <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-sm">
                        <AlertTriangle className="size-4" />
                        <span>Date Overlap Warning</span>
                      </div>
                      <p className="text-xs leading-normal">
                        This range overlaps with the season: <strong>{clientOverlapSeason.name}</strong> ({clientOverlapSeason.start_date} to {clientOverlapSeason.end_date}). Overlapping ranges are blocked at submit.
                      </p>
                    </div>
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
      </div>

      {/* ── Main Tabs ───────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="bg-muted/50 p-1 border border-border/40 grid grid-cols-2 max-w-[400px]">
          <TabsTrigger value="calendar" className="font-semibold text-sm py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
            <CalendarDays className="size-4 mr-2" />
            Rate Calendar
          </TabsTrigger>
          <TabsTrigger value="seasons" className="font-semibold text-sm py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
            <Tag className="size-4 mr-2" />
            Seasonal Rates
          </TabsTrigger>
        </TabsList>

        {/* ── Tab Content: Rate Calendar ────────────────────────────── */}
        <TabsContent value="calendar" className="mt-4 space-y-4">
          
          {/* Controls Bar */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-card p-4 rounded-xl border border-border/50 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="icon" onClick={handlePrev30Days} className="border-input/60 hover:bg-accent/40">
                <ChevronLeft className="size-4" />
              </Button>
              
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
                        const end = addDays(d, 29).toISOString().split("T")[0];
                        setDateRange(start, end);
                        clearSelection();
                        setRangePopoverOpen(false);
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="icon" onClick={handleNext30Days} className="border-input/60 hover:bg-accent/40">
                <ChevronRight className="size-4" />
              </Button>

              <Button variant="outline" onClick={handleDateReset} className="font-medium border-input/60 hover:bg-accent/40 text-xs py-1 h-9">
                Today
              </Button>
            </div>

            {/* Legend & Quick Actions */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground select-none">
              <div className="flex items-center gap-2">
                <span className="inline-block size-3 rounded bg-muted border border-border/80" />
                <span>Base Rate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block size-3 rounded bg-emerald-500/15 border border-emerald-500/20" />
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Seasonal Rate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block size-3 rounded bg-violet-500/20 border border-violet-500/40 relative">
                  <span className="absolute top-0.5 right-0.5 size-1 rounded-full bg-violet-600" />
                </span>
                <span className="text-violet-700 dark:text-violet-400 font-semibold">Daily Override</span>
              </div>
              <div className="flex items-center gap-1.5 pl-2 border-l border-border/60">
                <Keyboard className="size-3.5 text-muted-foreground/60" />
                <span className="text-[10px] text-muted-foreground/60">Arrow keys + Tab to navigate grid</span>
              </div>
            </div>
          </div>

          {/* Bulk Selection Toolbar */}
          {selectedCells.length > 1 && (
            <div className="flex items-center justify-between bg-violet-500/10 border border-violet-500/20 p-3.5 rounded-xl text-foreground text-sm shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2 font-medium text-violet-700 dark:text-violet-300">
                <SlidersHorizontal className="size-4" />
                <span>{selectedCells.length} cells selected</span>
              </div>
              <div className="flex items-center gap-2">
                {isBulkEditing ? (
                  <div className="flex items-center gap-2 bg-background border border-violet-500/30 p-1 rounded-lg">
                    <Input
                      type="number"
                      placeholder={`Price (${currency})`}
                      value={bulkPriceInput}
                      onChange={(e) => setBulkPriceInput(e.target.value)}
                      className="h-8 w-28 border-0 focus-visible:ring-0 text-sm"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleSaveBulkOverride} disabled={bulkSaveDailyOverridesMutation.isPending} className="bg-violet-600 hover:bg-violet-700 text-white font-medium h-7 px-2">
                      {bulkSaveDailyOverridesMutation.isPending ? "..." : <Check className="size-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setIsBulkEditing(false)} className="h-7 w-7 text-muted-foreground hover:bg-accent/40">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setIsBulkEditing(true)} className="bg-violet-600 hover:bg-violet-700 text-white font-medium text-xs">
                    Bulk Override
                  </Button>
                )}

                <Button size="sm" variant="outline" onClick={() => bulkClearDailyOverridesMutation.mutate()} disabled={bulkClearDailyOverridesMutation.isPending} className="border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 text-xs">
                  {bulkClearDailyOverridesMutation.isPending ? "Clearing..." : "Clear Overrides"}
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection} className="text-muted-foreground hover:bg-accent/40 text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          )}

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
                            cell?.source === "seasonal" && "bg-emerald-500/5 border-emerald-500/15 text-emerald-800 dark:text-emerald-400",
                            cell?.source === "daily" && "bg-violet-500/5 border-violet-500/15 text-violet-800 dark:text-violet-400",
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

                          return (
                            <td
                              key={dateStr}
                              id={`cell-${rt.id}-${dateStr}`}
                              tabIndex={0}
                              onKeyDown={(e) => handleKeyDown(e, rt.id, dateStr)}
                              onMouseDown={(e) => handleCellMouseDown(rt.id, dateStr, e)}
                              onMouseEnter={() => handleCellMouseEnter(rt.id, dateStr)}
                              onMouseUp={(e) => handleCellMouseUp(rt.id, dateStr, e)}
                              onClick={(e) => handleCellClick(rt.id, dateStr, e)}
                              className={cn(
                                "relative px-3 py-3.5 text-center align-middle border-r border-border/40 cursor-pointer select-none transition-all focus:outline-none focus:ring-1 focus:ring-primary/80",
                                isWe && "bg-muted-foreground/[0.015] shadow-[inset_0_0_0_999px_rgba(0,0,0,0.01)]",
                                isSelected && "ring-2 ring-primary border-primary z-10 shadow-sm",
                                !isSelected && cell?.source === "seasonal" && "bg-emerald-500/5 text-emerald-800 dark:text-emerald-400",
                                !isSelected && cell?.source === "daily" && "bg-violet-500/5 text-violet-800 dark:text-violet-400 font-medium"
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
                                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-violet-500 dark:bg-violet-400 animate-in zoom-in duration-300" />
                              )}
                              
                              {cell?.source === "seasonal" && (
                                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-in zoom-in duration-300" />
                              )}

                              {/* Single Cell Edit Inline Popover */}
                              {isEditing && (
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Popover open={isEditing} onOpenChange={(open) => !open && setEditingCell(null)}>
                                    <PopoverTrigger render={
                                      <div className="absolute inset-0" />
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
        </TabsContent>

        {/* ── Tab Content: Seasonal Rates ──────────────────────────── */}
        <TabsContent value="seasons" className="mt-4">
          <div className="bg-card rounded-xl border border-border/50 shadow-sm p-4">
            {loadingSeasons ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : seasons.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl">
                <Tag className="size-10 text-muted-foreground/30 mb-3" />
                <span className="font-bold text-lg text-foreground">No pricing seasons configured</span>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Create seasonal rate periods to automatically apply specific base and weekend rates to room types.
                </p>
                <Button onClick={() => setNewSeasonOpen(true)} className="mt-4 bg-primary text-primary-foreground font-semibold">
                  Create First Season
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/80 bg-muted/30">
                      <TableHead className="font-bold text-foreground">Season Name</TableHead>
                      <TableHead className="font-bold text-foreground">Start Date</TableHead>
                      <TableHead className="font-bold text-foreground">End Date</TableHead>
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
                          <TableCell>{getSeasonStatus(season.start_date, season.end_date)}</TableCell>
                          <TableCell className="text-center font-medium">
                            <Badge variant={coveredCount === roomTypes.length ? "default" : "outline"} className={cn(
                              coveredCount === roomTypes.length ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground"
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
                                      This will permanently delete "{season.name}" and revert rates to default.
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
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Per-Season Detail pricing Slide-over Sheet ────────────── */}
      <Sheet open={seasonDetailOpen} onOpenChange={setSeasonDetailOpen}>
        <SheetContent className="sm:max-w-md md:max-w-lg overflow-y-auto native-scroll">
          <SheetHeader className="border-b border-border/40 pb-4">
            <SheetTitle className="text-xl font-bold text-foreground">Configure Season Rates</SheetTitle>
            <SheetDescription>
              Set base and weekend prices for "{selectedSeasonForOverrides?.name}". Unconfigured room types will remain on default pricing.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-6">
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
  );
}
