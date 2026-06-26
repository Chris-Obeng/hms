"use client";

import * as React from "react";
import { format } from "date-fns";
import { Eye, AlertCircle } from "lucide-react";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function OutstandingClient({
  data, currency, totalOutstanding, hotelId,
}: { data: OutstandingRow[]; currency: string; totalOutstanding: number; hotelId: string }) {
  const router = useRouter();
  const [drawerBookingId, setDrawerBookingId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  // Realtime subscription — refresh on any booking or payment change for this hotel
  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`hotel:${hotelId}:outstanding`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `hotel_id=eq.${hotelId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId, router]);

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
          <h1 className="text-2xl font-semibold tracking-tight">Outstanding Balances</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} bookings with unpaid balances</p>
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4 flex items-center gap-3">
        <AlertCircle className="size-4 text-amber-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Total outstanding: {fmt(totalOutstanding, currency)}</p>
          <p className="text-xs text-amber-600 mt-0.5">Across {data.length} confirmed booking{data.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

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
                <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
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
                      {format(new Date(r.checkIn), "MMM d")}
                    </span>
                    {isToday && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Today</span>}
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
                      <Eye className="size-3.5" />
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
