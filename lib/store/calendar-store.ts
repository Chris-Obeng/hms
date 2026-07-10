import { create } from "zustand";

export interface RoomTypeFilter {
  id: string;
  name: string;
  visible: boolean;
}

interface CalendarUIState {
  startDate: Date;
  viewPreset: string;
  roomTypeFilters: RoomTypeFilter[];
  statusFilters: string[];
  sourceFilters: string[];
  showFilters: boolean;
  searchQuery: string;
  selectedBookingId: string | null;
  detailPanelOpen: boolean;
  newBookingOpen: boolean;
  newBookingPrefill: {
    roomId?: string;
    roomTypeId?: string;
    checkIn?: Date;
    checkOut?: Date;
  } | null;
  blockRoomOpen: boolean;
  blockPrefillRoomId: string | undefined;
  contextMenu: {
    x: number;
    y: number;
    event: any;
  } | null;
  hoveredEvent: {
    x: number;
    y: number;
    event: any;
  } | null;

  // Actions
  setStartDate: (date: Date | ((prev: Date) => Date)) => void;
  setViewPreset: (preset: string) => void;
  setRoomTypeFilters: (filters: RoomTypeFilter[] | ((prev: RoomTypeFilter[]) => RoomTypeFilter[])) => void;
  setStatusFilters: (filters: string[] | ((prev: string[]) => string[])) => void;
  setSourceFilters: (filters: string[] | ((prev: string[]) => string[])) => void;
  setShowFilters: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSelectedBookingId: (id: string | null) => void;
  setDetailPanelOpen: (open: boolean) => void;
  setNewBookingOpen: (open: boolean) => void;
  setNewBookingPrefill: (prefill: any) => void;
  setBlockRoomOpen: (open: boolean) => void;
  setBlockPrefillRoomId: (id: string | undefined) => void;
  setContextMenu: (menu: any) => void;
  setHoveredEvent: (event: any) => void;
  clearFilters: () => void;
  toggleRoomTypeFilter: (typeId: string) => void;
  toggleStatusFilter: (status: string) => void;
  toggleSourceFilter: (source: string) => void;
}

export const useCalendarStore = create<CalendarUIState>((set) => ({
  startDate: new Date(),
  viewPreset: "2 Wks",
  roomTypeFilters: [],
  statusFilters: [],
  sourceFilters: [],
  showFilters: false,
  searchQuery: "",
  selectedBookingId: null,
  detailPanelOpen: false,
  newBookingOpen: false,
  newBookingPrefill: null,
  blockRoomOpen: false,
  blockPrefillRoomId: undefined,
  contextMenu: null,
  hoveredEvent: null,

  setStartDate: (date) => set((state) => ({ startDate: typeof date === "function" ? date(state.startDate) : date })),
  setViewPreset: (viewPreset) => set({ viewPreset }),
  setRoomTypeFilters: (filters) => set((state) => ({ roomTypeFilters: typeof filters === "function" ? filters(state.roomTypeFilters) : filters })),
  setStatusFilters: (filters) => set((state) => ({ statusFilters: typeof filters === "function" ? filters(state.statusFilters) : filters })),
  setSourceFilters: (filters) => set((state) => ({ sourceFilters: typeof filters === "function" ? filters(state.sourceFilters) : filters })),
  setShowFilters: (showFilters) => set({ showFilters }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedBookingId: (selectedBookingId) => set({ selectedBookingId }),
  setDetailPanelOpen: (detailPanelOpen) => set({ detailPanelOpen }),
  setNewBookingOpen: (newBookingOpen) => set({ newBookingOpen }),
  setNewBookingPrefill: (newBookingPrefill) => set({ newBookingPrefill }),
  setBlockRoomOpen: (blockRoomOpen) => set({ blockRoomOpen }),
  setBlockPrefillRoomId: (blockPrefillRoomId) => set({ blockPrefillRoomId }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  setHoveredEvent: (hoveredEvent) => set({ hoveredEvent }),
  clearFilters: () => set((state) => ({
    roomTypeFilters: state.roomTypeFilters.map((f) => ({ ...f, visible: true })),
    statusFilters: [],
    sourceFilters: [],
    searchQuery: "",
  })),
  toggleRoomTypeFilter: (typeId) => set((state) => ({
    roomTypeFilters: state.roomTypeFilters.map((f) => f.id === typeId ? { ...f, visible: !f.visible } : f)
  })),
  toggleStatusFilter: (status) => set((state) => ({
    statusFilters: state.statusFilters.includes(status)
      ? state.statusFilters.filter((s) => s !== status)
      : [...state.statusFilters, status]
  })),
  toggleSourceFilter: (source) => set((state) => ({
    sourceFilters: state.sourceFilters.includes(source)
      ? state.sourceFilters.filter((s) => s !== source)
      : [...state.sourceFilters, source]
  })),
}));
