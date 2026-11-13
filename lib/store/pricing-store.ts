import { addDays, format } from "date-fns";
import { create } from "zustand";

interface PricingUIState {
  // Date viewport range (starts as 14 days)
  startDateStr: string;
  endDateStr: string;
  rangeInitialized: boolean;
  /** The property date the window was anchored to; a new day re-anchors it. */
  anchoredToday: string | null;
  setDateRange: (start: string, end: string) => void;
  /** Starts the window on `today`, `days` nights long, and remembers that date. */
  anchorToToday: (today: string, days: number) => void;
}

export const usePricingStore = create<PricingUIState>((set) => {
  // Start with a two-week window that fits on one screen. 30 days is one tap away.
  const now = new Date();
  const start = format(now, "yyyy-MM-dd");
  const end = format(addDays(now, 13), "yyyy-MM-dd");

  return {
    startDateStr: start,
    endDateStr: end,
    rangeInitialized: false,
    anchoredToday: null,
    setDateRange: (startDateStr, endDateStr) =>
      set({ startDateStr, endDateStr, rangeInitialized: true }),
    anchorToToday: (today, days) => {
      // Noon keeps the calendar arithmetic clear of DST edges.
      const base = new Date(`${today}T12:00:00`);
      set({
        startDateStr: today,
        endDateStr: format(addDays(base, Math.max(1, days) - 1), "yyyy-MM-dd"),
        rangeInitialized: true,
        anchoredToday: today,
      });
    },
  };
});
