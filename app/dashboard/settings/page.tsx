import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { Settings } from "lucide-react";
import { SettingsNavigation } from "./settings-navigation";
import { SettingsHeader } from "./settings-header";
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

  const isSuperAdmin = can(currentUser?.role, "settings:manage");
  const canView = can(currentUser?.role, "settings:view");

  if (!canView) {
    return <NoAccessState />;
  }

  const sections = [
    {
      title: "Property operations",
      description: "Core hotel details and connected operational systems.",
      items: [
        {
          icon: "building" as const,
          label: "Hotel profile",
          description: "Name, address, contact, check-in/out times, and branding",
          href: "/dashboard/settings/hotel",
          minRole: "super_admin" as const,
        },
      ],
    },
    {
      title: "Guest communication",
      description: "Control staff alerts and messages sent to guests.",
      items: [
        {
          icon: "bell" as const,
          label: "Notifications",
          description: "Sound, event toggles, and notification preferences",
          href: "/dashboard/settings/notifications",
        },
        {
          icon: "mail" as const,
          label: "Guest emails",
          description: "Edit transactional email content and booking messages",
          href: "/dashboard/settings/notifications#message-templates",
          minRole: "super_admin" as const,
        },
      ],
    },
    {
      title: "Payments & integrations",
      description: "Manage payment processing and external connections.",
      items: [
        {
          icon: "card" as const,
          label: "Payments",
          description: "Payment policy, Paystack bank account, and subaccount setup",
          href: "/dashboard/settings/payments",
          minRole: "manager" as const,
        },
      ],
    },
    {
      title: "Workspace administration",
      description: "Manage staff access and accountability.",
      items: [
        {
          icon: "users" as const,
          label: "Staff",
          description: "Manage team members, roles, and access permissions",
          href: "/dashboard/staff",
        },
        {
          icon: "audit" as const,
          label: "Audit log",
          description: "Append-only record of all staff actions and changes",
          href: "/dashboard/settings/audit-log",
          minRole: "super_admin" as const,
        },
      ],
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 pb-10 sm:space-y-9">
      <SettingsHeader isSuperAdmin={isSuperAdmin} />

      <SettingsNavigation sections={sections} role={currentUser?.role ?? "pending"} />
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


