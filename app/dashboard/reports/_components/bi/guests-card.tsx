"use client";

import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";
import { share } from "./bi-format";
import type { GuestsData } from "../../actions";

/** New vs repeat arrivals bar plus the top guest origins. */
export function GuestsCard({ data, className }: { data: GuestsData; className?: string }) {
  const total = data.newGuests + data.repeatGuests;
  const origins = data.origins.slice(0, 5);
  const maxOrigin = origins[0]?.count ?? 1;

  return <PenCard className={className}>
    <PenCardHead title="Guests" caption={`${data.totalGuests.toLocaleString("en")} identified arrivals · recorded nationality`} />
    {total > 0 ? <>
      <div className="flex h-3 gap-1 overflow-hidden rounded-md" role="img"
        aria-label={`New guests ${share(data.newGuests, total)}, repeat guests ${share(data.repeatGuests, total)}.`}>
        <span className="h-full bg-[var(--pen-accent)]" style={{ width: `${(data.newGuests / total) * 100}%` }} />
        <span className="h-full bg-violet-500" style={{ width: `${(data.repeatGuests / total) * 100}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-foreground">
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--pen-accent)]" aria-hidden="true" />New {data.newGuests.toLocaleString("en")} · {share(data.newGuests, total)}</span>
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-violet-500" aria-hidden="true" />Repeat {data.repeatGuests.toLocaleString("en")} · {share(data.repeatGuests, total)}</span>
      </div>
    </> : <p className="text-[13px] text-muted-foreground">No identified arrivals in this period.</p>}
    <div className="border-t border-border/50 pt-3">
      <p className="text-xs font-medium text-muted-foreground">Guest origins</p>
      <ul className="mt-2 space-y-[8px]">
        {origins.map((origin) => <li key={origin.nationality} className="flex items-center gap-3">
          <span className="w-27 shrink-0 truncate text-xs text-foreground">{origin.nationality}</span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <span className="block h-full rounded-full bg-[var(--pen-accent)]" style={{ width: `${(origin.count / maxOrigin) * 100}%` }} />
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">{origin.count.toLocaleString("en")}</span>
          <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{share(origin.count, data.totalGuests)}</span>
        </li>)}
        {origins.length === 0 && <li className="text-xs text-muted-foreground">No recorded nationalities.</li>}
      </ul>
    </div>
  </PenCard>;
}
