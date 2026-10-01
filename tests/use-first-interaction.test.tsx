/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useFirstInteraction } from "@/hooks/use-first-interaction";

/**
 * The gate that keeps the install and notification asks from interrupting app
 * launch (HIG › Alerts › Best practices) and from firing while the user is idle.
 */
describe("useFirstInteraction", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for a real interaction and lets it settle before firing", () => {
    const onReady = vi.fn();
    renderHook(() => useFirstInteraction(true, onReady, 600));

    expect(onReady).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(onReady).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("fires once even when more interactions arrive", () => {
    const onReady = vi.fn();
    renderHook(() => useFirstInteraction(true, onReady, 600));

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
      window.dispatchEvent(new Event("keydown"));
      window.dispatchEvent(new Event("scroll"));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("stays silent while disabled", () => {
    const onReady = vi.fn();
    renderHook(() => useFirstInteraction(false, onReady, 600));

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(onReady).not.toHaveBeenCalled();
  });

  it("re-arms when the callback declines the turn", () => {
    const onReady = vi.fn((): false => false);
    renderHook(() => useFirstInteraction(true, onReady, 600));

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onReady).toHaveBeenCalledTimes(1);

    // The turn was declined, not consumed: the next interaction fires again.
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onReady).toHaveBeenCalledTimes(2);
  });

  it("drops a pending open when the surface unmounts first", () => {
    const onReady = vi.fn();
    const { unmount } = renderHook(() => useFirstInteraction(true, onReady, 600));

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(onReady).not.toHaveBeenCalled();
  });

  it("uses the latest callback without re-arming the listener", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useFirstInteraction(true, cb, 600),
      { initialProps: { cb: first } }
    );

    rerender({ cb: second });
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
