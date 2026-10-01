/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useSnapshotPatch } from "@/hooks/use-snapshot-patch";

/**
 * These pin the optimistic-patch lifecycle that used to live in two
 * `useEffect`s inside BookingDetailDrawer (which lint rejected as
 * `react-hooks/set-state-in-effect`). Identity — not deep equality — is the
 * invalidation trigger, matching what a dependency array over the data object
 * did before.
 */
type Snapshot = { status: string; amountPaid: number };
type Patch = Partial<Snapshot>;

const usePatch = (snapshot: Snapshot, live: boolean) =>
  useSnapshotPatch<Snapshot, Patch>(snapshot, live);

function renderPatch(snapshot: Snapshot, live = true) {
  return renderHook(
    ({ snapshot: s, live: l }: { snapshot: Snapshot; live: boolean }) => usePatch(s, l),
    { initialProps: { snapshot, live } }
  );
}

describe("useSnapshotPatch", () => {
  it("applies a patch set over the current snapshot, and survives re-renders", () => {
    const snapshot: Snapshot = { status: "checked_in", amountPaid: 6300 };
    const { result, rerender } = renderPatch(snapshot);

    act(() => result.current[1]({ status: "checked_out" }));
    expect(result.current[0]).toEqual({ status: "checked_out" });

    // Same snapshot object, same liveness: nothing invalidates the patch.
    rerender({ snapshot, live: true });
    expect(result.current[0]).toEqual({ status: "checked_out" });
  });

  it("drops the patch when the data source hands over a new snapshot", () => {
    const first: Snapshot = { status: "checked_in", amountPaid: 6300 };
    const { result, rerender } = renderPatch(first);

    act(() => result.current[1]({ status: "checked_out" }));
    expect(result.current[0]).not.toBeNull();

    // A refetch always produces a fresh object, even with identical values.
    rerender({ snapshot: { ...first }, live: true });
    expect(result.current[0]).toBeNull();
  });

  it("keeps the patch when the data source re-serves the same snapshot object", () => {
    // TanStack Query's structural sharing can return the identical reference;
    // the old `[query.data]` effect behaved the same way.
    const stable: Snapshot = { status: "checked_in", amountPaid: 6300 };
    const { result, rerender } = renderPatch(stable);

    act(() => result.current[1]({ status: "checked_out" }));
    rerender({ snapshot: stable, live: true });

    expect(result.current[0]).toEqual({ status: "checked_out" });
  });

  it("drops the patch when the owning surface closes", () => {
    const snapshot: Snapshot = { status: "checked_in", amountPaid: 6300 };
    const { result, rerender } = renderPatch(snapshot);

    act(() => result.current[1]({ status: "checked_out" }));
    rerender({ snapshot, live: false });

    expect(result.current[0]).toBeNull();
  });

  it("stays dropped when the surface reopens without a refetch", () => {
    const snapshot: Snapshot = { status: "checked_in", amountPaid: 6300 };
    const { result, rerender } = renderPatch(snapshot);

    act(() => result.current[1]({ status: "checked_out" }));
    rerender({ snapshot, live: false });
    rerender({ snapshot, live: true });

    expect(result.current[0]).toBeNull();
  });

  it("accepts a fresh patch after a refresh — the reset is not a latch", () => {
    const first: Snapshot = { status: "checked_in", amountPaid: 6300 };
    const { result, rerender } = renderPatch(first);

    act(() => result.current[1]({ status: "checked_out" }));
    rerender({ snapshot: { ...first }, live: true });
    expect(result.current[0]).toBeNull();

    act(() => result.current[1]({ amountPaid: 10499.98 }));
    expect(result.current[0]).toEqual({ amountPaid: 10499.98 });
  });
});
