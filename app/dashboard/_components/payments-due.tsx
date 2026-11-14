"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@heroui/react";
import { formatCurrencyCompact } from "@/lib/format-currency";
import { isInHouseOnDate } from "@/lib/calendar-domain";
import { GuestAvatar } from "./guest-avatar";
import type { ActivityBooking } from "./activity-list";

/**
 * Who still owes money on this date: arrivals and guests in house with an
 * unpaid or part-paid bill. The front desk's second question after "who is
 * coming", answered without opening a report.
 */
export function PaymentsDue({
  bookings,
  dateStr,
  currency,
  onCollect,
}: {
  bookings: ActivityBooking[];
  dateStr: string;
  currency: string;
  onCollect: (booking: ActivityBooking) => void;
}) {
  const owing = bookings
    .filter((b) => {
      if (b.paymentStatus === "paid" || b.paymentStatus === "refunded") return false;
      if (b.status !== "confirmed" && b.status !== "checked_in") return false;
      const arriving = b.checkIn === dateStr;
      const inHouse = isInHouseOnDate(
        { id: b.id, roomId: null, checkIn: b.checkIn, checkOut: b.checkOut, status: b.status },
        dateStr,
      );
      return arriving || inHouse;
    })
    .sort((a, b) => (b.balanceDue ?? b.totalAmount) - (a.balanceDue ?? a.totalAmount));

  const total = owing.reduce((sum, b) => sum + (b.balanceDue ?? b.totalAmount), 0);
  const shown = owing.slice(0, 4);

  return (
    <section
      aria-labelledby="payments-due-title"
      className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(20_20_19/0.04)] sm:p-6"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="payments-due-title" className="text-md font-semibold tracking-tight text-foreground">
          Still to collect
        </h2>
        {owing.length > 0 && (
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrencyCompact(total, currency)}
          </span>
        )}
      </header>

      {owing.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Every guest on this date is paid up.
        </div>
      ) : (
        <ul role="list" className="mt-3 divide-y divide-border">
          {shown.map((b) => (
            <li key={b.id} className="flex items-center gap-3 py-3">
              <GuestAvatar name={b.guestName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{b.guestName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {b.roomNumber ? `Room ${b.roomNumber}` : "Unassigned"} ·{" "}
                  <span className="tabular-nums">{formatCurrencyCompact(b.balanceDue ?? b.totalAmount, currency)}</span>{" "}
                  {b.paymentStatus === "partial" ? "left" : "due"}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => onCollect(b)}
                className="shrink-0 rounded-full px-3 font-semibold max-md:h-10"
              >
                Collect
              </Button>
            </li>
          ))}
        </ul>
      )}

      {owing.length > shown.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          And {owing.length - shown.length} more in the lists on this page.
        </p>
      )}
    </section>
  );
}
