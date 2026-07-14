import { create } from "zustand";

export interface SelectedCell {
  roomTypeId: string;
  date: string;
}

interface PricingUIState {
  // Navigation tabs
  activeTab: "calendar" | "seasons";
  setActiveTab: (tab: "calendar" | "seasons") => void;

  // Selected cells for bulk/single price editing
  selectedCells: SelectedCell[];
  setSelectedCells: (cells: SelectedCell[] | ((prev: SelectedCell[]) => SelectedCell[])) => void;
  clearSelection: () => void;

  // Click-drag selection helper state
  dragStartCell: SelectedCell | null;
  setDragStartCell: (cell: SelectedCell | null) => void;

  // Inline editing popover targeting
  editingCell: SelectedCell | null;
  setEditingCell: (cell: SelectedCell | null) => void;

  // UI state for modals
  newSeasonOpen: boolean;
  setNewSeasonOpen: (open: boolean) => void;
  editSeasonId: string | null;
  setEditSeasonId: (id: string | null) => void;
  seasonDetailOpen: boolean;
  setSeasonDetailOpen: (open: boolean) => void;
  
  // Date viewport range (starts as 30 days)
  startDateStr: string;
  endDateStr: string;
  setDateRange: (start: string, end: string) => void;
}

export const usePricingStore = create<PricingUIState>((set) => {
  // Initialize with today and 89 days ahead (90-day industry-standard window)
  const today = new Date();
  const start = today.toISOString().split("T")[0];
  const end = new Date(today.setDate(today.getDate() + 89)).toISOString().split("T")[0];

  return {
    activeTab: "calendar",
    setActiveTab: (activeTab) => set({ activeTab }),

    selectedCells: [],
    setSelectedCells: (cells) =>
      set((state) => ({
        selectedCells: typeof cells === "function" ? cells(state.selectedCells) : cells,
      })),
    clearSelection: () => set({ selectedCells: [], dragStartCell: null }),

    dragStartCell: null,
    setDragStartCell: (dragStartCell) => set({ dragStartCell }),

    editingCell: null,
    setEditingCell: (editingCell) => set({ editingCell }),

    newSeasonOpen: false,
    setNewSeasonOpen: (newSeasonOpen) => set({ newSeasonOpen }),
    editSeasonId: null,
    setEditSeasonId: (editSeasonId) => set({ editSeasonId }),
    seasonDetailOpen: false,
    setSeasonDetailOpen: (seasonDetailOpen) => set({ seasonDetailOpen }),

    startDateStr: start,
    endDateStr: end,
    setDateRange: (startDateStr, endDateStr) => set({ startDateStr, endDateStr }),
  };
});
