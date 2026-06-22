"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  CalendarDays,
  Users,
  DoorOpen,
  BedDouble,
  LifeBuoy,
  X,
  Building2,
  Sparkles,
  Receipt,
  BarChart3,
  Settings,
} from "lucide-react";
import { DashboardIcon } from "@/components/ui/dashboard-icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";

// ── Navigation Data ────────────────────────────────────────────

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "Main",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: DashboardIcon },
      { title: "Bookings", url: "/dashboard/bookings", icon: CalendarDays },
      { title: "Calendar", url: "/dashboard/calendar", icon: CalendarDays },
      { title: "Customers", url: "/dashboard/customers", icon: Users },
    ],
  },
  {
    title: "Rooms",
    items: [
      { title: "Room Types", url: "/dashboard/rooms/types", icon: DoorOpen },
      { title: "Room Directory", url: "/dashboard/rooms/directory", icon: BedDouble },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Housekeeping", url: "/dashboard/housekeeping", icon: Sparkles },
      { title: "Billing", url: "/dashboard/billing", icon: Receipt },
    ],
  },
  {
    title: "Analytics",
    items: [
      { title: "Reports", url: "/dashboard/reports", icon: BarChart3 },
      { title: "Settings", url: "/dashboard/settings", icon: Settings },
    ],
  },
];

// ── Overlay Sidebar ────────────────────────────────────────────

export function AppSidebarOverlay({
  hotelName,
}: {
  hotelName?: string;
}) {
  const pathname = usePathname();
  const { user } = useUser();
  const { openMobile, setOpenMobile, open, setOpen } = useSidebar();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isOpen = mounted ? openMobile || open : false;
  const onClose = React.useCallback(() => {
    setOpenMobile(false);
    setOpen(false);
  }, [setOpenMobile, setOpen]);

  if (!mounted) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <SheetContent
        side="left"
        className="w-[260px] p-0 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Main navigation sidebar</SheetDescription>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-7 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0">
              <Building2 className="size-3.5 text-sidebar-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">
                {hotelName || "Hotel"}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[10px] text-sidebar-foreground/50 font-medium">
                  Online
                </span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-6 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.url;
                  return (
                    <Link
                      key={item.title}
                      href={item.url}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150",
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        isActive
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground ring-1 ring-sidebar-ring/30"
                          : "text-sidebar-foreground/70"
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border/50 p-3 space-y-2">
          <Link
            href="/support"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LifeBuoy className="size-4 shrink-0" />
            <span>Help & Support</span>
          </Link>
          <Separator className="bg-sidebar-border/30" />
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <div className="size-7 rounded-md bg-sidebar-accent flex items-center justify-center shrink-0 text-[11px] font-semibold text-sidebar-foreground">
              {user?.firstName?.[0] || "U"}
              {user?.lastName?.[0] || ""}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">
                {user?.fullName || "User"}
              </p>
              <Badge
                variant="outline"
                className="text-[9px] px-1 h-3.5 font-normal text-sidebar-foreground/50 border-sidebar-border/50 mt-0.5"
              >
                Front Desk
              </Badge>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
