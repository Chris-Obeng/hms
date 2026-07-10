"use client";

import Link from "next/link";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function OfflinePage() {
  return (
    <div className="native-shell flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/60 mb-6">
        <WifiOff className="size-8 text-muted-foreground" />
      </div>
      <h1 className="text-page-title text-foreground">You&apos;re offline</h1>
      <p className="text-body text-muted-foreground mt-2 max-w-sm">
        HotelOS needs a connection for live bookings and calendar data. Cached pages may still load when you reconnect.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Button
          className="rounded-xl h-11 flex-1 gap-2"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="size-4" />
          Try again
        </Button>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "outline" }), "rounded-xl h-11 flex-1")}
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
