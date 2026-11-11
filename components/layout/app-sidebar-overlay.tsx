"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser, useOrganization, useClerk } from "@clerk/nextjs";
import {
  Users,
  LifeBuoy,
  BarChart3,
  CreditCard,
  Clock,
  Settings,
  LayoutDashboard,
  ClipboardList,
  ChevronsUpDown,
  ChevronDown,
  CalendarRange,
  CalendarDays,
  BedDouble,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import type { Selection } from "@heroui/react";
import {
  Avatar,
  Chip,
  CloseButton,
  ListBox,
  ScrollShadow,
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

// The Settings entry expands in place instead of navigating to a hub page.
const SETTINGS_KEY = "/dashboard/settings";

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
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Reservations", url: "/dashboard/bookings", icon: ClipboardList },
      { title: "Calendar", url: "/dashboard/calendar", icon: CalendarDays },
      { title: "Availability", url: "/dashboard/availability", icon: CalendarRange },
      { title: "Rooms", url: "/dashboard/rooms", icon: BedDouble },
      { title: "Guests", url: "/dashboard/customers", icon: Users },
      { title: "Payments", url: "/dashboard/payments", icon: CreditCard },
    ],
  },
  {
    title: "Insights",
    items: [
      { title: "Business Intelligence", url: "/dashboard/reports", icon: BarChart3 },
      { title: "Night audit", url: "/dashboard/night-audit", icon: Clock },
    ],
  },
  {
    title: "Settings",
    items: [
      { title: "Settings", url: SETTINGS_KEY, icon: Settings },
      { title: "Support", url: "/support", icon: LifeBuoy },
    ],
  },
];

// Resting / hover / selected states for a nav row. One filled pill marks the
// active route; the icon takes the brand color only while selected.
const ITEM_CLASS =
  "flex h-9 items-center gap-3 rounded-lg px-2 text-sm font-medium text-sidebar-foreground/75 outline-hidden cursor-pointer select-none transition-[background-color,color] duration-150 ring-sidebar-ring ring-inset focus-visible:ring-2 data-[hovered=true]:bg-sidebar-foreground/[0.055] data-[hovered=true]:text-sidebar-foreground data-[selected=true]:bg-sidebar-accent data-[selected=true]:font-medium data-[selected=true]:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-sidebar-foreground/55 [&_svg]:transition-colors data-[hovered=true]:[&_svg]:text-sidebar-foreground data-[selected=true]:[&_svg]:text-sidebar-primary";

// Child rows sit under their parent, quieter and smaller; the pill still marks
// the active destination.
const CHILD_ITEM_CLASS =
  "flex h-8 cursor-pointer select-none items-center rounded-lg pl-9 pr-2 text-[13px] font-normal text-sidebar-foreground/60 outline-hidden ring-sidebar-ring ring-inset transition-[background-color,color] duration-150 focus-visible:ring-2 data-[hovered=true]:bg-sidebar-foreground/[0.055] data-[hovered=true]:text-sidebar-foreground data-[selected=true]:bg-sidebar-accent data-[selected=true]:font-medium data-[selected=true]:text-sidebar-accent-foreground";

const SETTINGS_CHILDREN: { title: string; url: string; match: (pathname: string) => boolean }[] = [
  {
    title: "Hotel profile",
    url: "/dashboard/settings/hotel",
    match: (p) => p.startsWith("/dashboard/settings/hotel"),
  },
  {
    title: "Notifications",
    url: "/dashboard/settings/notifications",
    match: (p) => p === "/dashboard/settings/notifications",
  },
  {
    title: "Guest emails",
    url: "/dashboard/settings/notifications#message-templates",
    match: () => false, // shares the Notifications path; the hash decides in-page
  },
  { title: "Payments", url: "/dashboard/payments?tab=setup", match: () => false },
  { title: "Staff", url: "/dashboard/staff", match: (p) => p.startsWith("/dashboard/staff") },
  {
    title: "Audit log",
    url: "/dashboard/settings/audit-log",
    match: (p) => p.startsWith("/dashboard/settings/audit-log"),
  },
];

