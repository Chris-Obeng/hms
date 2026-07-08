import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { SidebarProvider, Sidebar, SidebarRail } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar-overlay'
import { AppHeader } from '@/components/layout/app-header'
import { DashboardPwaShell } from '@/components/pwa/dashboard-pwa-shell'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { orgId, userId } = await auth()

  if (!orgId) {
    redirect('/onboarding')
  }

  const supabase = await createClient()

  // Fetch hotel + staff in parallel — both needed for access decisions
  const [hotelResult, staffResult] = await Promise.all([
    supabase
      .from('hotels')
      .select('id, name, logo_url, slug, custom_domain, currency, status')
      .eq('clerk_org_id', orgId)
      .single(),
    userId
      ? supabase
          .from('staff_profiles')
          .select('id, is_active, role')
          .eq('clerk_user_id', userId)
          .eq('clerk_org_id', orgId)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const hotel = hotelResult.data
  const staff = staffResult.data

  // ── Hotel status gate ──────────────────────────────────────────
  // A suspended or cancelled hotel must not be usable from the dashboard.
  // Redirect to /suspended to explain the status securely.
  if (!hotel) {
    redirect('/onboarding')
  }

  if (hotel.status === 'suspended' || hotel.status === 'cancelled') {
    redirect('/suspended')
  }

  if (hotel.status === 'pending') {
    redirect('/deactivated?reason=pending')
  }

  // ── Staff active gate ──────────────────────────────────────────
  // A staff member who was deactivated should be blocked.
  // Redirect to /deactivated to show next steps.
  if (!staff || !staff.is_active) {
    redirect('/deactivated?reason=staff')
  }

  // Update last_login_at — fire-and-forget, don't await to keep layout fast
  if (userId) {
    supabase
      .from('staff_profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('clerk_user_id', userId)
      .eq('clerk_org_id', orgId);
  }

  // Fetch unread notification count
  const { count: notificationCount } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('hotel_id', hotel.id)
    .eq('is_read', false)

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        {/* Persistent collapsible sidebar */}
        <Sidebar collapsible="icon" variant="sidebar" side="left">
          <AppSidebar hotelName={hotel.name} />
          <SidebarRail />
        </Sidebar>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Fixed App Header */}
          <AppHeader
            hotelName={hotel.name}
            hotelLogoUrl={hotel.logo_url}
            hotelId={hotel.id}
            notificationCount={notificationCount ?? 0}
            bookingUrl={
              hotel.slug
                ? hotel.custom_domain
                  ? `https://${hotel.custom_domain}`
                  : `http://${process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'localhost:3000'}/${hotel.slug}`
                : undefined
            }
          />

          {/* Page Content */}
          <main className="native-scroll flex-1 pt-[calc(3rem+env(safe-area-inset-top))] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:pb-[calc(2rem+env(safe-area-inset-bottom))] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-muted/30 via-background to-background">
            <DashboardPwaShell>{children}</DashboardPwaShell>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
