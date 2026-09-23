import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// Created on first client read — `window` does not exist while rendering on the
// server, so the list cannot be built at module scope.
let mediaQueryList: MediaQueryList | null = null

function getMediaQueryList(): MediaQueryList {
  if (!mediaQueryList) mediaQueryList = window.matchMedia(MOBILE_QUERY)
  return mediaQueryList
}

function subscribe(onStoreChange: () => void) {
  const list = getMediaQueryList()
  list.addEventListener("change", onStoreChange)
  return () => list.removeEventListener("change", onStoreChange)
}

function getSnapshot() {
  return getMediaQueryList().matches
}

// The server has no viewport. `false` keeps the server-rendered markup identical
// to the first client render so hydration matches; React re-renders with the
// real match immediately afterwards.
function getServerSnapshot() {
  return false
}

/**
 * `true` while the viewport is narrower than {@link MOBILE_BREAKPOINT}.
 *
 * Reads the media query through `useSyncExternalStore` instead of mirroring it
 * into state from an effect, so the value is available during render and mount
 * costs no extra commit-and-repaint.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
