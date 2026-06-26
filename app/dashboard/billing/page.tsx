import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Sparkles, Check } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PLANS = {
  starter: { name: "Starter", price: "GHC 400", rooms: "Up to 15", staff: "3 staff" },
  growth: { name: "Growth", price: "GHC 750", rooms: "Up to 40", staff: "10 staff" },
  professional: { name: "Professional", price: "GHC 1,400", rooms: "Unlimited", staff: "Unlimited" },
} as const;

export default async function BillingPage() {
  const { orgId } = await auth();
  const supabase = await createClient();
  const { data: hotel } = orgId
    ? await supabase.from("hotels").select("plan").eq("clerk_org_id", orgId).single()
    : { data: null };

  const plan = (hotel?.plan ?? "starter") as keyof typeof PLANS;
  const current = PLANS[plan] ?? PLANS.starter;

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscription</h1>
        <p className="text-sm text-muted-foreground mt-1">Your HotelOS Pro plan</p>
      </div>

      {/* Current plan card */}
      <div className="rounded-xl border border-foreground/20 bg-foreground/5 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current Plan</span>
          <span className="text-xs font-semibold bg-foreground text-background px-2 py-0.5 rounded-full">Active</span>
        </div>
        <div>
          <p className="text-xl font-semibold text-foreground">{current.name}</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{current.price}<span className="text-sm font-normal text-muted-foreground">/month</span></p>
        </div>
        <div className="space-y-1.5 pt-1">
          {[current.rooms, current.staff].map((f) => (
            <div key={f} className="flex items-center gap-2 text-sm text-foreground">
              <Check className="size-3.5 text-emerald-600 shrink-0" />
              {f}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          <Sparkles className="size-3 inline-block mr-1 text-amber-500" />
          Plan changes are managed by the HotelOS Pro team.{" "}
          <a href="mailto:support@hotelosprp.com" className="underline text-foreground hover:opacity-70">Contact support</a> to upgrade.
        </p>
      </div>
    </div>
  );
}