// Group label per the design: a small quiet title above each nav cluster,
// with a hairline divider between clusters.
const GROUP_TITLE_CLASS =
  "px-2 pb-1 pt-3 text-xs font-medium text-sidebar-foreground/45 first:pt-1";
const GROUP_DIVIDER_CLASS = "mx-2 my-1 h-px bg-sidebar-border/60";

// ── AppSidebar ─────────────────────────────────────────────────

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { membership } = useOrganization();
  const { isMobile, setOpenMobile, setOpen } = useSidebar();
  const { openUserProfile } = useClerk();

  // Sub-routes keep their parent entry lit (the pill marks the destination).
  const activePath = React.useMemo(() => {
    if (pathname.startsWith("/dashboard/rooms/")) return "/dashboard/rooms";
    const child = SETTINGS_CHILDREN.find((c) => c.match(pathname));
    if (child) return child.url;
    return pathname;
  }, [pathname]);
  const selectedKeys = React.useMemo(() => new Set([activePath]), [activePath]);

  // Settings children stay hidden until Settings is opened, and open by
  // themselves when the user is already somewhere inside that section.
  const insideSettings = React.useMemo(() => {
    if (pathname.startsWith("/dashboard/settings")) return true;
    return SETTINGS_CHILDREN.some((c) => c.match(pathname));
  }, [pathname]);
  // Expanded by default inside that section; a click stores an explicit choice
  // for the current route so it survives re-renders but not navigation.
  const [settingsToggle, setSettingsToggle] = React.useState<{ path: string; open: boolean } | null>(
    null
  );
  const settingsOpen =
    settingsToggle?.path === pathname ? settingsToggle.open : insideSettings;

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

  const navigateTo = React.useCallback(
    (url: string) => {
      if (url === lastNavRef.current) return;
      lastNavRef.current = url;
      router.push(url);
      if (isMobile) setOpenMobile(false);
      else setOpen(false);
    },
    [router, isMobile, setOpen, setOpenMobile]
  );

  const handleSelectionChange = React.useCallback(
    (keys: Selection) => {
      if (keys === "all") return;
      const key = [...keys][0] as string | undefined;
      if (!key) return;
      if (key === SETTINGS_KEY) {
        if (!settingsOpen) setSettingsToggle({ path: pathname, open: true });
        navigateTo("/dashboard/settings/hotel");
        return;
      }
      navigateTo(key);
    },
    [navigateTo, settingsOpen, pathname]
  );

  // React Aria fires onAction even for an already-selected row, which is what
  // lets a second click on Settings collapse the tree again.
  const handleAction = React.useCallback(
    (key: React.Key) => {
      if (key !== SETTINGS_KEY) return;
      setSettingsToggle({ path: pathname, open: !settingsOpen });
    },
    [pathname, settingsOpen]
  );

  const clerkRole = membership?.role ?? null;
  const role = clerkRole?.replace(/^org:/, "") ?? null;
  const roleLabel = getRoleLabel(role);
  const roleChipColor = getRoleChipColor(role);

  const userInitials =
    [user?.firstName?.[0], user?.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "U";

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <SidebarHeader className="h-14 flex-row items-center justify-between border-b border-sidebar-border/60 px-3 py-0">
        <button
          type="button"
          onClick={() => navigateTo("/dashboard/settings/hotel")}
          title="Hotel settings"
          aria-label="Hotel settings"
          className="group flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 text-left outline-hidden ring-sidebar-ring focus-visible:ring-2"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-black/5">
            <span className="text-sm font-bold leading-none">R</span>
          </span>
          <span className="truncate text-[15px] font-semibold leading-tight tracking-tight text-sidebar-foreground transition-colors group-hover:text-sidebar-foreground/75">
            RoomLine
          </span>
        </button>
        <CloseButton
          onPress={() => {
            setOpen(false);
            setOpenMobile(false);
          }}
          aria-label="Close navigation"
          className="shrink-0 text-sidebar-foreground/40 transition-[color,background-color] duration-150 data-[hovered=true]:bg-sidebar-foreground/10 data-[hovered=true]:text-sidebar-foreground"
        />
      </SidebarHeader>

      {/* ── Navigation ─────────────────────────────────────── */}
      <SidebarContent className="px-2 py-2">
        <ScrollShadow
          orientation="vertical"
          size={20}
          className="h-full"
          style={
            {
              "--heroui-background": "hsl(var(--sidebar))",
            } as React.CSSProperties
          }
        >
          {navGroups.map((group, g) => <React.Fragment key={group.title}>
            {g > 0 && <div className={GROUP_DIVIDER_CLASS} role="presentation" />}
            <p className={GROUP_TITLE_CLASS}>{group.title}</p>
            <ListBox
              selectionMode="single"
              selectedKeys={selectedKeys}
              onSelectionChange={handleSelectionChange}
              onAction={handleAction}
              className="w-full bg-transparent p-0"
              aria-label={`${group.title} navigation`}
            >
              {group.items.map((item) => (
                <React.Fragment key={item.url}>
                  <ListBox.Item
                    key={item.url}
                    id={item.url}
                    textValue={item.title}
                    className={ITEM_CLASS}
                  >
                    <item.icon />
                    <span className="flex-1 truncate">{item.title}</span>
                    {item.url === SETTINGS_KEY && (
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "size-3.5! shrink-0 text-sidebar-foreground/40 transition-transform duration-150",
                          settingsOpen && "rotate-180"
                        )}
                      />
                    )}
                  </ListBox.Item>
                  {item.url === SETTINGS_KEY && settingsOpen &&
                    SETTINGS_CHILDREN.map((child) => (
                      <ListBox.Item
                        key={child.url}
                        id={child.url}
                        textValue={child.title}
                        className={CHILD_ITEM_CLASS}
                      >
                        <span className="truncate">{child.title}</span>
                      </ListBox.Item>
                    ))}
                </React.Fragment>
              ))}
            </ListBox>
          </React.Fragment>)}
        </ScrollShadow>
      </SidebarContent>

      {/* ── Footer ─────────────────────────────────────────── */}
      <SidebarFooter className="gap-1 border-t border-sidebar-border/60 p-2">
        <SidebarUserCard
          user={user}
          userInitials={userInitials}
          roleLabel={roleLabel}
          roleChipColor={roleChipColor}
          openUserProfile={openUserProfile}
        />
      </SidebarFooter>
    </>
  );
}

