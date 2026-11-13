import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  formatCurrencyCompact,
  formatDate,
  formatDateTime,
} from "@/lib/format";
import { getHotel360, getHotelPayouts } from "../../_actions";
import { StatusChip } from "../../_components/status-chip";
import { HotelLifecycleActions } from "./_lifecycle-actions";
import { HotelDetailTabs } from "./_hotel-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hotel · RoomLine Platform" };

const AUDIT_LABELS: Record<string, string> = {
  "hotel.approve": "Approved",
  "hotel.suspend": "Suspended",
  "hotel.reactivate": "Reactivated",
};

export default async function PlatformHotelDetailPage({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}) {
  const { hotelId } = await params;

  const hotelRes = await getHotel360(hotelId);

  if (!hotelRes.success || !hotelRes.profile) notFound();

  const { profile, operations, money, staff, audit } = hotelRes;
  const bookingHref = profile.custom_domain
    ? `https://${profile.custom_domain}`
    : `/${profile.slug}`;
  const bookingLabel = profile.custom_domain ?? `/${profile.slug}`;
  const hasOutstanding = (money?.outstanding ?? []).some((t) => t.amount > 0);

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/platform"
        className="inline-flex items-center gap-2 text-caption text-muted-foreground hover:text-foreground transition-colors rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" />
        Hotels
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground truncate">{profile.name}</h1>
            <StatusChip status={profile.status} />
          </div>
          <p className="text-caption text-muted-foreground">
            {[profile.city, profile.country].filter(Boolean).join(", ") || profile.slug}
            {" · "}Joined {formatDate(profile.created_at, "dd MMM yyyy")}
          </p>
          <a
            href={bookingHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-caption text-accent hover:underline"
          >
            {bookingLabel}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <HotelLifecycleActions hotelId={profile.id} hotelName={profile.name} status={profile.status} />
      </header>

      {/* Tabbed: Overview (ops · money · staff · audit) + Online payments.
          Payouts fetch is deferred to the client tab — see HotelDetailTabs. */}
      <HotelDetailTabs
        payoutsLoad={getHotelPayouts.bind(null, hotelId)}
        timeZone={profile.timezone ?? "UTC"}
        overview={
          <div className="space-y-6">
            {/* Operations */}
      <SectionCard
        title="Operations"
        subtitle={`Check-ins over the last 30 days · ${operations?.activeRooms ?? 0} sellable rooms`}
      >
        {operations?.mixedRates ? (
          <p className="text-caption text-warning">
            Rates use {operations.rateCurrency} only — this window has bookings in multiple currencies.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="Bookings" value={operations?.bookings ? operations.bookings.toLocaleString() : "—"} />
          <Metric label="Nights sold" value={operations?.nightsSold ? operations.nightsSold.toLocaleString() : "—"} />
          <Metric label="Avg occupancy" value={pct(operations?.avgOccupancy)} />
          <Metric
            label={`ADR${operations?.rateCurrency ? ` · ${operations.rateCurrency}` : ""}`}
            value={money_(operations?.adr, operations?.rateCurrency ?? "GHS")}
          />
          <Metric
            label={`RevPAR${operations?.rateCurrency ? ` · ${operations.rateCurrency}` : ""}`}
            value={money_(operations?.revpar, operations?.rateCurrency ?? "GHS")}
            accent
          />
        </div>
        {!operations?.hasData ? (
          <p className="text-caption text-muted-foreground">
            No qualifying check-ins in this window — derived rates show as “—”.
          </p>
        ) : null}
      </SectionCard>

      {/* Money */}
      <SectionCard title="Money" subtitle="Lifetime revenue, platform fees and outstanding balances.">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Metric label="Collected" value={<MoneyTotals totals={money?.collected ?? []} />} />
          <Metric label="Online bookings" value={<MoneyTotals totals={money?.online ?? []} />} />
          <Metric label="Platform fees" value={<MoneyTotals totals={money?.fees ?? []} />} accent />
          <Metric
            label="Outstanding"
            value={<MoneyTotals totals={money?.outstanding ?? []} />}
            tone={hasOutstanding ? "warning" : undefined}
          />
        </div>
      </SectionCard>

      {/* Staff + Audit */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Staff" subtitle="Active accounts by role.">
          {(staff?.length ?? 0) === 0 ? (
            <div className="card-default p-4 text-caption text-muted-foreground">No active staff yet.</div>
          ) : (
            <ul className="card-default divide-y divide-border/40 overflow-hidden">
              {staff!.map((s) => (
                <li key={s.role} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm capitalize">{s.role.replace(/_/g, " ")}</span>
                  <span className="text-sm font-semibold tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Audit" subtitle="Platform team actions on this hotel.">
          {(audit?.length ?? 0) === 0 ? (
            <div className="card-default p-4 text-caption text-muted-foreground">
              No platform actions recorded yet.
            </div>
          ) : (
            <ol className="relative space-y-0">
              {audit!.map((entry, i) => {
                const before = statusOf(entry.before_state);
                const after = statusOf(entry.after_state);
                const last = i === audit!.length - 1;
                return (
                  <li key={entry.id} className={"relative pl-6 " + (last ? "pb-1" : "pb-6")}>
                    {!last && (
                      <span className="absolute left-[4px] top-4 bottom-0 w-px bg-border/70" aria-hidden />
                    )}
                    <span className="absolute left-0 top-2 size-3 rounded-full border-2 border-background bg-foreground/50" aria-hidden />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="text-sm font-medium">{AUDIT_LABELS[entry.action] ?? entry.action}</p>
                      {before !== after && (
                        <span className="text-caption text-muted-foreground tabular-nums">
                          {before ?? "?"} → {after ?? "?"}
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-muted-foreground mt-1">
                      {entry.admin_email} · {formatDateTime(entry.created_at)}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </SectionCard>
      </div>
          </div>
        }
      />
    </div>
  );
}

// ── Presentational helpers (server-rendered) ─────────────────────
function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-section text-foreground">{title}</h2>
        {subtitle ? <p className="text-caption text-muted-foreground mt-1">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  tone?: "warning";
}) {
  return (
    <div className="card-default p-3 min-w-0">
      <p className="text-label text-muted-foreground truncate">{label}</p>
      <p
        className={
          "mt-1 text-lg font-semibold tabular-nums truncate " +
          (tone === "warning" ? "text-warning" : accent ? "text-accent" : "text-foreground")
        }
      >
        {value}
      </p>
    </div>
  );
}

/** Primary currency total with a muted "+X <ccy>" suffix for extras. */
function MoneyTotals({ totals }: { totals: { currency: string; amount: number }[] }) {
  if (totals.length === 0) return <>0</>;
  const primary = totals[0];
  const rest = totals.slice(1);
  return (
    <span className="tabular-nums whitespace-nowrap">
      {formatCurrencyCompact(primary.amount, primary.currency)}
      {rest.length > 0 && (
        <span className="text-muted-foreground text-xs font-normal">
          {" "}
          +{formatCurrencyCompact(rest.reduce((s, t) => s + t.amount, 0), rest[0].currency)}
        </span>
      )}
    </span>
  );
}

function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${v}%`;
}
function money_(v: number | null | undefined, cur: string): string {
  return v == null ? "—" : formatCurrencyCompact(v, cur);
}
function statusOf(state: Record<string, unknown> | null): string | null {
  return typeof state?.status === "string" ? state.status : null;
}
