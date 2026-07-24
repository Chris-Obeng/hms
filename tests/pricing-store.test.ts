import { beforeEach, describe, expect, it } from "vitest";
import { usePricingStore } from "@/lib/store/pricing-store";

const initialState = usePricingStore.getState();

beforeEach(() => {
  usePricingStore.setState(initialState, true);
});

describe("pricing store defaults", () => {
  it("opens on the calendar tab with an empty selection", () => {
    const s = usePricingStore.getState();
    expect(s.activeTab).toBe("calendar");
    expect(s.selectedCells).toEqual([]);
    expect(s.dragStartCell).toBeNull();
    expect(s.editingCell).toBeNull();
    expect(s.newSeasonOpen).toBe(false);
    expect(s.editSeasonId).toBeNull();
    expect(s.seasonDetailOpen).toBe(false);
  });

  it("defaults to a 90-day viewport of YYYY-MM-DD dates", () => {
    const { startDateStr, endDateStr } = usePricingStore.getState();
    expect(startDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const days = Math.round(
      (Date.parse(endDateStr) - Date.parse(startDateStr)) / 86_400_000
    );
    expect(days).toBe(89);
  });
});

describe("selection", () => {
  it("sets cells from a value or an updater", () => {
    const { setSelectedCells } = usePricingStore.getState();
    setSelectedCells([{ roomTypeId: "rt1", date: "2026-03-02" }]);
    setSelectedCells((prev) => [...prev, { roomTypeId: "rt1", date: "2026-03-03" }]);
    expect(usePricingStore.getState().selectedCells).toEqual([
      { roomTypeId: "rt1", date: "2026-03-02" },
      { roomTypeId: "rt1", date: "2026-03-03" },
    ]);
  });

  it("clearSelection empties the selection and the drag anchor", () => {
    const state = usePricingStore.getState();
    state.setSelectedCells([{ roomTypeId: "rt1", date: "2026-03-02" }]);
    state.setDragStartCell({ roomTypeId: "rt1", date: "2026-03-02" });
    state.setEditingCell({ roomTypeId: "rt1", date: "2026-03-02" });

    state.clearSelection();

    const s = usePricingStore.getState();
    expect(s.selectedCells).toEqual([]);
    expect(s.dragStartCell).toBeNull();
    // The inline editor target is intentionally left alone
    expect(s.editingCell).toEqual({ roomTypeId: "rt1", date: "2026-03-02" });
  });
});

describe("tabs, modals and viewport", () => {
  it("stores tab, modal and date-range state", () => {
    const state = usePricingStore.getState();
    state.setActiveTab("seasons");
    state.setNewSeasonOpen(true);
    state.setEditSeasonId("s1");
    state.setSeasonDetailOpen(true);
    state.setDateRange("2026-04-01", "2026-04-30");

    const s = usePricingStore.getState();
    expect(s.activeTab).toBe("seasons");
    expect(s.newSeasonOpen).toBe(true);
    expect(s.editSeasonId).toBe("s1");
    expect(s.seasonDetailOpen).toBe(true);
    expect(s.startDateStr).toBe("2026-04-01");
    expect(s.endDateStr).toBe("2026-04-30");
  });
});
