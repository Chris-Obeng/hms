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
  // same time." The shared turn below is the enforcement: whoever claims the
  // prompt turn opens; the other declines and waits for the next interaction.
  // Refs — never state — because both timers can expire in the same task: the
  // loser must see the winner's claim synchronously, not after a re-render.
  const claimedTurn = React.useRef(false);

  const claimPromptTurn = React.useCallback(() => {
    if (claimedTurn.current) return false;
    claimedTurn.current = true;
    return true;
  }, []);

  const releasePromptTurn = React.useCallback(() => {
    claimedTurn.current = false;
  }, []);

  // If the shell unmounts while a modal holds the turn (route change,
  // teardown), hand it back: the survivor re-arms on its next interaction
  // instead of sitting declined forever.
  React.useEffect(() => {
    return () => {
      claimedTurn.current = false;
    };
  }, []);

  return (
    <>
      <SwRegister />
      <OfflineIndicator />
      <PwaInstallPrompt claimTurn={claimPromptTurn} releaseTurn={releasePromptTurn} />
      <PushOptInPrompt claimTurn={claimPromptTurn} releaseTurn={releasePromptTurn} />
      {children}
    </>
  );
}
