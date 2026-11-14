"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";
import { DateNavigator } from "./date-card";

const noopSubscribe = () => () => {};

/** "Good morning" by the property's clock, not the device's. */
function partOfDay(timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()),
  );
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Page header for the front desk: a greeting by name (the people at the desk
 * are the audience), the property and date underneath, and the date control.
 * The greeting renders on the client only, so the server never guesses a time.
 */
export function TodayHeader({
  hotelName,
  hotelTimezone,
  selectedDate,
  todayDateStr,
  onDateChange,
}: {
  hotelName: string;
  hotelTimezone: string;
  selectedDate: Date;
  todayDateStr: string;
  onDateChange: (date: Date) => void;
}) {
  const { user } = useUser();
  const greeting = React.useSyncExternalStore(
    noopSubscribe,
    () => partOfDay(hotelTimezone),
    () => "Welcome back",
  );
  const firstName = user?.firstName?.trim();

  const dateLine = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(selectedDate);

  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-muted-foreground">
          <span className="text-[var(--sun-deep)]">{dateLine}</span>
          <span aria-hidden="true"> · </span>
          {hotelName}
        </p>
        <h1 className="mt-1 text-[28px] font-extrabold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[32px]">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
      </div>
      <DateNavigator
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        todayDateStr={todayDateStr}
        className="w-full md:w-auto"
      />
    </header>
  );
}
