import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Settings, Building2, Bell, Shield, CreditCard, Link2, ChevronRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) {
    return <NoAccessState />;
  }

  const supabase = await createClient();
  const { data: currentUser } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  const isSuperAdmin = currentUser?.role === "super_admin";
  const canView = currentUser?.role && currentUser.role !== "pending";

  if (!canView) {
    return <NoAccessState />;
  }

  const sections = [
    {
      title: "Property",
      items: [
        {
          icon: Building2,
          label: "Hotel Profile",
          description: "Name, address, contact, check-in/out times, and branding",
          href: "/dashboard/settings/hotel",
          restricted: true,
        },
      ],
    },
    {
      title: "Preferences",
      items: [
        {
          icon: Bell,
          label: "Notifications",
          description: "Sound, event toggles, and notification preferences",
          href: "/dashboard/settings/notifications",
          restricted: false,
        },
      ],
    },
    {
      title: "Payments & Integrations",
      items: [
        {
          icon: CreditCard,
          label: "Payments",
          description: "Payment policy, Paystack bank account, and subaccount setup",
          href: "/dashboard/settings/payments",
          restricted: true,
        },
        {
          icon: Link2,
          label: "Guest emails",
          description: "Transactional email settings",
          href: "/dashboard/settings/notifications",
          restricted: true,
        },
      ],
    },
    {
      title: "Subscription",
      items: [
        {
          icon: Settings,
          label: "Billing & Plan",
          description: "Your current plan, features, and upgrade options",
          href: "/dashboard/billing",
          restricted: false,
        },
      ],
    },
    {
      title: "Team",
      items: [
        {
          icon: Shield,
          label: "Staff",
          description: "Manage team members, roles, and access permissions",
          href: "/dashboard/staff",
          restricted: false,
        },
        {
          icon: Shield,
          label: "Audit Log",
          description: "Append-only record of all staff actions and changes",
          href: "/dashboard/settings/audit-log",
          restricted: true,
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-page-title text-foreground">Settings</h1>
        <p className="text-body text-muted-foreground mt-1">
          Manage your hotel configuration and preferences
        </p>
      </div>

      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="text-label font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {section.title}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {section.items.map((item) => {
              const Icon = item.icon;
              const canAccess = !item.restricted || isSuperAdmin;
              return (
                <Link
                  key={item.href}
                  href={canAccess ? item.href : "#"}
                  className={cn(
                    "flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 transition-all shadow-sm",
                    canAccess
                      ? "hover:border-border hover:shadow-md hover:bg-accent/5"
                      : "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="size-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 ring-1 ring-border/30">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-foreground">{item.label}</p>
                    <p className="text-caption text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground/30 shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function NoAccessState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Settings className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-section text-foreground">No Access</h2>
      <p className="text-body text-muted-foreground mt-1 max-w-sm">
        Please sign in to access settings.
      </p>
    </div>
  );
}


