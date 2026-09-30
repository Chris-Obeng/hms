// lib/cache/prefetch-helpers.ts
// Tiered prefetch strategy doc + caps. Used by client tables + server warm.
// Tier 1: SSR warm (server, void prefetch + HydrationBoundary) — first paint instant, cap 12
// Tier 2: idle (client, requestIdleCallback 800ms fallback) — first page visible, cap 12
// Tier 3: viewport (client, IntersectionObserver 400px) — ahead of scroll, cap 8
// Tier 4: hover (client, onHoverStart) — micro-layer fallback
//
// RLS: server warm uses same createClient + Clerk orgId scoping as page data.
// Client layers use server actions (hotel_id-scoped via requireAuth) so no anon leak.
// No "use client" directive — CAPS is imported in Server Components; onIdle/isFresh are client-only at runtime.

import type { QueryClient } from "@tanstack/react-query";

export const CAPS = {
  serverWarm: 12,
  clientIdle: 12,
  viewportAhead: 8,
} as const;

// Idle callback with timeout fallback — schedule without blocking paint
export function onIdle(cb: () => void, timeoutMs = 800): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: timeoutMs });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, timeoutMs);
  return () => window.clearTimeout(id);
}

export function isFresh(queryClient: QueryClient, queryKey: readonly unknown[]): boolean {
  const state = queryClient.getQueryState(queryKey);
  if (!state || state.status !== "success") return false;
  // TanStack marks fresh via staleTime — if dataUpdatedAt within staleTime, skip
  const age = Date.now() - (state.dataUpdatedAt ?? 0);
  return age < 30_000;
}
