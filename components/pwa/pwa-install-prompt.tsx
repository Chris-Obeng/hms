"use client";

import * as React from "react";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePwaInstall } from "@/hooks/use-pwa-install";

const DISMISS_KEY = "hotelos_pwa_install_dismissed";
const DISMISS_DAYS = 14;

function wasDismissedRecently(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function PwaInstallPrompt() {
  const { isStandalone, isIos, canInstall, promptInstall } = usePwaInstall();
  const [visible, setVisible] = React.useState(false);
  const [iosOpen, setIosOpen] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);

  React.useEffect(() => {
    if (isStandalone || wasDismissedRecently()) return;
    const timer = window.setTimeout(() => {
      if (canInstall || isIos) setVisible(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [canInstall, isIos, isStandalone]);

  const dismiss = React.useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setIosOpen(false);
  }, []);

  const handleInstall = React.useCallback(async () => {
    if (isIos) {
      setIosOpen(true);
      return;
    }
    setInstalling(true);
    const accepted = await promptInstall();
    setInstalling(false);
    if (accepted) {
      setVisible(false);
    }
  }, [isIos, promptInstall]);

  if (isStandalone) return null;

  return (
    <>
      {visible && (
      <div
        role="status"
        className={cn(
          "mb-4 flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm",
          "sm:flex-row sm:items-center sm:justify-between",
          "animate-in fade-in slide-in-from-top-2 duration-300",
        )}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
            <Smartphone className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Install HotelOS</p>
            <p className="text-caption text-muted-foreground mt-0.5">
              Add to home screen for faster check-ins, offline shell, and native feel on tablet or phone.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 sm:ml-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-xl text-muted-foreground"
            onClick={dismiss}
          >
            Not now
          </Button>
          <Button
            size="sm"
            className="h-9 rounded-xl gap-1.5"
            onClick={handleInstall}
            disabled={installing}
          >
            <Download className="size-3.5" />
            {installing ? "Installing…" : "Install"}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 rounded-xl sm:hidden"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      )}

      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <IosInstallDialog onDismiss={dismiss} />
      </Dialog>
    </>
  );
}

function IosInstallDialog({ onDismiss }: { onDismiss: () => void }) {
  return (
    <DialogContent className="sm:max-w-md rounded-2xl">
      <DialogHeader>
        <DialogTitle>Add HotelOS to Home Screen</DialogTitle>
        <DialogDescription>
          Install works like a native app — full screen, fast launch, no browser chrome.
        </DialogDescription>
      </DialogHeader>
      <ol className="space-y-3 text-sm text-foreground">
        <li className="flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">1</span>
          <span className="pt-0.5">
            Tap <Share className="inline size-4 mx-0.5 -mt-0.5" /> Share in Safari&apos;s toolbar
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">2</span>
          <span className="pt-0.5">
            Scroll and tap <Plus className="inline size-4 mx-0.5 -mt-0.5" /> Add to Home Screen
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">3</span>
          <span className="pt-0.5">Tap Add — HotelOS opens standalone from your home screen</span>
        </li>
      </ol>
      <Button className="w-full rounded-xl" onClick={onDismiss}>
        Got it
      </Button>
    </DialogContent>
  );
}
