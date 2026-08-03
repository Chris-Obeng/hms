import { beforeEach, describe, expect, it } from "vitest";
import { useCalendarStore } from "@/lib/store/calendar-store";

const initialState = useCalendarStore.getState();

beforeEach(() => {
  useCalendarStore.setState(initialState, true);
});

describe("calendar store defaults", () => {
  it("starts with no filters and every panel closed", () => {
    const s = useCalendarStore.getState();
    expect(s.viewPreset).toBe("2 Wks");
    expect(s.roomTypeFilters).toEqual([]);
    expect(s.statusFilters).toEqual([]);
    expect(s.sourceFilters).toEqual([]);
    expect(s.searchQuery).toBe("");
    expect(s.selectedBookingId).toBeNull();
    expect([s.showFilters, s.detailPanelOpen, s.newBookingOpen, s.blockRoomOpen]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("setStartDate", () => {
  it("accepts a value", () => {
    const date = new Date("2026-03-02T00:00:00Z");
    useCalendarStore.getState().setStartDate(date);
    expect(useCalendarStore.getState().startDate).toBe(date);
  });

  it("accepts an updater function", () => {
    useCalendarStore.getState().setStartDate(new Date("2026-03-02T00:00:00Z"));
    useCalendarStore.getState().setStartDate((prev) => new Date(prev.getTime() + 86_400_000));
    expect(useCalendarStore.getState().startDate.toISOString()).toBe("2026-03-03T00:00:00.000Z");
  });
});

describe("filter setters", () => {
  it("sets filters from a value or an updater", () => {
    const { setStatusFilters, setSourceFilters, setRoomTypeFilters } = useCalendarStore.getState();

    setStatusFilters(["confirmed"]);
    setStatusFilters((prev) => [...prev, "pending"]);
    setSourceFilters(["direct"]);
    setSourceFilters((prev) => prev.filter((s) => s !== "direct"));
    setRoomTypeFilters([{ id: "rt1", name: "Deluxe", visible: true }]);
    setRoomTypeFilters((prev) => [...prev, { id: "rt2", name: "Standard", visible: true }]);

    const s = useCalendarStore.getState();
    expect(s.statusFilters).toEqual(["confirmed", "pending"]);
    expect(s.sourceFilters).toEqual([]);
    expect(s.roomTypeFilters.map((f) => f.id)).toEqual(["rt1", "rt2"]);
  });
});

describe("toggles", () => {
  it("toggles only the targeted room type's visibility", () => {
    const { setRoomTypeFilters, toggleRoomTypeFilter } = useCalendarStore.getState();
    setRoomTypeFilters([
      { id: "rt1", name: "Deluxe", visible: true },
      { id: "rt2", name: "Standard", visible: true },
    ]);

    toggleRoomTypeFilter("rt1");
    expect(useCalendarStore.getState().roomTypeFilters).toEqual([
      { id: "rt1", name: "Deluxe", visible: false },
      { id: "rt2", name: "Standard", visible: true },
    ]);

    toggleRoomTypeFilter("rt1");
    expect(useCalendarStore.getState().roomTypeFilters[0].visible).toBe(true);
  });

  it("ignores unknown room type ids", () => {
    const { setRoomTypeFilters, toggleRoomTypeFilter } = useCalendarStore.getState();
    setRoomTypeFilters([{ id: "rt1", name: "Deluxe", visible: true }]);
    toggleRoomTypeFilter("missing");
    expect(useCalendarStore.getState().roomTypeFilters[0].visible).toBe(true);
  });

  it("adds and removes status and source filters", () => {
    const { toggleStatusFilter, toggleSourceFilter } = useCalendarStore.getState();

    toggleStatusFilter("confirmed");
    toggleStatusFilter("pending");
    toggleStatusFilter("confirmed");
    toggleSourceFilter("direct");
    toggleSourceFilter("direct");

    const s = useCalendarStore.getState();
    expect(s.statusFilters).toEqual(["pending"]);
    expect(s.sourceFilters).toEqual([]);
  });
});

describe("clearFilters", () => {
  it("resets filters and search while making every room type visible", () => {
    const state = useCalendarStore.getState();
    state.setRoomTypeFilters([
      { id: "rt1", name: "Deluxe", visible: false },
      { id: "rt2", name: "Standard", visible: false },
    ]);
    state.setStatusFilters(["confirmed"]);
    state.setSourceFilters(["direct"]);
    state.setSearchQuery("ama");
    state.setSelectedBookingId("b1");

    state.clearFilters();

    const cleared = useCalendarStore.getState();
    expect(cleared.roomTypeFilters.every((f) => f.visible)).toBe(true);
    expect(cleared.statusFilters).toEqual([]);
    expect(cleared.sourceFilters).toEqual([]);
    expect(cleared.searchQuery).toBe("");
    // Unrelated UI state is untouched
    expect(cleared.selectedBookingId).toBe("b1");
  });
});

describe("panel and overlay state", () => {
  it("stores booking, block and menu UI state", () => {
    const state = useCalendarStore.getState();
    const prefill = { roomId: "r1", roomTypeId: "rt1" };

    state.setViewPreset("1 Mo");
    state.setShowFilters(true);
    state.setDetailPanelOpen(true);
    state.setNewBookingOpen(true);
    state.setNewBookingPrefill(prefill);
    state.setBlockRoomOpen(true);
    state.setBlockPrefillRoomId("r1");
    state.setContextMenu({ x: 1, y: 2, event: { id: "e1" } });
    state.setHoveredEvent({ x: 3, y: 4, event: { id: "e2" } });

    const s = useCalendarStore.getState();
    expect(s.viewPreset).toBe("1 Mo");
    expect(s.showFilters).toBe(true);
    expect(s.detailPanelOpen).toBe(true);
    expect(s.newBookingOpen).toBe(true);
    expect(s.newBookingPrefill).toBe(prefill);
    expect(s.blockRoomOpen).toBe(true);
    expect(s.blockPrefillRoomId).toBe("r1");
    expect(s.contextMenu).toEqual({ x: 1, y: 2, event: { id: "e1" } });
    expect(s.hoveredEvent).toEqual({ x: 3, y: 4, event: { id: "e2" } });

    state.setContextMenu(null);
    state.setHoveredEvent(null);
    state.setNewBookingPrefill(null);
    state.setBlockPrefillRoomId(undefined);
    const reset = useCalendarStore.getState();
    expect(reset.contextMenu).toBeNull();
    expect(reset.hoveredEvent).toBeNull();
    expect(reset.newBookingPrefill).toBeNull();
    expect(reset.blockPrefillRoomId).toBeUndefined();
  });
});
