"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser, useOrganization, useClerk } from "@clerk/nextjs";
import {
  CalendarDays,
  Users,
  DoorOpen,
  BedDouble,
  LifeBuoy,
  Receipt,
  BarChart3,
  Settings,
  Shield,
  Moon,
  LayoutDashboard,
  BookOpen,
  ChevronDown,
  DollarSign,
  ChevronsUpDown,
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
} from "@/components/ui/sidebar";
import type { Selection } from "@heroui/react";
import {
  Accordion,
  Avatar,
  Chip,
  CloseButton,
  ListBox,
  Separator,
  ScrollShadow,
  Tooltip,
} from "@heroui/react";

// ── Role helpers ───────────────────────────────────────────────

function getRoleLabel(role: string | undefined | null): string {
  const map: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    front_desk: "Front Desk",
    receptionist: "Front Desk",
    manager: "Manager",
  };
  return role ? (map[role] ?? role) : "Staff";
}

function getRoleChipColor(
  role: string | undefined | null
): "accent" | "success" | "default" | "warning" | "danger" {
  switch (role) {
    case "super_admin":
    case "admin":
    case "manager":
      return "accent";
    default:
      return "default";
  }
}

// ── Nav structure ──────────────────────────────────────────────

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
      { title: "Reservations", url: "/dashboard/bookings", icon: BookOpen },
      { title: "Calendar", url: "/dashboard/calendar", icon: CalendarDays },
      { title: "Guests", url: "/dashboard/customers", icon: Users },
    ],
  },
  {
    title: "Rooms",
    items: [
      { title: "Room Types", url: "/dashboard/rooms/types", icon: DoorOpen },
      { title: "Directory", url: "/dashboard/rooms/directory", icon: BedDouble },
      { title: "Inventory", url: "/dashboard/availability", icon: DollarSign },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Night Audit", url: "/dashboard/night-audit", icon: Moon },
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

const LIST_ITEM_CLASS =
  "rounded-md px-2.5 py-2 text-sm outline-hidden transition-[color,background-color] duration-150 ring-sidebar-ring ring-inset focus-visible:ring-2 data-[hovered=true]:bg-sidebar-foreground/10 data-[hovered=true]:text-sidebar-foreground data-[selected=true]:bg-sidebar-foreground/10 data-[selected=true]:font-medium data-[selected=true]:text-sidebar-foreground";

interface ProcessedGroup extends NavGroup {
  leafItems: NavItem[];
  accordionItems: NavItem[];
}

const processedGroups: ProcessedGroup[] = navGroups.map((g) => ({
  ...g,
  leafItems: g.items.filter((i) => !i.subItems),
  accordionItems: g.items.filter((i) => i.subItems),
}));

// ── Accordion nav item ─────────────────────────────────────────

function AccordionNavItem({
  item,
  pathname,
  onNavClick,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  onNavClick: () => void;
  collapsed: boolean;
}) {
  const anySubActive = item.subItems?.some((s) => pathname === s.url) ?? false;
  const defaultExpanded = anySubActive
    ? new Set<string>([item.title])
    : new Set<string>();

  if (collapsed) {
    return (
      <Tooltip delay={500} closeDelay={0}>
        <Tooltip.Trigger>
          <button
            type="button"
            aria-label={item.title}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              "text-sidebar-foreground/70 outline-hidden transition-[color,background-color] duration-150",
              "ring-sidebar-ring focus-visible:ring-2",
              "hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground",
              anySubActive && "bg-sidebar-foreground/10 text-sidebar-foreground font-medium"
            )}
          >
            <item.icon className="size-4 shrink-0" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="right" showArrow className="text-xs font-medium">
          {item.title}
        </Tooltip.Content>
      </Tooltip>
    );
  }

  return (
    <Accordion
      defaultExpandedKeys={defaultExpanded}
      hideSeparator
      className="w-full bg-transparent"
    >
      <Accordion.Item id={item.title} className="border-0">
        <Accordion.Heading>
          <Accordion.Trigger
            className={cn(
              "flex w-full items-center gap-2 overflow-hidden rounded-md px-2.5 py-2 text-left text-sm",
              "outline-hidden transition-[width,height,padding,color,background-color,transform] duration-150",
              "ring-sidebar-ring ring-inset focus-visible:ring-2",
              anySubActive
                ? "bg-sidebar-foreground/10 font-medium text-sidebar-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground",
              "active:scale-[0.98]",
              "[&_svg]:size-4 [&_svg]:shrink-0"
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="flex-1 truncate">{item.title}</span>
            <Accordion.Indicator className="text-sidebar-foreground/40">
              <ChevronDown className="size-3 transition-transform duration-150" />
            </Accordion.Indicator>
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            <div className="ml-3 flex flex-col gap-0.5 border-l border-sidebar-border px-2.5">
              {item.subItems!.map((sub) => {
                const subActive = pathname === sub.url;
                return (
                  <Link
                    key={sub.url}
                    href={sub.url}
                    onClick={onNavClick}
                    className={cn(
                      "flex h-7 items-center gap-2 rounded-md px-2 text-sm",
                      "outline-hidden transition-[color,background-color] duration-150",
                      "ring-sidebar-ring ring-inset focus-visible:ring-2",
                      subActive
                        ? "bg-sidebar-foreground/10 font-medium text-sidebar-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground"
                    )}
                  >
                    <span className="truncate">{sub.title}</span>
                  </Link>
                );
              })}
            </div>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

// ── User card (shown in sidebar footer) ────────────────────────
// Clicking opens Clerk's default UserProfile modal

function SidebarUserCard({
  user,
  userInitials,
  roleLabel,
  roleChipColor,
  isCollapsed,
  openUserProfile,
}: {
  user: ReturnType<typeof useUser>["user"];
  userInitials: string;
  roleLabel: string;
  roleChipColor: "accent" | "success" | "default" | "warning" | "danger";
  isCollapsed: boolean;
  openUserProfile: () => void;
}) {
  if (isCollapsed) {
    return (
      <Tooltip delay={500} closeDelay={0}>
        <Tooltip.Trigger>
          <button
            type="button"
            aria-label="Open user profile"
            onClick={openUserProfile}
            className="flex items-center justify-center outline-hidden border-0 bg-transparent cursor-pointer rounded-lg hover:bg-sidebar-foreground/10 transition-colors p-1"
          >
            <SidebarAvatar user={user} userInitials={userInitials} size="sm" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="right" showArrow className="text-xs font-medium">
          {user?.fullName ?? "Account"} — Manage profile
        </Tooltip.Content>
      </Tooltip>
    );
  }

  return (
    <button
      type="button"
      aria-label="Open user profile"
      onClick={openUserProfile}
      className={cn(
        "w-full flex items-center gap-2.5 px-2 py-2 rounded-lg border-0 bg-transparent",
        "cursor-pointer outline-hidden",
        "transition-[background-color] duration-150",
        "hover:bg-sidebar-foreground/10",
        "active:bg-sidebar-foreground/10"
      )}
    >
      <SidebarAvatar user={user} userInitials={userInitials} size="sm" />
      <div className="min-w-0 flex-1 text-left">
        <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
          {user?.fullName ?? "Staff Member"}
        </p>
        <Chip
          size="sm"
          variant="soft"
          color={roleChipColor}
          className="mt-0.5 h-[18px] px-1.5 text-[10px] font-medium leading-none"
        >
          {roleLabel}
        </Chip>
      </div>
      <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/40" />
    </button>
  );
}

// ── AppSidebar ─────────────────────────────────────────────────

export function AppSidebar({ hotelName }: { hotelName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { membership } = useOrganization();
  const { isMobile, setOpenMobile, setOpen, state } = useSidebar();
  const { openUserProfile } = useClerk();

  const isCollapsed = !isMobile && state === "collapsed";
  const selectedKeys = React.useMemo(() => new Set([pathname]), [pathname]);

  const prevPathname = React.useRef(pathname);
  const lastNavRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (prevPathname.current !== pathname) {
      lastNavRef.current = pathname;
      setOpen(false);
      setOpenMobile(false);
      prevPathname.current = pathname;
    }
  }, [pathname, setOpen, setOpenMobile]);

  const handleNavClick = React.useCallback(() => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  }, [isMobile, setOpen, setOpenMobile]);

  const navigateTo = React.useCallback(
    (url: string) => {
      if (url === lastNavRef.current) return;
      lastNavRef.current = url;
      router.push(url);
      handleNavClick();
    },
    [router, handleNavClick]
  );

  const handleSelectionChange = React.useCallback(
    (keys: Selection) => {
      if (keys === "all") return;
      const key = [...keys][0] as string | undefined;
      if (key) navigateTo(key);
    },
    [navigateTo]
  );

  const clerkRole = membership?.role ?? null;
  const role = clerkRole?.replace(/^org:/, "") ?? null;
  const roleLabel = getRoleLabel(role);
  const roleChipColor = getRoleChipColor(role);

  const userInitials =
    ([user?.firstName?.[0], user?.lastName?.[0]])
      .filter(Boolean)
      .join("")
      .toUpperCase() || "U";

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <SidebarHeader className="px-3 py-3.5 border-b border-sidebar-border/50">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigateTo("/dashboard/settings/hotel")}
            title="Hotel settings"
            className="flex items-center gap-2.5 min-w-0 text-left group cursor-pointer outline-none rounded-lg p-0.5"
          >
            <div className="size-8 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0 ring-1 ring-sidebar-border/40 group-hover:bg-sidebar-foreground/10 transition-colors">
              <LayoutDashboard className="size-3.5 text-sidebar-foreground/70" />
            </div>
            <div
              className={cn(
                "min-w-0 transition-[opacity,width] duration-200",
                isCollapsed && "hidden"
              )}
            >
              <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight group-hover:text-sidebar-foreground/80">
                {hotelName ?? "Hotel"}
              </p>
              <p className="text-[10px] text-sidebar-foreground/40 truncate leading-tight mt-0.5">
                RoomLine
              </p>
            </div>
          </button>
          <CloseButton
            onPress={() => {
              setOpen(false);
              setOpenMobile(false);
            }}
            aria-label="Close navigation"
            className={cn(
              "shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground",
              "data-[hovered=true]:text-sidebar-foreground data-[hovered=true]:bg-sidebar-foreground/10",
              "transition-[color,background-color] duration-150",
              isCollapsed && "hidden"
            )}
          />
        </div>
      </SidebarHeader>

      {/* ── Navigation ─────────────────────────────────────── */}
      <SidebarContent className={cn("px-2 py-2", isCollapsed && "px-1")}>
        <ScrollShadow
          orientation="vertical"
          size={20}
          className="h-full"
          style={{
            // Override heroui-background so the fade gradient matches
            // the sidebar background instead of the page background
            "--heroui-background": "hsl(var(--sidebar))",
          } as React.CSSProperties}
        >
          {isCollapsed ? (
            /* Collapsed: icon-only buttons with tooltips */
            <div className="flex flex-col items-center gap-1">
              {processedGroups.flatMap((group) =>
                group.items.map((item) =>
                  item.subItems ? (
                    <AccordionNavItem
                      key={item.url}
                      item={item}
                      pathname={pathname}
                      onNavClick={handleNavClick}
                      collapsed
                    />
                  ) : (
                    <Tooltip key={item.url} delay={500} closeDelay={0}>
                      <Tooltip.Trigger>
                        <button
                          type="button"
                          aria-label={item.title}
                          onClick={() => navigateTo(item.url)}
                          className={cn(
                            "flex size-8 items-center justify-center rounded-lg",
                            "text-sidebar-foreground/70 outline-hidden transition-[color,background-color] duration-150",
                            "ring-sidebar-ring focus-visible:ring-2",
                            "hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground",
                            pathname === item.url &&
                              "bg-sidebar-foreground/10 text-sidebar-foreground font-medium"
                          )}
                        >
                          <item.icon className="size-4 shrink-0" />
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Content
                        placement="right"
                        showArrow
                        className="text-xs font-medium"
                      >
                        {item.title}
                      </Tooltip.Content>
                    </Tooltip>
                  )
                )
              )}
            </div>
          ) : (
            /* Expanded: HeroUI ListBox per group */
            processedGroups.map((group) => (
              <SidebarGroup key={group.title}>
                <SidebarGroupLabel className="px-2 text-label font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                  {group.title}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  {group.leafItems.length > 0 && (
                    <ListBox
                      selectionMode="single"
                      selectedKeys={selectedKeys}
                      onSelectionChange={handleSelectionChange}
                      className="w-full bg-transparent"
                      aria-label={group.title}
                    >
                      {group.leafItems.map((item) => (
                        <ListBox.Item
                          key={item.url}
                          id={item.url}
                          textValue={item.title}
                          className={LIST_ITEM_CLASS}
                        >
                          <item.icon className="size-4 shrink-0" />
                          <span className="flex-1 truncate text-sm">{item.title}</span>
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  )}
                  {group.accordionItems.map((item) => (
                    <AccordionNavItem
                      key={item.url}
                      item={item}
                      pathname={pathname}
                      onNavClick={handleNavClick}
                      collapsed={false}
                    />
                  ))}
                </SidebarGroupContent>
              </SidebarGroup>
            ))
          )}
        </ScrollShadow>
      </SidebarContent>

      {/* ── Footer ─────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border/50 p-3 gap-1">
        {/* Help & Support link */}
        {isCollapsed ? (
          <Tooltip delay={500} closeDelay={0}>
            <Tooltip.Trigger>
              <button
                type="button"
                aria-label="Help & Support"
                onClick={() => navigateTo("/support")}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg mx-auto",
                  "text-sidebar-foreground/70 outline-hidden transition-[color,background-color] duration-150",
                  "ring-sidebar-ring focus-visible:ring-2",
                  "hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground",
                  pathname === "/support" &&
                    "bg-sidebar-foreground/10 text-sidebar-foreground font-medium"
                )}
              >
                <LifeBuoy className="size-4 shrink-0" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="right" showArrow className="text-xs font-medium">
              Help & Support
            </Tooltip.Content>
          </Tooltip>
        ) : (
          <ListBox
            selectionMode="single"
            selectedKeys={selectedKeys}
            onSelectionChange={handleSelectionChange}
            className="w-full bg-transparent"
            aria-label="Help & Support"
          >
            <ListBox.Item
              id="/support"
              textValue="Help & Support"
              className={LIST_ITEM_CLASS}
            >
              <LifeBuoy className="size-4 shrink-0" />
              <span className="flex-1 truncate text-sm">Help & Support</span>
            </ListBox.Item>
          </ListBox>
        )}

        <Separator className="bg-sidebar-border/50" />

        {/* User card — clicks open Clerk's default UserProfile modal */}
        <SidebarUserCard
          user={user}
          userInitials={userInitials}
          roleLabel={roleLabel}
          roleChipColor={roleChipColor}
          isCollapsed={isCollapsed}
          openUserProfile={openUserProfile}
        />
      </SidebarFooter>
    </>
  );
}

// ── Avatar helper ──────────────────────────────────────────────

function SidebarAvatar({
  user,
  userInitials,
  size = "sm",
}: {
  user: { imageUrl?: string | null; fullName?: string | null } | undefined | null;
  userInitials?: string;
  size?: "sm" | "md" | "lg";
}) {
  if (user?.imageUrl) {
    return (
      <Avatar size={size} className="rounded-lg shrink-0">
        <Avatar.Image
          src={user.imageUrl}
          alt={user.fullName ?? "User avatar"}
          className="rounded-lg"
        />
        <Avatar.Fallback className="rounded-lg bg-sidebar-accent text-sidebar-foreground text-xs font-semibold">
          {userInitials ?? "U"}
        </Avatar.Fallback>
      </Avatar>
    );
  }
  return (
    <div className="size-8 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0 text-xs font-semibold text-sidebar-foreground ring-1 ring-sidebar-border/30">
      {userInitials ?? "U"}
    </div>
  );
}
