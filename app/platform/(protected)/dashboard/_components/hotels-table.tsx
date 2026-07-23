"use client";

import * as React from "react";
import { toast } from "@heroui/react";
import {
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Search,
  ExternalLink,
  MapPin,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { approveHotel, suspendHotel, reactivateHotel, changeHotelPlan } from "../_actions";

// ── Types ──────────────────────────────────────────────────────

interface Hotel {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  status: string | null;
  created_at: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
}

// ── Badge style maps ───────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  active:    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  pending:   "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  suspended: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
};

const PLAN_CLASSES: Record<string, string> = {
  starter:      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  growth:       "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  professional: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
};

const FALLBACK_BADGE = "bg-muted/40 text-muted-foreground border-border/60";

// ── Reusable: StatusBadge ──────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const label = status ?? "pending";
  return (
    <span
      className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 capitalize inline-flex items-center ${STATUS_CLASSES[label] ?? FALLBACK_BADGE}`}
    >
      {label}
    </span>
  );
}

// ── Reusable: PlanBadge ────────────────────────────────────────

function PlanBadge({ plan }: { plan: string | null }) {
  const label = plan ?? "starter";
  return (
    <span
      className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 capitalize inline-flex items-center ${PLAN_CLASSES[label] ?? FALLBACK_BADGE}`}
    >
      {label}
    </span>
  );
}

// ── Reusable: HotelActionsMenu ─────────────────────────────────

interface HotelActionsMenuProps {
  hotel: Hotel;
  onHandle: (action: string, hotel: Hotel) => Promise<void>;
  onPlanChange: (hotel: Hotel, plan: string) => Promise<void>;
  loading: boolean;
}

