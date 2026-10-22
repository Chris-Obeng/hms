import type { SourceSlice } from "../actions";
import { SOURCE_LABELS } from "@/lib/booking-status";
import { reportMoney } from "./report-utils";
import { EmptyState, SectionCard, TableShell } from "./shells";

export function SourceTable({ sources, currency }: { sources: SourceSlice[]; currency: string }) {
  return <SectionCard title="Booking sources" caption="Room revenue and room nights within the selected stay dates.">
    {sources.length === 0 ? <EmptyState text="No bookings in this period." /> : <TableShell
      caption={`Booking sources — room revenue excluding tax (${currency})`}
      head={["Source", "Bookings", "Room nights", `Room revenue (${currency})`, "Booking share"]}>
      {sources.map((source) => <tr key={source.source}>
        <th scope="row">{SOURCE_LABELS[source.source] ?? source.source}</th>
        <td>{source.count.toLocaleString("en")}</td><td>{source.roomNights.toLocaleString("en")}</td>
        <td>{reportMoney(source.revenue, currency)}</td><td>{source.pct}%</td>
      </tr>)}
    </TableShell>}
  </SectionCard>;
}
