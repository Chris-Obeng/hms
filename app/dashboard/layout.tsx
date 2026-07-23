import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { SidebarProvider, Sidebar } from '@/components/ui/sidebar'
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
  if (!staff || !staff.is_active) {
    redirect('/deactivated?reason=staff')
  }

  // Update last_login_at — fire-and-forget
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
    <SidebarProvider defaultOpen={false}>
      {/* Overlay sidebar — floats above content, no layout shift */}
      <Sidebar side="left">
        <AppSidebar hotelName={hotel.name} />
      </Sidebar>

      {/* Full-width content — never shrinks */}
      <div className="flex min-h-screen w-full flex-col">
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
        <main className="native-scroll flex-1 pt-14 px-4 pb-4 md:px-6 md:pb-6 lg:px-8 lg:pb-8 bg-background">
          <DashboardPwaShell>{children}</DashboardPwaShell>
        </main>
      </div>
    </SidebarProvider>
  )
}
