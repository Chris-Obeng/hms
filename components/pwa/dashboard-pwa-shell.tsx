"use client";

import * as React from "react";
import { type ReactNode } from "react";
import { SwRegister } from "@/components/pwa/sw-register";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { PushOptInPrompt } from "@/components/pwa/push-opt-in-prompt";

export function DashboardPwaShell({ children }: { children: ReactNode }) {
  // HIG › Modality › Best practices: "Let people dismiss a modal view before
  // presenting another one… you never want to display more than one alert at the
  // same time." The install ask goes first; the notification ask waits until it
  // has been closed, then waits for the next interaction of its own.
  const [installPromptOpen, setInstallPromptOpen] = React.useState(false);

  return (
    <>
      <SwRegister />
      <OfflineIndicator />
      <PwaInstallPrompt onOpenChange={setInstallPromptOpen} />
      <PushOptInPrompt paused={installPromptOpen} />
      {children}
    </>
  );
}
