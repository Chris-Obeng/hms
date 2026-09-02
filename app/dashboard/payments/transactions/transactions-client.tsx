"use client";

import * as React from "react";
import { format } from "date-fns";
import { Download, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, getMethodLabel } from "@/lib/booking-status";
import { downloadCsv, toCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { HeroSelectField } from "@/components/ui/hero-select";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  method: string | null;
  status: string | null;
  paystackReference: string | null;
  paidAt: string | null;
  createdAt: string | null;
  notes: string | null;
  bookingId: string | null;
  bookingReference: string | null;
  guestName: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  success: "text-emerald-600 bg-emerald-50",
  pending: "text-amber-600 bg-amber-50",
  failed: "text-destructive bg-destructive/10",
  refunded: "text-blue-600 bg-blue-50",
};

function exportCsv(rows: PaymentRow[]) {
  const headers = ["Date", "Guest", "Booking Ref", "Amount", "Method", "Status", "Paystack Ref", "Notes"];
  const csv = toCsv(
    headers,
    rows.map((r) => [
      r.paidAt ? format(new Date(r.paidAt), "yyyy-MM-dd HH:mm") : "",
      r.guestName,
      r.bookingReference,
      r.amount,
      getMethodLabel(r.method),
      r.status,
      r.paystackReference,
      r.notes,
    ])
  );
  downloadCsv(`payments-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
}

export function TransactionsClient({ data, currency, hotelId }: { data: PaymentRow[]; currency: string; hotelId: string }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [methodFilter, setMethodFilter] = React.useState("all");
  const [drawerBookingId, setDrawerBookingId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Realtime subscription — refresh on any payment change for this hotel
  const refreshRef = React.useRef(router.refresh.bind(router));
  React.useEffect(() => { refreshRef.current = router.refresh.bind(router); });

  React.useEffect(() => {
    const supabase = createClient();
    // A single folio settlement can write several payment rows; refresh once per burst.
    const refresh = createCoalescer();
    const channel = supabase
      .channel(`hotel:${hotelId}:transactions`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `hotel_id=eq.${hotelId}` },
        () => refresh.schedule(() => refreshRef.current()),
      )
      .subscribe(onRealtimeStatus({ label: "transactions", hotelId, table: "payments" }));
    return () => {
      refresh.cancel();
      supabase.removeChannel(channel);
    };
  }, [hotelId]);

  const filtered = data.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (methodFilter !== "all" && r.method !== methodFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.guestName?.toLowerCase().includes(q) ||
        r.bookingReference?.toLowerCase().includes(q) ||
        r.paystackReference?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalSuccess = filtered
    .filter((r) => r.status === "success")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title text-foreground">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} records · {formatCurrency(totalSuccess, currency)} collected
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-xl text-xs"
          onClick={() => exportCsv(filtered)}
        >
          <Download className="size-3.5 mr-1.5" /> CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search guest, booking ref…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 rounded-lg border border-border/60 bg-background px-3 text-sm outline-none focus-visible:border-ring w-56"
        />
        <HeroSelectField className="w-40" value={statusFilter} onValueChange={setStatusFilter} options={[{value:"all",label:"All statuses"},{value:"success",label:"Success"},{value:"pending",label:"Pending"},{value:"failed",label:"Failed"},{value:"refunded",label:"Refunded"}]} ariaLabel="Transaction status" />
        <HeroSelectField className="w-40" value={methodFilter} onValueChange={setMethodFilter} options={[{value:"all",label:"All methods"}, ...Object.entries(PAYMENT_METHOD_LABELS).map(([value,label]) => ({value,label}))]} ariaLabel="Payment method" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              {["Date", "Guest", "Booking", "Amount", "Method", "Status", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">No transactions found</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap font-tabular">
                  {r.paidAt ? format(new Date(r.paidAt), "MMM d, HH:mm") : "—"}
                </td>
                <td className="px-4 py-3 font-medium truncate max-w-[140px]">{r.guestName ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.bookingReference ?? "—"}</td>
                <td className="px-4 py-3 font-semibold tabular-nums whitespace-nowrap">{formatCurrency(r.amount, r.currency)}</td>
                <td className="px-4 py-3 text-muted-foreground">{getMethodLabel(r.method)}</td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", STATUS_COLORS[r.status ?? ""] ?? "text-muted-foreground bg-muted")}>
                    {r.status ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.bookingId && (
                    <button
                      onClick={() => { setDrawerBookingId(r.bookingId); setDrawerOpen(true); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="View booking"
                    >
                      <Eye className="size-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BookingDetailDrawer
        bookingId={drawerBookingId}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerBookingId(null); }}
        currency={currency}
      />
    </div>
  );
}
