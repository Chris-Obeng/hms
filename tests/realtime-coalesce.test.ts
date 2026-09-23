import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCoalescer } from "@/lib/realtime/coalesce";

// A `postgres_changes` subscription delivers one message per changed row, so the
// property under test is the one the dashboards depend on: a burst of N events
// costs one refetch, and no refetch survives unmount.
describe("createCoalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("collapses a burst of events into a single run", () => {
    const run = vi.fn();
    const coalescer = createCoalescer(75);

    // Twelve rows rewritten by one bulk rate change, arriving faster than the window.
    for (let i = 0; i < 12; i++) {
      coalescer.schedule(run);
      vi.advanceTimersByTime(10);
    }
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(75);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs again for a later burst", () => {
    const run = vi.fn();
    const coalescer = createCoalescer(75);

    coalescer.schedule(run);
    vi.advanceTimersByTime(75);
    coalescer.schedule(run);
    vi.advanceTimersByTime(75);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps the most recent callback, so a stale closure never runs", () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    const coalescer = createCoalescer(75);

    coalescer.schedule(stale);
    vi.advanceTimersByTime(20);
    coalescer.schedule(fresh);
    vi.advanceTimersByTime(75);

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("cancel() drops a pending run — the effect-cleanup guarantee", () => {
    const run = vi.fn();
    const coalescer = createCoalescer(75);

    coalescer.schedule(run);
    coalescer.cancel();
    coalescer.cancel(); // idempotent
    vi.advanceTimersByTime(500);

    expect(run).not.toHaveBeenCalled();
  });
});
