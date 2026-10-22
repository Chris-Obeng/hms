"use client";

import type { GuestsData } from "../actions";
import { PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
import { MetricTile } from "./metric-tile";
import { EmptyState, SectionCard, TableShell } from "./shells";
import { reportMoney } from "./report-utils";

export function GuestsTab({ data }: { data: GuestsData }) {
  return <div className="reports-tab-content">
    <dl className="reports-kpis" aria-label="Guests and selected-period collections">
      <MetricTile label="Collected in period" value={reportMoney(data.totalCollected, data.currency)} definition="Successful payments by payment date, including tax and deposits. Separate from room revenue." />
      <MetricTile label="Arriving guests" value={data.totalGuests.toLocaleString("en")} definition="Distinct identified guests arriving in this period." />
      <MetricTile label="New guests" value={data.newGuests.toLocaleString("en")} definition="No earlier completed stay at their first arrival in this period." />
      <MetricTile label="Repeat guests" value={data.repeatGuests.toLocaleString("en")} definition="An earlier completed stay before their first arrival in this period." />
    </dl>
    <SectionCard title="Collections by payment method" caption={`Successful payments within the selected property dates · ${data.currency}`}>
      {data.byMethod.length === 0 ? <EmptyState text="No payments in this period." /> : <TableShell
        head={["Payment method", "Payments", `Collected (${data.currency})`]} caption="Selected-period collections by payment method">
        {data.byMethod.map((method) => <tr key={method.method}><th scope="row">{PAYMENT_METHOD_LABELS[method.method] ?? method.method}</th>
          <td>{method.count.toLocaleString("en")}</td><td>{reportMoney(method.amount, data.currency)}</td></tr>)}
      </TableShell>}
    </SectionCard>
    <section className="reports-current-balance" aria-label="Current outstanding balance">
      <div><h2>Current outstanding</h2><p>Current unpaid balances, including departed stays and tax. Not limited to the selected dates; cancelled and no-show bookings are excluded.</p></div>
      <p className="reports-balance-value">{reportMoney(data.outstanding, data.currency)}</p>
    </section>
    <SectionCard title="Guest origins" caption="Recorded nationalities for identified guests arriving in the selected period.">
      {data.origins.length === 0 ? <EmptyState text="No guest nationalities recorded for this period." /> : <TableShell head={["Nationality", "Guests"]} caption="Guest origins by recorded nationality">
        {data.origins.map((origin) => <tr key={origin.nationality}><th scope="row">{origin.nationality}</th><td>{origin.count.toLocaleString("en")}</td></tr>)}
      </TableShell>}
    </SectionCard>
  </div>;
}
