import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { orgId } = await auth()
  
  if (!orgId) {
    // This is double-checked by middleware, but good for type safety
    redirect('/onboarding')
  }

  const supabase = await createClient()
  const { data: hotel } = await supabase
    .from('hotels')
    .select('name')
    .eq('clerk_org_id', orgId)
    .single()

  return (
    <SidebarProvider>
      <AppSidebar hotelName={hotel?.name} />
      <SidebarInset>
        <header className="flex h-16 items-center border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
