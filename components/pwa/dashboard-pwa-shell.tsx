"use client";

import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";

export function DashboardPwaShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineIndicator />
      <PwaInstallPrompt />
      {children}
    </>
  );
}
