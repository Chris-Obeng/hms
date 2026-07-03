import { supabaseAdmin } from "@/lib/supabase/admin";
import { Building2, Users, Clock } from "lucide-react";
import Link from "next/link";
import { HotelsTable } from "./_components/hotels-table";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlatformDashboard() {
  // ── Stats ──────────────────────────────────────────────────
  const [
    { count: totalHotels },
    { count: activeHotels },
    { count: pendingHotels },
    { data: planCounts },
  ] = await Promise.all([
    supabaseAdmin.from("hotels").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("hotels")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabaseAdmin
      .from("hotels")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabaseAdmin.from("hotels").select("plan"),
  ]);

  const plans = (planCounts ?? []).reduce(
    (acc, h) => {
      const p = h.plan ?? "starter";
      acc[p] = (acc[p] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // ── Recent hotels ─────────────────────────────────────────
  const { data: hotels } = await supabaseAdmin
    .from("hotels")
    .select("id, name, slug, plan, status, created_at, email, city, country")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-8">
      {/* ── Page heading ──────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Platform Overview
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          HotelOS Pro internal admin
        </p>
      </div>

      {/* ── Stat cards ────────────────────────────────────── */}
      {/*
       * Layout:
       *   mobile (< sm)  : 1 column
       *   sm – md        : 2 columns
       *   lg+            : 4 columns
       */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Total Hotels"
          value={totalHotels ?? 0}
        />
        <StatCard
          icon={Users}
          label="Active"
          value={activeHotels ?? 0}
          valueColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={Clock}
          label="Pending Approval"
          value={pendingHotels ?? 0}
          valueColor="text-amber-600 dark:text-amber-400"
          href="/platform/dashboard/hotels?status=pending"
        />

        {/* By-Plan breakdown card */}
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              By Plan
            </p>
            <div className="space-y-2">
              {(
                [
                  { key: "starter", color: "bg-blue-500" },
                  { key: "growth", color: "bg-violet-500" },
                  { key: "professional", color: "bg-amber-500" },
                ] as const
              ).map(({ key, color }) => {
                const count = plans[key] ?? 0;
                const total = totalHotels ?? 1;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">
                        {key}
                      </span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {count}
                      </span>
                    </div>
                    {/* Mini progress bar */}
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", color)}
                        style={{ width: `${pct}%` }}
                        aria-label={`${key}: ${pct}%`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Hotels table ──────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">All Hotels</h2>
          <Link
            href="/platform/dashboard/hotels?status=pending"
            className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium transition-colors"
          >
            {pendingHotels ?? 0} pending approval →
          </Link>
        </div>
        <HotelsTable hotels={hotels ?? []} />
      </div>
    </div>
  );
}

// ── StatCard ───────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  valueColor?: string;
  href?: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  valueColor = "text-foreground",
  href,
}: StatCardProps) {
  const inner = (
    <Card className="hover:shadow-md transition-shadow duration-150">
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground shrink-0" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </p>
        </div>
        <p
          className={cn(
            "text-3xl font-bold tabular-nums leading-none",
            valueColor
          )}
        >
          {value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      {inner}
    </Link>
  ) : (
    inner
  );
}
