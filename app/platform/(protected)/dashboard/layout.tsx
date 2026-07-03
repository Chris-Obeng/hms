import { redirect } from "next/navigation";
import { createPlatformClient } from "@/lib/supabase/platform-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  SidebarProvider,
  Sidebar,
  SidebarRail,
  SidebarInset,
} from "@/components/ui/sidebar";
import { PlatformSidebar } from "./_components/platform-sidebar";
import { PlatformHeader } from "./_components/platform-header";

export default async function PlatformDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ── Auth & admin identity ──────────────────────────────────
  const supabase = await createPlatformClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/platform/sign-in");
  }

  const { data: admin } = await supabaseAdmin
    .from("platform_admins")
    .select("full_name, role, email")
    .eq("supabase_user_id", data.claims.sub)
    .single();

  return (
    <SidebarProvider defaultOpen={true}>
      {/* ── Sidebar ───────────────────────────────────────── */}
      <Sidebar collapsible="icon" variant="sidebar" side="left">
        <PlatformSidebar admin={admin} />
        <SidebarRail />
      </Sidebar>

      {/* ── Main content area ─────────────────────────────── */}
      <SidebarInset>
        {/* Sticky top header — contains SidebarTrigger + page title + admin dropdown */}
        <PlatformHeader admin={admin} />

        {/* Page content */}
        <main className="flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-8 lg:py-8 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
