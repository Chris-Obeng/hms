import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { SidebarProvider, Sidebar } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar-overlay'
import { AppHeader } from '@/components/layout/app-header'
import { DashboardPwaShell } from '@/components/pwa/dashboard-pwa-shell'
import { SentryStaffContext } from '@/components/observability/sentry-staff-context'
import { identifyStaff } from '@/lib/observability/sentry'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

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

  // Tenant scope for anything this request reports to Sentry. Ids and role only.
  identifyStaff({
    staffId: staff.id,
    userId,
    role: staff.role,
    hotelId: hotel.id,
    orgId,
  })

  // Update last_login_at — fire-and-forget
  if (userId) {
    supabase
      .from('staff_profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('clerk_user_id', userId)
      .eq('clerk_org_id', orgId);
  }

  // Header needs a small, stable data set for global reservation creation.
  const [notificationResult, roomTypesResult] = await Promise.all([
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('hotel_id', hotel.id)
      .eq('is_read', false)
      .is('archived_at', null)
      .or(`recipient_staff_id.eq.${staff.id},recipient_staff_id.is.null`),
    supabase
      .from('room_types')
      .select('id, name, base_price')
      .eq('hotel_id', hotel.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])

  const notificationCount = notificationResult.count
  const roomTypes = roomTypesResult.data ?? []

  return (
    <SidebarProvider defaultOpen={false}>
      {/* Same tenant scope as identifyStaff above, for browser-side events */}
      <SentryStaffContext
        hotelId={hotel.id}
        orgId={orgId}
        staffId={staff.id}
        role={staff.role}
      />

      {/* Overlay sidebar — floats above content, no layout shift */}
      <Sidebar side="left">
        <AppSidebar />
      </Sidebar>

      {/* Full-width content — never shrinks */}
      <div className="flex min-h-screen w-full flex-col">
        <AppHeader
          hotelId={hotel.id}
          staffId={staff.id}
          notificationCount={notificationCount ?? 0}
          roomTypes={roomTypes.map((roomType) => ({
            id: roomType.id,
            name: roomType.name,
            base_price: roomType.base_price ?? 0,
          }))}
          currency={hotel.currency || "GHS"}
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