// ── User card (sidebar footer) ─────────────────────────────────
// Clicking opens Clerk's default UserProfile modal.

function SidebarUserCard({
  user,
  userInitials,
  roleLabel,
  roleChipColor,
  openUserProfile,
}: {
  user: ReturnType<typeof useUser>["user"];
  userInitials: string;
  roleLabel: string;
  roleChipColor: "accent" | "success" | "default" | "warning" | "danger";
  openUserProfile: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Open user profile"
      onClick={openUserProfile}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-lg border-0 bg-transparent px-2 py-1.5 text-left",
        "cursor-pointer outline-hidden ring-sidebar-ring focus-visible:ring-2",
        "transition-[background-color] duration-150",
        "hover:bg-sidebar-foreground/[0.055] active:bg-sidebar-foreground/10"
      )}
    >
      <SidebarAvatar user={user} userInitials={userInitials} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-sidebar-foreground">
          {user?.fullName ?? "Staff Member"}
        </p>
        <Chip
          size="sm"
          variant="soft"
          color={roleChipColor}
          className="mt-1 h-[18px] px-1.5 text-[10px] font-medium leading-none"
        >
          {roleLabel}
        </Chip>
      </div>
      <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/40" />
    </button>
  );
}
// ── Avatar helper ──────────────────────────────────────────────

function SidebarAvatar({
  user,
  userInitials,
}: {
  user: { imageUrl?: string | null; fullName?: string | null } | undefined | null;
  userInitials?: string;
}) {
  if (user?.imageUrl) {
    return (
      <Avatar size="sm" className="size-9 shrink-0 rounded-[10px]">
        <Avatar.Image
          src={user.imageUrl}
          alt={user.fullName ?? "User avatar"}
          className="rounded-[10px]"
        />
        <Avatar.Fallback className="rounded-[10px] bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
          {userInitials ?? "U"}
        </Avatar.Fallback>
      </Avatar>
    );
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground ring-1 ring-sidebar-border/40">
      {userInitials ?? "U"}
    </div>
  );
}
