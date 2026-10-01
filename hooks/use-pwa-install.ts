"use client";

import * as React from "react";
import type { BeforeInstallPromptEvent } from "@/components/providers";
import { create } from "zustand";

const STANDALONE_QUERY = "(display-mode: standalone)";

// ── External stores ────────────────────────────────────────────
//
// Standalone mode, platform and connectivity all live in the browser, not in
// React. Reading them through `useSyncExternalStore` gives the value during
// render — with an explicit server snapshot so hydration still matches — rather
// than mirroring them into state from an effect, which costs an extra render.
//
// The deferred install prompt is plain module state below (a zustand store), so
// it needs no snapshot helper here.
//
// The store owns the event, not the hook instances: every consumer subscribes
// to one shared latch, and `window.__roomlineDeferredInstallPrompt` stays the
// cross-evaluation backstop (providers seed it at import time; fresh module
// evaluations seed from it too).

type InstallPromptStore = {
  prompt: BeforeInstallPromptEvent | null;
  set: (prompt: BeforeInstallPromptEvent | null) => void;
};

const useInstallPromptStore = create<InstallPromptStore>()((set) => ({
  prompt: null,
  set: (prompt) => set({ prompt }),
}));

if (typeof window !== "undefined") {
  // Seed from the provider's import-time capture first: the browser can fire
  // `beforeinstallprompt` before any component — even this hook — subscribes,
  // and a fresh listener alone would miss that event for the whole page.
  // Guard the module listener so a double evaluation (StrictMode, HMR) cannot
  // stack duplicate handlers on `window`.
  if (!(window as Window & { __roomlineBipWired?: boolean }).__roomlineBipWired) {
    (window as Window & { __roomlineBipWired?: boolean }).__roomlineBipWired = true;
    const early = window.__roomlineDeferredInstallPrompt ?? null;
    if (early) useInstallPromptStore.getState().set(early);
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      window.__roomlineDeferredInstallPrompt = event;
      useInstallPromptStore.getState().set(event);
    });
    // A successful install consumes the deferred prompt browser-side; without
    // this the slot stays stale and the ask would think it can still install.
    window.addEventListener("appinstalled", () => {
      window.__roomlineDeferredInstallPrompt = null;
      useInstallPromptStore.getState().set(null);
    });
  }
}

function setDeferredInstallPrompt(prompt: BeforeInstallPromptEvent | null) {
  if (typeof window !== "undefined") {
    window.__roomlineDeferredInstallPrompt = prompt;
  }
  useInstallPromptStore.getState().set(prompt);
}

function subscribeToStandalone(onStoreChange: () => void) {
  const mql = window.matchMedia(STANDALONE_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

// Server snapshots: no viewport, no navigator. These match what the browser
// renders on its first pass, so hydration still matches; the real values land on the
// render immediately after.
const serverFalse = () => false;
const serverTrue = () => true;

function getIsStandalone() {
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribeToOnline(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getIsOnline() {
  return navigator.onLine;
}

// The platform cannot change for the lifetime of the document, so there is
// nothing to subscribe to — the no-op subscription exists only so the value is
// read after hydration rather than during it.
function subscribeToNothing() {
  return () => {};
}

function getIsIos() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  if (nav.userAgentData?.platform === "iOS") return true;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream) {
    return true;
  }
  // iPadOS 13+ in desktop Safari reports a Macintosh user agent; touch points
  // distinguish it from a real Mac, which has none.
  return (
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return window.__roomlineDeferredInstallPrompt ?? null;
}

// `usePwaInstall` below reads the slot through the zustand store; this helper
// stays for the click handler, which must read between renders instead of
// trusting a selector captured during one.

export function usePwaInstall() {
  // One shared latched store for the deferred prompt (module-level means all
  // hook instances see the same event and the same teardown, so late mounts
  // cannot miss it). Selectors re-render only this hook's consumers.
  const deferredPrompt = useInstallPromptStore((state) => state.prompt);
  const isStandalone = React.useSyncExternalStore(
    subscribeToStandalone,
    getIsStandalone,
    serverFalse,
  );
  const isIos = React.useSyncExternalStore(subscribeToNothing, getIsIos, serverFalse);
  const isOnline = React.useSyncExternalStore(subscribeToOnline, getIsOnline, serverTrue);

  React.useEffect(() => {
    document.documentElement.classList.toggle("pwa-standalone", isStandalone);
  }, [isStandalone]);

  const promptInstall = React.useCallback(async () => {
    const prompt = getDeferredInstallPrompt();
    if (!prompt) return false;
    // A deferred prompt is single-use. Clear the slot first so a second tap
    // cannot reuse the consumed event; the component's own dismissal check
    // then decides whether to resurface later.
    setDeferredInstallPrompt(null);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome === "accepted";
  }, []);

  return {
    isStandalone,
    isIos,
    isOnline,
    canInstall: Boolean(deferredPrompt),
    promptInstall,
  };
}
