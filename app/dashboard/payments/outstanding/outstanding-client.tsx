"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { Eye, AlertCircle } from "lucide-react";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";

interface OutstandingRow {
  id: string;
  reference: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  amountPaid: number;
  outstandingBalance: number;
  status: string;
  guestName: string;
  guestPhone: string | null;
  roomNumber: string | null;
  roomType: string | null;
}

interface RefundRow {
  id: string;
  reference: string;
  checkOut: string;
  refundDue: number;
  guestName: string;
  guestPhone: string | null;
}

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function OutstandingClient({
  data, refunds = [], currency, totalOutstanding, hotelId,
}: { data: OutstandingRow[]; refunds?: RefundRow[]; currency: string; totalOutstanding: number; hotelId: string }) {
  const router = useRouter();
  const [drawerBookingId, setDrawerBookingId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  // Stable refresh ref — avoids adding router to effect deps which could
  // cause unnecessary subscription churn if router reference changes.
  const refreshRef = React.useRef(router.refresh.bind(router));
  React.useEffect(() => { refreshRef.current = router.refresh.bind(router); });

  // Realtime subscription — refresh on any booking or payment change for this hotel
  React.useEffect(() => {
    const supabase = createClient();
    // One folio operation writes several rows; coalesce the burst into a single refresh.
    const refresh = createCoalescer();
    const scheduleRefresh = () => refresh.schedule(() => refreshRef.current());
    const channel = supabase
      .channel(`hotel:${hotelId}:outstanding`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `hotel_id=eq.${hotelId}` },
        scheduleRefresh,
      )
      .subscribe(
        onRealtimeStatus({
          label: "outstanding",
          hotelId,
          table: "bookings,payments",
          onRecovered: scheduleRefresh,
        }),
      );
    return () => {
      refresh.cancel();
      supabase.removeChannel(channel);
    };
  }, [hotelId]);

  const filtered = search
    ? data.filter((r) =>
        r.guestName.toLowerCase().includes(search.toLowerCase()) ||
        r.reference.toLowerCase().includes(search.toLowerCase())
      )
    : data;

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title text-foreground">Outstanding Balances</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} bookings with unpaid balances</p>
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-6 py-4 flex items-center gap-3">
        <AlertCircle className="size-4 text-amber-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Total outstanding: {fmt(totalOutstanding, currency)}</p>
          <p className="text-xs text-amber-600 mt-1">Across {data.length} confirmed booking{data.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Refunds owed: paid above the bill after an early check-out */}
      {refunds.length > 0 && (
        <section aria-label="Refunds owed" className="rounded-xl border border-border/60 bg-card">
          <div className="px-6 py-4 border-b border-border/50">
            <p className="text-sm font-semibold text-foreground">
              Refunds owed: {fmt(refunds.reduce((s, r) => s + r.refundDue, 0), currency)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              These guests paid more than their bill. Give the money back in person, then open the booking and
              record the refund.
            </p>
          </div>
          <ul>
            {refunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border/30 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{r.guestName}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.reference} · left {format(parseISO(r.checkOut), "MMM d")}
                    {r.guestPhone ? ` · ${r.guestPhone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="tabular-nums font-semibold text-amber-700">{fmt(r.refundDue, currency)}</span>
                  <button
                    type="button"
                    onClick={() => { setDrawerBookingId(r.id); setDrawerOpen(true); }}
                    className="h-10 rounded-lg border border-border/60 px-3 text-sm font-medium text-foreground transition-colors max-md:h-11"
                  >
                    Open
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search guest or reference…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 rounded-lg border border-border/60 bg-background px-3 text-sm outline-none focus-visible:border-ring w-56"
      />

      {/* Table */}
      <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              {["Guest", "Booking", "Room", "Check-In", "Total", "Paid", "Outstanding", ""].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                {search ? "No results" : "No outstanding balances — all caught up!"}
              </td></tr>
            ) : filtered.map((r) => {
              const isToday = r.checkIn === today;
              return (
                <tr key={r.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium truncate max-w-[140px]">{r.guestName}</p>
                    {r.guestPhone && <p className="text-xs text-muted-foreground">{r.guestPhone}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.reference}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.roomType ?? "—"}{r.roomNumber ? ` · Rm ${r.roomNumber}` : ""}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={isToday ? "text-amber-600 font-medium" : "text-foreground"}>
                      {format(parseISO(r.checkIn), "MMM d")}
                    </span>
                    {isToday && <span className="ml-2 text-2xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Today</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{fmt(r.totalAmount, currency)}</td>
                  <td className="px-4 py-3 tabular-nums text-emerald-600">{fmt(r.amountPaid, currency)}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-destructive">{fmt(r.outstandingBalance, currency)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setDrawerBookingId(r.id); setDrawerOpen(true); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="View booking"
                    >
                      <Eye className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <BookingDetailDrawer
        bookingId={drawerBookingId}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerBookingId(null); }}
        currency={currency}
        onBookingChanged={() => router.refresh()}
      />
    </div>
  );
}
