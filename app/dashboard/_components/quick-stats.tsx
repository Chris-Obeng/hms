"use client";

import {
  TrendingUp,
  Wallet,
  CreditCard,
  LogIn,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

// ── Helpers ────────────────────────────────────────────────────

function formatCurrency(amount: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ── Types ──────────────────────────────────────────────────────

interface QuickStatsData {
  adr: number;
  revpar: number;
  totalRevenue: number;
  roomNightsSold: number;
}

interface TodaySummaryData {
  arrivals: number;
  departures: number;
  inHouse: number;
}

interface QuickStatsProps {
  data: QuickStatsData;
  currency: string;
}

interface TodaySummaryProps {
  data: TodaySummaryData;
}

// ── QuickStatRow ───────────────────────────────────────────────

function QuickStatRow({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between group transition-colors hover:bg-muted/20 -mx-1 px-1 py-0.5 rounded-md">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-muted/20 group-hover:bg-muted/30 transition-colors">
          <Icon className={cn("size-4", color)} />
        </div>
        <span className="text-label text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

// ── SummaryRow ────────────────────────────────────────────────

function SummaryRow({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 group hover:bg-muted/10 -mx-1 px-1 rounded-md transition-colors">
      <div className="flex items-center gap-2.5">
        <Icon className={cn("size-4", color)} />
        <span className="text-label text-muted-foreground">{label}</span>
      </div>
      <Badge variant="secondary" className="text-caption px-2 h-5 font-semibold tabular-nums">
        {value}
      </Badge>
    </div>
  );
}

// ── Quick Stats Card (Revenue) ────────────────────────────────

export function QuickStats({ data, currency }: QuickStatsProps) {
  return (
    <Card className="border-border/40 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-section">Today&apos;s Revenue</CardTitle>
        <CardDescription className="text-caption mt-0.5">
          Financial summary for today
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <QuickStatRow
          label="ADR"
          value={formatCurrency(data.adr, currency)}
          icon={TrendingUp}
          color="text-blue-500"
        />
        <Separator className="opacity-20" />
        <QuickStatRow
          label="RevPAR"
          value={formatCurrency(data.revpar, currency)}
          icon={Wallet}
          color="text-violet-500"
        />
        <Separator className="opacity-20" />
        <QuickStatRow
          label="Total Revenue"
          value={formatCurrency(data.totalRevenue, currency)}
          icon={TrendingUp}
          color="text-emerald-500"
        />
        <Separator className="opacity-20" />
        <QuickStatRow
          label="Room Nights"
          value={data.roomNightsSold.toString()}
          icon={CreditCard}
          color="text-amber-500"
        />
      </CardContent>
    </Card>
  );
}

// ── Today's Summary Card ───────────────────────────────────────

export function TodaySummary({ data }: TodaySummaryProps) {
  return (
    <Card className="border-border/40 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-section">Today&apos;s Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <SummaryRow icon={LogIn} label="Arrivals" value={data.arrivals} color="text-emerald-500" />
        <SummaryRow icon={LogOut} label="Departures" value={data.departures} color="text-amber-500" />
        <SummaryRow icon={CreditCard} label="In-house" value={data.inHouse} color="text-blue-500" />
      </CardContent>
    </Card>
  );
}
