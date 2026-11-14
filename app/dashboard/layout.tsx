import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { SidebarProvider, Sidebar } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar-overlay'
import { AppHeader } from '@/components/layout/app-header'
import { MobileTabBar } from '@/components/layout/mobile-tab-bar'
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

  // Fetch hotel + staff in parallel — hotel status is read via supabaseAdmin
  // scoped strictly to the verified Clerk orgId so deactivated/pending staff
  // (excluded from get_user_hotel_ids() per HIGH-08) route cleanly to
  // /deactivated rather than misfiring to /onboarding.
  const [hotelResult, staffResult] = await Promise.all([
    supabaseAdmin
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

  // ── Staff active + non-pending gate (`HIGH-08`) ────────────────
  if (!staff || !staff.is_active || !staff.role || staff.role === 'pending') {
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
          hotelName={hotel.name}
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
                : `${(process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'localhost:3000').startsWith('localhost') || (process.env.NEXT_PUBLIC_BASE_DOMAIN ?? '').startsWith('127.0.0.1') ? 'http' : 'https'}://${process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'localhost:3000'}/${hotel.slug}`
              : undefined
          }
        />
        <main className="native-scroll flex-1 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:pl-[max(1.5rem,env(safe-area-inset-left))] md:pr-[max(1.5rem,env(safe-area-inset-right))] md:pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:pl-8 lg:pr-8 lg:pb-8 bg-background">
          <DashboardPwaShell>{children}</DashboardPwaShell>
        </main>
        <MobileTabBar />
      </div>
    </SidebarProvider>
  )
}
