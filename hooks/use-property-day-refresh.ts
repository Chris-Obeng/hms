"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { businessDayBounds, businessToday } from "@/lib/business-date";

/**
 * Pages that work out "today" on the server (Rooms, Rates) go stale when the
 * property's date moves on while the tab stays open. This re-renders the server
 * page at the next property midnight, and when a hidden tab comes back after
 * the date has changed.
 */
export function usePropertyDayRefresh(today: string | undefined, timeZone: string) {
  const router = useRouter();

  useEffect(() => {
    if (!today) return;
    const refreshIfNewDay = () => {
      if (businessToday(timeZone) !== today) router.refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfNewDay();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // A second past the property's midnight, so the server sees the new date.
    // If this device's clock runs a little slow, check again a minute later.
    let timer = 0;
    const atMidnight = () => {
      if (businessToday(timeZone) !== today) router.refresh();
      else timer = window.setTimeout(atMidnight, 60_000);
    };
    const untilMidnight = Date.parse(businessDayBounds(today, timeZone).endISO) - Date.now();
    timer = window.setTimeout(atMidnight, Math.max(0, untilMidnight) + 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
    };
  }, [today, timeZone, router]);
}
