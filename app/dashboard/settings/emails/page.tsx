import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { GuestEmailsClient } from "./emails-client";

/**
 * Guest emails. Templates are super-admin only (the server action enforces it);
 * other roles get the same "Super admins only" state as the audit log instead
 * of the action's raw permission error.
 */
export default async function GuestEmailsPage() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) redirect("/sign-in");

  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  if (!can(staff?.role, "notification_templates:manage")) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Super admins only</h2>
      </div>
    );
  }

  return <GuestEmailsClient />;
}
