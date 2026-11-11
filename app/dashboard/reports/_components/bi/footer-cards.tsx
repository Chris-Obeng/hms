"use client";

import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { PenCard } from "@/components/ui/pen/pen-card";
import { moneyAmount } from "./bi-format";

/** Footer strip: the unpaid-balance call to action and the data-freshness note. */
export function BiFooter({ outstanding, outstandingCount, currency, lastCloseAt, generatedAt, timeZone, className }: {
  outstanding: number | null;
  outstandingCount: number | null;
  currency: string;
  lastCloseAt: string | null;
  generatedAt: string;
  timeZone: string;
  className?: string;
}) {
  return <div className={className}>
    <PenCard className="lg:flex lg:flex-row lg:items-center lg:gap-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F5A5241F] text-[var(--warning)]" aria-hidden="true">
        <TriangleAlert size={17} />
      </span>
      <div className="min-w-0 flex-1 pt-1 lg:pt-0">
        <p className="text-xs text-muted-foreground">Unpaid balances across all non-cancelled bookings</p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-xl font-semibold tracking-[-0.3px] text-foreground tabular-nums">
            {outstanding === null ? "Unavailable" : `${currency} ${moneyAmount(outstanding, currency)}`}
          </span>
          {outstandingCount !== null && <span className="text-[13px] text-muted-foreground">across {outstandingCount} open bookings</span>}
        </p>
      </div>
      <Link href="/dashboard/payments/outstanding"
        className="mt-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted lg:mt-0">
        View receivables <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </PenCard>
    <PenCard className="mt-4 flex flex-row items-center gap-2.5 lg:mt-0">
      <span className={`size-2 shrink-0 rounded-full ${lastCloseAt ? "bg-[var(--success)]" : "bg-[var(--warning)]"}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">
          {lastCloseAt ? `Night audit completed · ${formatClock(lastCloseAt, timeZone)}` : "Night audit pending for the current business day"}
        </p>
        <p className="text-[11px] text-muted-foreground">Report data as of {formatClock(generatedAt, timeZone)} · {formatDate(generatedAt, timeZone)}</p>
      </div>
    </PenCard>
  </div>;
}

function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
}

function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone }).format(new Date(iso));
}
