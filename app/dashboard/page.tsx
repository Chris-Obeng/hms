import { currentUser } from '@clerk/nextjs/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BedDouble, LogIn, LogOut, TrendingUp, Inbox, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

export default async function DashboardHomePage() {
  const user = await currentUser()
  const firstName = user?.firstName || 'User'
  
  const currentHour = new Date().getHours()
  let greeting = 'Good evening'
  if (currentHour < 12) greeting = 'Good morning'
  else if (currentHour < 18) greeting = 'Good afternoon'

  const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
  const formattedDate = new Date().toLocaleDateString('en-GB', dateOptions)

  const { orgId } = await auth()
  const supabase = await createClient()
  const { data: hotel } = await supabase
    .from('hotels')
    .select('name')
    .eq('clerk_org_id', orgId!)
    .single()

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{greeting}, {firstName}</h1>
        <p className="text-muted-foreground mt-1">
          {hotel?.name} &bull; {formattedDate}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TODO: replace with real data */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Today</CardTitle>
            <BedDouble className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0 / 0 rooms</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <Badge variant="secondary" className="px-1 text-[10px]">0%</Badge>
              Total capacity
            </p>
          </CardContent>
        </Card>

        {/* TODO: replace with real data */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Check-ins Today</CardTitle>
            <LogIn className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">
              Expected arrivals
            </p>
          </CardContent>
        </Card>

        {/* TODO: replace with real data */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Check-outs Today</CardTitle>
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">
              Expected departures
            </p>
          </CardContent>
        </Card>

        {/* TODO: replace with real data */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">GH₵ 0.00</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total daily revenue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="outline" className="justify-start">
          <Plus className="mr-2 h-4 w-4" />
          New Reservation
        </Button>
        <Button variant="outline" className="justify-start">
          <LogIn className="mr-2 h-4 w-4" />
          Check In Guest
        </Button>
        <Button variant="outline" className="justify-start">
          <LogOut className="mr-2 h-4 w-4" />
          Check Out Guest
        </Button>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No recent activity</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Reservations, check-ins, and updates will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
