"use client";

import * as React from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

const STANDALONE_QUERY = "(display-mode: standalone)";

// ── External stores ────────────────────────────────────────────
//
// Standalone mode, platform and connectivity all live in the browser, not in
// React. Reading them through `useSyncExternalStore` gives the value during
// render — with an explicit server snapshot so hydration still matches — rather
// than mirroring them into state from an effect, which costs an extra render.

function subscribeToStandalone(onStoreChange: () => void) {
  const mql = window.matchMedia(STANDALONE_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

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
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream
  );
}

// Server snapshots: no viewport, no navigator. These match what the browser
// renders on its first pass, so hydration is stable; the real values land on the
// render immediately after.
const serverFalse = () => false;
const serverTrue = () => true;

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);

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

  React.useEffect(() => {
    const onBip = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const promptInstall = React.useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return {
    isStandalone,
    isIos,
    isOnline,
    canInstall: Boolean(deferredPrompt),
    promptInstall,
  };
}
