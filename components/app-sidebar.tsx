"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { OrganizationSwitcher, UserButton, useUser } from "@clerk/nextjs"
import {
  LayoutDashboard,
  CalendarDays,
  ConciergeBell,
  BedDouble,
  Hotel,
  Users,
  BarChart3,
  UserCog,
  Settings,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  navMain: [
    {
      title: "Overview",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: "Operations",
      items: [
        {
          title: "Reservations",
          url: "/dashboard/reservations",
          icon: CalendarDays,
        },
        {
          title: "Front Desk",
          url: "/dashboard/front-desk",
          icon: ConciergeBell,
        },
        {
          title: "Housekeeping",
          url: "/dashboard/housekeeping",
          icon: BedDouble,
        },
      ],
    },
    {
      title: "Management",
      items: [
        {
          title: "Rooms",
          url: "/dashboard/rooms",
          icon: Hotel,
        },
        {
          title: "Guests",
          url: "/dashboard/guests",
          icon: Users,
        },
        {
          title: "Reports",
          url: "/dashboard/reports",
          icon: BarChart3,
        },
      ],
    },
    {
      title: "Settings",
      items: [
        {
          title: "Staff",
          url: "/dashboard/staff",
          icon: UserCog,
        },
        {
          title: "Settings",
          url: "/dashboard/settings",
          icon: Settings,
        },
      ],
    },
  ],
}

export function AppSidebar({ hotelName, ...props }: React.ComponentProps<typeof Sidebar> & { hotelName?: string }) {
  const pathname = usePathname()
  const { user } = useUser()

  return (
    <Sidebar {...props}>
      <SidebarHeader className="p-4">
        <OrganizationSwitcher
          hidePersonal={true}
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/onboarding"
          appearance={{
            elements: {
              rootBox: "w-full",
              organizationSwitcherTrigger:
                "w-full justify-between px-3 py-2 rounded-md text-sm border border-sidebar-border bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground",
            },
          }}
        />
      </SidebarHeader>
      <SidebarContent>
        {data.navMain.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton render={<a href={item.url} />} isActive={pathname === item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
              },
            }}
          />
          {user && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate text-sidebar-foreground">
                {user.fullName || user.firstName || "User"}
              </span>
              <span className="text-xs text-sidebar-foreground/70 truncate">
                {user.primaryEmailAddress?.emailAddress}
              </span>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
