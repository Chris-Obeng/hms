import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  HOTEL_STATUSES,
  type CurrencyTotal,
  type HotelRow,
} from "./_components/types";
import { OversightTable } from "./_components/oversight-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SearchParams = { q?: string; status?: string; page?: string };

// ── KPI strip ────────────────────────────────────────────────────

async function KpiStrip() {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 29);

  const [paymentsRes, activeRes, pendingRes] = await Promise.all([
    supabaseAdmin
      .from("payments")
      .select("amount, platform_fee, currency")
      .eq("status", "success")
      .gte("paid_at", windowStart.toISOString()),
    supabaseAdmin
      .from("hotels")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabaseAdmin
      .from("hotels")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  // Totals are grouped per currency — never sum across currencies.
  const gmvMap = new Map<string, number>();
  const feesMap = new Map<string, number>();
  for (const p of paymentsRes.data ?? []) {
    const cur = p.currency ?? "GHS";
    gmvMap.set(cur, (gmvMap.get(cur) ?? 0) + Number(p.amount));
    feesMap.set(
      cur,
      (feesMap.get(cur) ?? 0) + Number(p.platform_fee ?? 0)
    );
  }
  const toSorted = (m: Map<string, number>): CurrencyTotal[] =>
    Array.from(m.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount);

  return (
    <section aria-label="Platform key metrics">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Total GMV" totals={toSorted(gmvMap)} windowLabel="last 30 days" />
        <KpiTile
          label="Platform revenue"
          totals={toSorted(feesMap)}
          windowLabel="last 30 days"
        />
        <CountTile value={activeRes.count ?? 0} label="Active hotels" windowLabel="now" />
        <CountTile
          value={pendingRes.count ?? 0}
          label="Pending approvals"
          windowLabel="now"
        />
      </div>
    </section>
  );
}

function KpiTile({
  label,
  totals,
  windowLabel,
}: {
  label: string;
  totals: CurrencyTotal[];
  windowLabel: string;
}) {
  const primary = totals[0];
  const rest = totals.slice(1);
  return (
    <div className="card-default p-4 min-w-0">
      <p className="text-label text-muted-foreground truncate">{label}</p>
      <p className="text-kpi text-foreground mt-1 tabular-nums truncate">
        {primary ? fmtMoney(primary.amount, primary.currency) : "—"}
      </p>
      <p className="text-caption text-muted-foreground mt-1 truncate">
        {windowLabel}
        {rest.length > 0 &&
          ` · +${fmtMoney(rest.reduce((s, t) => s + t.amount, 0), rest[0].currency)} other ccy`}
      </p>
    </div>
  );
}

function CountTile({
  value,
  label,
  windowLabel,
}: {
  value: number;
  label: string;
  windowLabel: string;
}) {
  return (
    <div className="card-default p-4 min-w-0">
      <p className="text-label text-muted-foreground truncate">{label}</p>
      <p className="text-kpi text-foreground mt-1 tabular-nums">{value.toLocaleString()}</p>
      <p className="text-caption text-muted-foreground mt-1">{windowLabel}</p>
    </div>
  );
}

function fmtMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Hotels section ───────────────────────────────────────────────

async function HotelsSection({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const status = HOTEL_STATUSES.find((s) => s === searchParams.status);
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  // Strip PostgREST or= syntax characters from user input before interpolation.
  const safeQ = q.replace(/[,()'"]/g, "");

  let query = supabaseAdmin
    .from("hotels")
    .select(
      "id, name, slug, city, country, status, currency, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (safeQ) {
    query = query.or(`name.ilike.%${safeQ}%,city.ilike.%${safeQ}%`);
  }

  const { data: hotels, count } = await query.range(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE - 1
  );

  const rows = hotels ?? [];
  const ids = rows.map((h) => h.id);

  // Per-page aggregates — three batched queries, never per-row calls.
  const [roomsAgg, paymentsAgg, outstandingAgg] =
    ids.length > 0
      ? await Promise.all([
          supabaseAdmin
            .from("rooms")
            .select("hotel_id, status")
            .eq("is_active", true)
            .in("hotel_id", ids),
          supabaseAdmin
            .from("payments")
            .select("hotel_id, amount, currency")
            .eq("status", "success")
            .gte(
              "paid_at",
              (() => {
                const d = new Date();
                d.setDate(d.getDate() - 29);
                return d.toISOString();
              })()
            )
            .in("hotel_id", ids),
          supabaseAdmin
            .from("bookings")
            .select("hotel_id, outstanding_balance, currency")
            .in("status", ["confirmed", "checked_in", "checked_out"])
            .neq("payment_status", "paid")
            .gt("outstanding_balance", 0)
            .in("hotel_id", ids),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const roomsByHotel = new Map<string, { total: number; occupied: number }>();
  for (const r of roomsAgg.data ?? []) {
    const cur = roomsByHotel.get(r.hotel_id) ?? { total: 0, occupied: 0 };
    cur.total += 1;
    if (r.status === "occupied") cur.occupied += 1;
    roomsByHotel.set(r.hotel_id, cur);
  }
  // Per-hotel, per-currency sums — never total across currencies.
  const gmvByHotel = new Map<string, Map<string, number>>();
  for (const p of paymentsAgg.data ?? []) {
    let byCur = gmvByHotel.get(p.hotel_id);
    if (!byCur) gmvByHotel.set(p.hotel_id, (byCur = new Map()));
    const cur = p.currency ?? "GHS";
    byCur.set(cur, (byCur.get(cur) ?? 0) + Number(p.amount));
  }
  const outstandingByHotel = new Map<string, Map<string, number>>();
  for (const b of outstandingAgg.data ?? []) {
    let byCur = outstandingByHotel.get(b.hotel_id);
    if (!byCur) outstandingByHotel.set(b.hotel_id, (byCur = new Map()));
    const cur = b.currency ?? "GHS";
    byCur.set(cur, (byCur.get(cur) ?? 0) + Number(b.outstanding_balance ?? 0));
  }
  const toTotals = (m: Map<string, number> | undefined): CurrencyTotal[] =>
    m
      ? Array.from(m.entries())
          .map(([currency, amount]) => ({ currency, amount }))
          .sort((a, b) => b.amount - a.amount)
      : [];

  const hotelRows: HotelRow[] = rows.map((h) => {
    const rooms = roomsByHotel.get(h.id);
    return {
      id: h.id,
      name: h.name,
      slug: h.slug,
      city: h.city,
      country: h.country,
      status: h.status,
      currency: h.currency ?? "GHS",
      created_at: h.created_at ?? "",
      totalRooms: rooms && rooms.total > 0 ? rooms.total : null,
      occupiedToday: rooms ? rooms.occupied : null,
      gmv: toTotals(gmvByHotel.get(h.id)),
      outstanding: toTotals(outstandingByHotel.get(h.id)),
    };
  });

  return (
    <OversightTable
      rows={hotelRows}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      q={q}
      status={status ?? null}
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default async function HotelOversightPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const tableKey = `${sp.q ?? ""}|${sp.status ?? ""}|${sp.page ?? ""}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-page-title text-foreground">Hotel Oversight</h1>
        <p className="text-caption text-muted-foreground">
          Portfolio health and revenue across every RoomLine property.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card-default p-4 space-y-3">
                <div className="h-3 w-20 rounded-md bg-muted/60 animate-pulse" />
                <div className="h-8 w-28 rounded-md bg-muted/40 animate-pulse" />
                <div className="h-3 w-24 rounded-md bg-muted/40 animate-pulse" />
              </div>
            ))}
          </div>
        }
      >
        <KpiStrip />
      </Suspense>

      <Suspense key={tableKey} fallback={<TableSkeleton />}>
        <HotelsSection searchParams={sp} />
      </Suspense>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-10 w-full sm:w-64 rounded-lg bg-muted/50 animate-pulse" />
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 w-20 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="card-default overflow-hidden">
        <div className="divide-y divide-border/40">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-4">
              <div className="space-y-2 min-w-0 flex-1">
                <div className="h-4 w-40 max-w-full rounded-md bg-muted/60 animate-pulse" />
                <div className="h-3 w-24 rounded-md bg-muted/40 animate-pulse" />
              </div>
              <div className="h-5 w-16 rounded-full bg-muted/40 animate-pulse shrink-0 hidden sm:block" />
              <div className="h-4 w-20 rounded-md bg-muted/40 animate-pulse shrink-0 hidden md:block" />
              <div className="h-4 w-14 rounded-md bg-muted/40 animate-pulse shrink-0 hidden lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
