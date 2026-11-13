import { beforeEach, describe, expect, it } from "vitest";
import { usePricingStore } from "@/lib/store/pricing-store";

const initialState = usePricingStore.getState();

beforeEach(() => {
  usePricingStore.setState(initialState, true);
});

describe("pricing store defaults", () => {
  it("opens on the calendar tab with no dialogs open", () => {
    const s = usePricingStore.getState();
    expect(s.activeTab).toBe("calendar");
    expect(s.newSeasonOpen).toBe(false);
    expect(s.editSeasonId).toBeNull();
    expect(s.seasonDetailOpen).toBe(false);
  });

  it("defaults to a two-week viewport of YYYY-MM-DD dates", () => {
    const { startDateStr, endDateStr } = usePricingStore.getState();
    expect(startDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const days = Math.round(
      (Date.parse(endDateStr) - Date.parse(startDateStr)) / 86_400_000
    );
    expect(days).toBe(13);
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