function HotelActionsMenu({
  hotel,
  onHandle,
  onPlanChange,
  loading,
}: HotelActionsMenuProps) {
  return (
    <div className="flex items-center gap-2">
      <a
        href={`/${hotel.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${hotel.name} booking page`}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <ExternalLink className="size-3.5" />
      </a>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center justify-center size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Actions for ${hotel.name}`}
          disabled={loading}
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {hotel.status === "pending" && (
            <DropdownMenuItem
              onClick={() => onHandle("approve", hotel)}
              className="text-emerald-600 focus:text-emerald-600 gap-2"
            >
              <CheckCircle2 className="size-3.5" />
              Approve
            </DropdownMenuItem>
          )}
          {hotel.status === "active" && (
            <DropdownMenuItem
              onClick={() => onHandle("suspend", hotel)}
              className="text-red-600 focus:text-red-600 gap-2"
            >
              <XCircle className="size-3.5" />
              Suspend
            </DropdownMenuItem>
          )}
          {hotel.status === "suspended" && (
            <DropdownMenuItem
              onClick={() => onHandle("reactivate", hotel)}
              className="text-emerald-600 focus:text-emerald-600 gap-2"
            >
              <CheckCircle2 className="size-3.5" />
              Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs text-muted-foreground"
            disabled
          >
            Change Plan
          </DropdownMenuItem>
          {["starter", "growth", "professional"].map((p) => (
            <DropdownMenuItem
              key={p}
              onClick={() => onPlanChange(hotel, p)}
              className={`capitalize text-xs pl-6 ${hotel.plan === p ? "font-semibold text-foreground" : ""}`}
            >
              {p}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Reusable: HotelCard (mobile view) ─────────────────────────

interface HotelCardProps {
  hotel: Hotel;
  onHandle: (action: string, hotel: Hotel) => Promise<void>;
  onPlanChange: (hotel: Hotel, plan: string) => Promise<void>;
  loading: boolean;
}

function HotelCard({ hotel, onHandle, onPlanChange, loading }: HotelCardProps) {
  const location = [hotel.city, hotel.country].filter(Boolean).join(", ");
  const created = hotel.created_at
    ? new Date(hotel.created_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          {/* Hotel info */}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold text-sm text-foreground truncate">
              {hotel.name}
            </p>
            <p className="text-[11px] text-muted-foreground font-mono">
              {hotel.slug}
            </p>
            {hotel.email && (
              <p className="text-[11px] text-muted-foreground truncate">
                {hotel.email}
              </p>
            )}

            {/* Location + date */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
              {location && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="size-3 shrink-0" />
                  {location}
                </span>
              )}
              {created && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="size-3 shrink-0" />
                  {created}
                </span>
              )}
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <StatusBadge status={hotel.status} />
              <PlanBadge plan={hotel.plan} />
            </div>
          </div>

          {/* Actions */}
          <HotelActionsMenu
            hotel={hotel}
            onHandle={onHandle}
            onPlanChange={onPlanChange}
            loading={loading}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── HotelsTable (main export) ──────────────────────────────────

export function HotelsTable({ hotels }: { hotels: Hotel[] }) {
  const [search, setSearch] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [localHotels, setLocalHotels] = React.useState(hotels);

  const filtered = localHotels.filter(
    (h) =>
      !search ||
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.slug.toLowerCase().includes(search.toLowerCase()) ||
      (h.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handle(action: string, hotel: Hotel) {
    setActionLoading(hotel.id + action);
    try {
      let result: { success: boolean; error?: string };
      if (action === "approve") result = await approveHotel(hotel.id);
      else if (action === "suspend") result = await suspendHotel(hotel.id);
      else if (action === "reactivate") result = await reactivateHotel(hotel.id);
      else return;

      if (result.success) {
        toast.success(`Hotel ${action}d`);
        setLocalHotels((prev) =>
          prev.map((h) =>
            h.id === hotel.id
              ? {
                  ...h,
                  status:
                    action === "approve" || action === "reactivate"
                      ? "active"
                      : "suspended",
                }
              : h
          )
        );
      } else {
        toast.danger(result.error ?? "Action failed");
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePlanChange(hotel: Hotel, plan: string) {
    setActionLoading(hotel.id + "plan");
    const result = await changeHotelPlan(hotel.id, plan);
    setActionLoading(null);
    if (result.success) {
      toast.success(`Plan changed to ${plan}`);
      setLocalHotels((prev) =>
        prev.map((h) => (h.id === hotel.id ? { ...h, plan } : h))
      );
    } else {
      toast.danger(result.error ?? "Failed to change plan");
    }
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search hotels…"
          className="pl-8 h-8 rounded-lg text-xs"
          aria-label="Search hotels"
        />
      </div>

      {/* ── Mobile card list (< md) ────────────────────────── */}
      <div className="md:hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {search ? "No matching hotels" : "No hotels yet"}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((hotel) => (
              <HotelCard
                key={hotel.id}
                hotel={hotel}
                onHandle={handle}
                onPlanChange={handlePlanChange}
                loading={actionLoading?.startsWith(hotel.id) ?? false}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop table (md+) ───────────────────────────── */}
      <div className="hidden md:block rounded-xl border border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Hotel
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">
                  Location
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Plan
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">
                  Created
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-12 text-sm text-muted-foreground"
                  >
                    {search ? "No matching hotels" : "No hotels yet"}
                  </td>
                </tr>
              ) : (
                filtered.map((hotel) => (
                  <tr
                    key={hotel.id}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground text-sm">
                          {hotel.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {hotel.slug}
                        </p>
                        {hotel.email && (
                          <p className="text-[11px] text-muted-foreground">
                            {hotel.email}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                      {[hotel.city, hotel.country].filter(Boolean).join(", ") ||
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      <PlanBadge plan={hotel.plan} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={hotel.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {hotel.created_at
                        ? new Date(hotel.created_at).toLocaleDateString(
                            "en-GB",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <HotelActionsMenu
                        hotel={hotel}
                        onHandle={handle}
                        onPlanChange={handlePlanChange}
                        loading={
                          actionLoading?.startsWith(hotel.id) ?? false
                        }
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results count */}
      <p className="text-[11px] text-muted-foreground">
        {filtered.length} of {localHotels.length} hotels
      </p>
    </div>
  );
}
