"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useOrganization } from "@clerk/nextjs";
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
  Shield,
  LayoutDashboard,
  BookOpen,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarSeparator,
} from "@/components/ui/sidebar";

// ── Role display helpers ───────────────────────────────────────

function getRoleLabel(role: string | undefined | null): string {
  const roleMap: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    front_desk: "Front Desk",
    housekeeping: "Housekeeping",
    receptionist: "Front Desk",
    manager: "Manager",
  };
  return role ? (roleMap[role] ?? role) : "Staff";
}

function getRoleBadgeClass(role: string | undefined | null): string {
  switch (role) {
    case "super_admin":
      return "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800";
    case "admin":
    case "manager":
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800";
    case "housekeeping":
      return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
    default:
      return "bg-muted/60 text-muted-foreground border-border/60";
  }
}

// ── Navigation structure ───────────────────────────────────────

interface NavSubItem {
  title: string;
  url: string;
}

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  subItems?: NavSubItem[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "Main",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Bookings", url: "/dashboard/bookings", icon: BookOpen },
      {
        title: "Calendar",
        url: "/dashboard/calendar",
        icon: CalendarDays,
        subItems: [
          { title: "Timeline", url: "/dashboard/calendar" },
          { title: "Availability", url: "/dashboard/availability" },
        ],
      },
      { title: "Guests", url: "/dashboard/customers", icon: Users },
    ],
  },
  {
    title: "Rooms",
    items: [
      { title: "Room Types", url: "/dashboard/rooms/types", icon: DoorOpen },
      { title: "Directory", url: "/dashboard/rooms/directory", icon: BedDouble },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Housekeeping", url: "/dashboard/housekeeping", icon: Sparkles },
      { title: "Billing", url: "/dashboard/billing", icon: Receipt },
      { title: "Staff", url: "/dashboard/staff", icon: Shield },
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

// ── Collapsible Nav Item (parent with sub-items) ───────────────

function CollapsibleNavItem({
  item,
  pathname,
  onNavClick,
}: {
  item: NavItem;
  pathname: string;
  onNavClick: () => void;
}) {
  const anySubActive = item.subItems?.some((s) => pathname === s.url) ?? false;
  const [expanded, setExpanded] = React.useState(anySubActive);

  React.useEffect(() => {
    if (anySubActive) setExpanded(true);
  }, [anySubActive]);

  return (
    <div>
      <SidebarMenuButton
        isActive={anySubActive}
        tooltip={item.title}
        onClick={() => setExpanded((p) => !p)}
        className={cn(
          "group-data-[collapsible=icon]:justify-center"
        )}
      >
        <item.icon className="size-4 shrink-0" />
        <span className="flex-1 truncate">{item.title}</span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-sidebar-foreground/40 transition-transform duration-150",
            expanded ? "rotate-0" : "-rotate-90",
            "group-data-[collapsible=icon]:hidden"
          )}
        />
      </SidebarMenuButton>

      {expanded && (
        <SidebarMenuSub>
          {item.subItems!.map((sub) => {
            const subActive = pathname === sub.url;
            return (
              <SidebarMenuSubItem key={sub.url}>
                <SidebarMenuSubButton
                  isActive={subActive}
                  render={<Link href={sub.url} onClick={onNavClick} />}
                >
                  <span>{sub.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      )}
    </div>
  );
}

// ── Leaf Nav Item (direct link) ───────────────────────────────

function LeafNavItem({
  item,
  pathname,
  onNavClick,
}: {
  item: NavItem;
  pathname: string;
  onNavClick: () => void;
}) {
  const isActive = pathname === item.url;
  return (
    <SidebarMenuButton
      isActive={isActive}
      tooltip={item.title}
      render={<Link href={item.url} onClick={onNavClick} />}
      className={cn(
        "group-data-[collapsible=icon]:justify-center"
      )}
    >
      <item.icon className="size-4 shrink-0" />
      <span className="truncate">{item.title}</span>
    </SidebarMenuButton>
  );
}

// ── AppSidebar ─────────────────────────────────────────────────

export function AppSidebar({ hotelName }: { hotelName?: string }) {
  const pathname = usePathname();
  const { user } = useUser();
  const { membership } = useOrganization();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleNavClick = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const clerkRole = membership?.role ?? null;
  const role = clerkRole?.replace(/^org:/, "") ?? null;
  const roleLabel = getRoleLabel(role);
  const roleBadgeClass = getRoleBadgeClass(role);

  const userInitials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "U";

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <SidebarHeader className="px-3 py-3.5 border-b border-sidebar-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0 ring-1 ring-sidebar-border/40">
              <Building2 className="size-3.5 text-sidebar-foreground/70" />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">
                {hotelName ?? "Hotel"}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-caption text-sidebar-foreground/50 font-medium">
                  Online
                </span>
              </div>
            </div>
          </div>

          {/* Close — mobile only */}
          {isMobile && (
            <button
              type="button"
              onClick={() => setOpenMobile(false)}
              aria-label="Close navigation"
              className="size-8 rounded-lg flex items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </SidebarHeader>

      {/* ── Navigation ─────────────────────────────────────── */}
      <SidebarContent className="px-2 py-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel className="px-2 text-label font-semibold uppercase tracking-widest text-sidebar-foreground/50">
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    {item.subItems ? (
                      <CollapsibleNavItem
                        item={item}
                        pathname={pathname}
                        onNavClick={handleNavClick}
                      />
                    ) : (
                      <LeafNavItem
                        item={item}
                        pathname={pathname}
                        onNavClick={handleNavClick}
                      />
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ── Footer ─────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border/50 p-3">
        <SidebarMenu>
          {/* Help & Support — always visible */}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Help & Support"
              render={
                <Link
                  href="/support"
                  onClick={handleNavClick}
                />
              }
              className="group-data-[collapsible=icon]:justify-center"
            >
              <LifeBuoy className="size-4 shrink-0" />
              <span className="truncate">Help & Support</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-2" />

        {/* User identity */}
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg group-data-[collapsible=icon]:justify-center">
          <div className="size-8 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0 text-xs font-semibold text-sidebar-foreground ring-1 ring-sidebar-border/30 shrink-0">
            {user?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt={user.fullName ?? "User avatar"}
                className="size-8 rounded-lg object-cover"
              />
            ) : (
              userInitials
            )}
          </div>

          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
              {user?.fullName ?? "Staff Member"}
            </p>
            <span
              className={cn(
                "inline-block mt-0.5 px-1.5 py-0.5 rounded-md border text-caption font-medium leading-none",
                roleBadgeClass
              )}
            >
              {roleLabel}
            </span>
          </div>
        </div>
      </SidebarFooter>
    </>
  );
}
