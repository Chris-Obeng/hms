"use client";

import { usePwaInstall } from "@/hooks/use-pwa-install";
import { cn } from "@/lib/utils";

export function OfflineIndicator() {
  const { isOnline } = usePwaInstall();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed left-0 right-0 z-50 flex items-center justify-center",
        "bg-amber-500 text-amber-950 text-xs font-medium py-1.5 px-4",
        "top-[calc(env(safe-area-inset-top)+3rem)]",
        "animate-in fade-in slide-in-from-top-1 duration-200",
      )}
    >
      Offline — changes sync when connection returns
    </div>
  );
}
