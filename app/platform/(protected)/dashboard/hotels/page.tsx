export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";
import { HotelsTable } from "../_components/hotels-table";
import { cn } from "@/lib/utils";
// â”€â”€ Filter tab definition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FILTERS = [
  { label: "All",       value: "" },
  { label: "Active",    value: "active" },
  { label: "Pending",   value: "pending" },
  { label: "Suspended", value: "suspended" },
] as const;

// â”€â”€ Reusable: FilterTab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FilterTab({
  label,
  href,
  isActive,
}: {
  label: string;
  href: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={isActive}
      className={cn(
        // Base styles matching shadcn Button sm variant
        "inline-flex items-center justify-center h-7 px-3 rounded-lg text-xs font-medium",
        "whitespace-nowrap transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        isActive
          ? // variant="default" equivalent
            "bg-foreground text-background hover:bg-foreground/90"
          : // variant="ghost" equivalent
            "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      )}
    >
      {label}
    </Link>
  );
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Props = { searchParams: Promise<{ status?: string }> };

export default async function PlatformHotelsPage({ searchParams }: Props) {
  const { status } = await searchParams;

  let query = supabaseAdmin
    .from("hotels")
    .select("id, name, slug, plan, status, created_at, email, city, country")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data: hotels } = await query.limit(500);

  const statusLabel = status
    ? `${status.charAt(0).toUpperCase() + status.slice(1)} Hotels`
    : "All Hotels";

  const count = hotels?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* â”€â”€ Page heading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {statusLabel}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {count} hotel{count !== 1 ? "s" : ""}
          {status ? ` with status: ${status}` : ""}
        </p>
      </div>

      {/* â”€â”€ Filter tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        role="tablist"
        aria-label="Filter hotels by status"
        className="flex gap-2 flex-wrap"
      >
        {FILTERS.map((f) => {
          const href = f.value
            ? `/platform/dashboard/hotels?status=${f.value}`
            : "/platform/dashboard/hotels";
          return (
            <FilterTab
              key={f.value}
              label={f.label}
              href={href}
              isActive={(status ?? "") === f.value}
            />
          );
        })}
      </div>

      {/* â”€â”€ Hotels table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <HotelsTable hotels={hotels ?? []} />
    </div>
  );
}
