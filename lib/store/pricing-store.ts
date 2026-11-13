import { addDays, format } from "date-fns";
import { create } from "zustand";

interface PricingUIState {
  // Navigation tabs
  activeTab: "calendar" | "seasons";
  setActiveTab: (tab: "calendar" | "seasons") => void;

  // UI state for modals
  newSeasonOpen: boolean;
  setNewSeasonOpen: (open: boolean) => void;
  editSeasonId: string | null;
  setEditSeasonId: (id: string | null) => void;
  seasonDetailOpen: boolean;
  setSeasonDetailOpen: (open: boolean) => void;
  
  // Date viewport range (starts as 14 days)
  startDateStr: string;
  endDateStr: string;
  rangeInitialized: boolean;
  setDateRange: (start: string, end: string) => void;
}

export const usePricingStore = create<PricingUIState>((set) => {
  // Start with a two-week window that fits on one screen. 30 days is one tap away.
  const now = new Date();
  const start = format(now, "yyyy-MM-dd");
  const end = format(addDays(now, 13), "yyyy-MM-dd");

  return {
    activeTab: "calendar",
    setActiveTab: (activeTab) => set({ activeTab }),

    newSeasonOpen: false,
    setNewSeasonOpen: (newSeasonOpen) => set({ newSeasonOpen }),
    editSeasonId: null,
    setEditSeasonId: (editSeasonId) => set({ editSeasonId }),
    seasonDetailOpen: false,
    setSeasonDetailOpen: (seasonDetailOpen) => set({ seasonDetailOpen }),

    startDateStr: start,
    endDateStr: end,
    rangeInitialized: false,
    setDateRange: (startDateStr, endDateStr) =>
      set({ startDateStr, endDateStr, rangeInitialized: true }),
  };
});
