"use client";

import * as React from "react";
import { toast } from "@heroui/react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enableWebPush } from "@/lib/push";

const DISMISS_KEY = "RoomLine_push_prompt_dismissed_at";
const COOLDOWN_DAYS = 7;

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - new Date(raw).getTime() < COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

/**
 * One-time, low-friction opt-in for background push. Staff never discover the
 * settings toggle on their own, and without a subscription no push can ever
 * arrive — so surface a dismissible prompt early instead.
 */
export function PushOptInBanner() {
  const [visible, setVisible] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (!supported || Notification.permission !== "default") return;
    const timer = window.setTimeout(() => {
      if (!recentlyDismissed()) setVisible(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {
      // Storage unavailable — banner simply reappears next visit.
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      await enableWebPush();
      toast.success("Push notifications enabled");
      setVisible(false);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Could not enable push");
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <BellRing className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">Enable push alerts</p>
        <p className="text-xs text-muted-foreground leading-snug">
          Get booking and payment alerts even when this tab is closed.
        </p>
      </div>
      <Button size="sm" onClick={enable} disabled={busy}>
        {busy ? "Enabling..." : "Enable"}
      </Button>
      <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={dismiss} className="size-7 shrink-0">
        <X className="size-4" />
      </Button>
    </div>
  );
}
