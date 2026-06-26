import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebarOverlay } from '@/components/layout/app-sidebar-overlay'
import { AppHeader } from '@/components/layout/app-header'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { orgId } = await auth()
  
  if (!orgId) {
    redirect('/onboarding')
  }

  const supabase = await createClient()
  const { data: hotel } = await supabase
    .from('hotels')
    .select('id, name, logo_url, slug, custom_domain, currency')
    .eq('clerk_org_id', orgId)
    .single()

  // Fetch unread notification count for this hotel
  let notificationCount = 0
  if (hotel) {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('hotel_id', hotel.id)
      .eq('is_read', false)

    notificationCount = count || 0
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full">
        {/* Overlay Sidebar */}
        <AppSidebarOverlay hotelName={hotel?.name} />
        
        {/* Main Content Area */}
        <div className="flex flex-1 flex-col">
          {/* Fixed App Header */}
          <AppHeader
            hotelName={hotel?.name}
            hotelLogoUrl={hotel?.logo_url}
            hotelId={hotel?.id}
            notificationCount={notificationCount}
            bookingUrl={hotel?.slug ? (hotel.custom_domain ? `https://${hotel.custom_domain}` : `https://${hotel.slug}.${process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'hotelosprp.com'}`) : undefined}
          />
          
          {/* Page Content (pushes below fixed header) */}
          <main className="flex-1 pt-12 px-4 pb-4 md:px-6 md:pb-6 lg:px-8 lg:pb-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
