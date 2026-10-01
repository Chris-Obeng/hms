"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";

/**
 * The browser fires `beforeinstallprompt` during page load/navigation and does
 * not retain it — a listener attached from a React effect (after hydration)
 * starts too late and the event is missed for the whole page lifetime. This
 * import-time capture in the root provider runs with the first client module
 * evaluation, stores the deferred prompt on `window`, and keeps working across
 * route changes and remounts because `window` survives them.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }

  interface Window {
    __roomlineDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

if (typeof window !== "undefined" && window.__roomlineDeferredInstallPrompt === undefined) {
  window.__roomlineDeferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    // No zustand here (providers load before any store): keep the raw event so
    // the install hook can seed from it, and prevent the browser's automatic
    // mini-infobar so only our modal asks.
    event.preventDefault();
    window.__roomlineDeferredInstallPrompt = event;
  });
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute default stale time
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Keep exactly one client for this mounted provider. Creating it during render
  // can leave an SSR/hydration pass with a different context instance.
  const [queryClient] = React.useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
