"use client";

import type { GuestsData } from "../actions";
import { PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { SectionCard } from "@/components/ui/section-card";
import { SegmentedDonut } from "@/components/ui/segmented-donut";
import { EmptyState, TableShell } from "./shells";
import { reportMoney, reportShare, tenderSegments } from "./report-utils";

export function GuestsTab({ data }: { data: GuestsData }) {
  return <div className="space-y-4">
    <StatStrip label="Guests and collections" columns={4}>
      <Stat label="Collected" value={reportMoney(data.totalCollected, data.currency)} hint="incl. tax and deposits" />
      <Stat label="Guests" value={data.totalGuests.toLocaleString("en")} hint="identified arrivals" />
      <Stat label="New" value={data.newGuests.toLocaleString("en")} hint="first stay here" />
      <Stat label="Repeat" value={data.repeatGuests.toLocaleString("en")} hint="returning stays" />
    </StatStrip>

    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Collections" caption={`By payment method · ${data.currency}`}>
        {/* The ring carries the split; the table adds the one thing it cannot show: how many payments. */}
        {data.byMethod.length === 0
          ? <EmptyState text="No payments in this period." />
          : <div className="px-4 pb-5">
            <SegmentedDonut label="Collections by payment method" heading="Collected" value={reportMoney(data.totalCollected, data.currency)}
              segments={tenderSegments(data.byMethod)} />
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 pt-3 text-caption text-muted-foreground">
              {data.byMethod.map((method) => <li key={method.method}>
                {PAYMENT_METHOD_LABELS[method.method] ?? method.method} · {method.count.toLocaleString("en")} payment{method.count === 1 ? "" : "s"}
              </li>)}
            </ul>
          </div>}
      </SectionCard>

      <SectionCard title="Guest origins" caption="Recorded nationalities for identified arrivals.">
        {data.origins.length === 0 ? <EmptyState text="No guest nationalities recorded for this period." /> : <TableShell head={["Nationality", "Guests", "Share"]} caption="Guest origins by recorded nationality">
          {data.origins.map((origin) => <tr key={origin.nationality} className="transition-colors duration-150 hover:bg-muted/40">
            <th scope="row" className="px-4 py-2.5 text-left font-medium">{origin.nationality}</th>
            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{origin.count.toLocaleString("en")}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{reportShare(origin.count, data.totalGuests)}%</td>
          </tr>)}
        </TableShell>}
      </SectionCard>
    </div>
  </div>;
}
