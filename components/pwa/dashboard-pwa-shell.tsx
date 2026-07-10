"use client";

import { type ReactNode } from "react";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";

export function DashboardPwaShell({ children }: { children: ReactNode }) {
  return (
    <>
      <OfflineIndicator />
      <PwaInstallPrompt />
      {children}
    </>
  );
}
