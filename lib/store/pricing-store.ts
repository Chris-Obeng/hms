import { addDays, format } from "date-fns";
import { create } from "zustand";

interface PricingUIState {
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
    startDateStr: start,
    endDateStr: end,
    rangeInitialized: false,
    setDateRange: (startDateStr, endDateStr) =>
      set({ startDateStr, endDateStr, rangeInitialized: true }),
  };
});
