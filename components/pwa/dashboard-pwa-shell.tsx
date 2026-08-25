"use client";

import { type ReactNode } from "react";
import { SwRegister } from "@/components/pwa/sw-register";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { PushOptInBanner } from "@/components/pwa/push-opt-in-banner";

export function DashboardPwaShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SwRegister />
      <OfflineIndicator />
      <PwaInstallPrompt />
      <PushOptInBanner />
      {children}
    </>
  );
}
