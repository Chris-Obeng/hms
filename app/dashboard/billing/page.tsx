import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Check, Lock, MessageCircle, Phone } from "lucide-react";

export const dynamic = "force-dynamic";

// ── Plan definitions ───────────────────────────────────────────────

type PlanKey = "starter" | "growth" | "professional";

interface Feature {
  label: string;
  starter: boolean | string;
  growth: boolean | string;
  professional: boolean | string;
}

const PLAN_META: Record<PlanKey, { name: string; price: string; priceNote: string }> = {
  starter: {
    name: "Starter",
    price: "GHC 400",
    priceNote: "/month",
  },
  growth: {
    name: "Growth",
    price: "GHC 750",
    priceNote: "/month",
  },
  professional: {
    name: "Professional",
    price: "GHC 1,400",
    priceNote: "/month",
  },
};

const FEATURES: Feature[] = [
  { label: "Rooms",             starter: "Up to 15",    growth: "Up to 40",    professional: "Unlimited" },
  { label: "Staff accounts",    starter: "3 staff",     growth: "10 staff",    professional: "Unlimited" },
  { label: "Direct booking page",  starter: true,       growth: true,          professional: true },
  { label: "Paystack payments",    starter: true,       growth: true,          professional: true },
  { label: "Guest transactional email", starter: true,  growth: true,          professional: true },
  { label: "Reports & analytics",  starter: true,       growth: true,          professional: true },
  { label: "Custom domain",        starter: false,      growth: false,         professional: true },
  { label: "Priority support",     starter: false,      growth: false,         professional: true },
];

// ── Component ──────────────────────────────────────────────────────

export default async function BillingPage() {
  const { orgId } = await auth();
  const supabase = await createClient();
  const { data: hotel } = orgId
    ? await supabase
        .from("hotels")
        .select("plan, name")
        .eq("clerk_org_id", orgId)
        .single()
    : { data: null };

  const currentPlan = ((hotel?.plan ?? "starter") as PlanKey);
  const planOrder: PlanKey[] = ["starter", "growth", "professional"];
  const currentIndex = planOrder.indexOf(currentPlan);
  const isTopPlan = currentIndex === planOrder.length - 1;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-page-title text-foreground">Subscription</h1>
        <p className="text-body text-muted-foreground mt-1">
          Your current plan and available features
        </p>
      </div>

      {/* Current plan highlight */}
      <div className="rounded-xl border-2 border-foreground bg-foreground text-background p-5 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-60">Active Plan</p>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-2xl font-bold">{PLAN_META[currentPlan].name}</p>
            <p className="text-sm opacity-70 mt-0.5">
              {FEATURES.find(f => f.label === "Rooms")?.[currentPlan] as string} ·{" "}
              {FEATURES.find(f => f.label === "Staff accounts")?.[currentPlan] as string}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold">{PLAN_META[currentPlan].price}</p>
            <p className="text-xs opacity-60">{PLAN_META[currentPlan].priceNote}</p>
          </div>
        </div>
      </div>

      {/* Feature comparison table */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Feature
              </th>
              {planOrder.map((plan) => (
                <th
                  key={plan}
                  className={`px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider ${
                    plan === currentPlan
                      ? "text-foreground bg-foreground/5"
                      : "text-muted-foreground"
                  }`}
                >
                  {PLAN_META[plan].name}
                  {plan === currentPlan && (
                    <span className="ml-1.5 inline-block bg-foreground text-background text-[9px] font-bold px-1.5 py-0.5 rounded-full align-middle">
                      YOU
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {FEATURES.map((feature) => (
              <tr key={feature.label} className="hover:bg-muted/10 transition-colors">
                <td className="px-4 py-3 text-foreground font-medium">{feature.label}</td>
                {planOrder.map((plan) => {
                  const val = feature[plan];
                  const isCurrentPlan = plan === currentPlan;
                  const isLocked = !val && planOrder.indexOf(plan) > currentIndex;
                  return (
                    <td
                      key={plan}
                      className={`px-3 py-3 text-center ${isCurrentPlan ? "bg-foreground/5" : ""}`}
                    >
                      {typeof val === "string" ? (
                        <span className={`text-xs font-medium ${isCurrentPlan ? "text-foreground" : "text-muted-foreground"}`}>
                          {val}
                        </span>
                      ) : val === true ? (
                        <Check className={`size-4 mx-auto ${isCurrentPlan ? "text-emerald-600" : "text-muted-foreground/50"}`} />
                      ) : (
                        <Lock className="size-3.5 mx-auto text-muted-foreground/30" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Price row */}
            <tr className="bg-muted/20 border-t border-border/60">
              <td className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Monthly price
              </td>
              {planOrder.map((plan) => (
                <td
                  key={plan}
                  className={`px-3 py-3 text-center ${plan === currentPlan ? "bg-foreground/5" : ""}`}
                >
                  <span className={`text-sm font-bold ${plan === currentPlan ? "text-foreground" : "text-muted-foreground"}`}>
                    {PLAN_META[plan].price}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Upgrade CTA */}
      {!isTopPlan && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Want to upgrade to {PLAN_META[planOrder[currentIndex + 1]].name}?
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {currentPlan === "starter"
                ? "Unlock more rooms, more staff accounts, and priority support."
                : "Get a custom domain for your booking page and priority support."}
              {" "}Contact the RoomLine team to upgrade — no online payment form, we handle it for you.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://wa.me/233XXXXXXXXX?text=Hi%2C%20I'd%20like%20to%20upgrade%20my%20RoomLine%20plan"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-foreground text-background text-xs font-medium hover:bg-foreground/90 transition-colors"
            >
              <Phone className="size-3.5" />
              WhatsApp us
            </a>
            <a
              href="mailto:support@RoomLineprp.com?subject=Plan upgrade request"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border/60 text-foreground text-xs font-medium hover:bg-muted/40 transition-colors"
            >
              <MessageCircle className="size-3.5" />
              Email support
            </a>
          </div>
        </div>
      )}

      {isTopPlan && (
        <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <Check className="size-3 inline-block mr-1 text-emerald-600" />
            You're on the <strong>Professional</strong> plan — you have access to all RoomLine features.
          </p>
        </div>
      )}
    </div>
  );
}
