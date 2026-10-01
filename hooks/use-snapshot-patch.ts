import * as React from "react";

/**
 * State that describes one server snapshot and dies with it.
 *
 * An optimistic patch is only meaningful for the exact snapshot it was applied
 * over: once the data source hands over a new one, or the surface it belongs to
 * is gone, the patch is stale and must not be shown. Clearing it from an effect
 * costs a cascading second render (react-hooks/set-state-in-effect), so the
 * reset happens during render — React's documented "adjust state when a prop
 * changes" pattern, already used by booking-notes-panel.tsx.
 *
 * Identity is the trigger, never deep equality: a data source that keeps
 * serving the same object (TanStack Query's structural sharing) keeps the
 * patch alive, exactly as a dependency-array effect would.
 *
 * @param snapshot identity-compared server value (e.g. TanStack's `data`)
 * @param live     false once the owning surface is closed
 */
export function useSnapshotPatch<TSnapshot, TPatch>(
  snapshot: TSnapshot,
  live: boolean
): [TPatch | null, React.Dispatch<React.SetStateAction<TPatch | null>>] {
  const [patch, setPatch] = React.useState<TPatch | null>(null);
  const [syncedSnapshot, setSyncedSnapshot] = React.useState<TSnapshot>(snapshot);

  if (syncedSnapshot !== snapshot) {
    setSyncedSnapshot(snapshot);
    if (patch !== null) setPatch(null);
  }
  if (!live && patch !== null) setPatch(null);

  return [patch, setPatch];
}
