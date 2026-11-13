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
  UserCog,
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
import { RoomLineMark } from "@/components/brand/roomline-mark";

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

// Settings sections live in tabs on the Settings page itself, so the sidebar
// needs a single entry (the hub route redirects to the first tab).
const SETTINGS_URL = "/dashboard/settings/hotel";

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
      { title: "Settings", url: SETTINGS_URL, icon: Settings },
      { title: "Staff", url: "/dashboard/staff", icon: UserCog },
      { title: "Support", url: "/support", icon: LifeBuoy },
    ],
  },
];

// Resting / hover / selected states for a nav row. One filled pill marks the
// active route; the icon takes the brand color only while selected.
const ITEM_CLASS =
  "flex h-10 items-center gap-3 rounded-lg px-2 text-sm font-medium text-sidebar-foreground/75 outline-hidden cursor-pointer select-none transition-[background-color,color] duration-150 ring-sidebar-ring ring-inset focus-visible:ring-2 data-[hovered=true]:bg-sidebar-foreground/[0.055] data-[hovered=true]:text-sidebar-foreground data-[selected=true]:bg-sidebar-accent data-[selected=true]:font-medium data-[selected=true]:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-sidebar-foreground/55 [&_svg]:transition-colors data-[hovered=true]:[&_svg]:text-sidebar-foreground data-[selected=true]:[&_svg]:text-sidebar-primary";

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
    if (pathname.startsWith("/dashboard/settings")) return SETTINGS_URL;
    if (pathname.startsWith("/dashboard/staff")) return "/dashboard/staff";
    return pathname;
  }, [pathname]);
  const selectedKeys = React.useMemo(() => new Set([activePath]), [activePath]);

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
      navigateTo(key);
    },
    [navigateTo]
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
          className="group flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 text-left outline-hidden ring-sidebar-ring focus-visible:ring-2"
        >
          <RoomLineMark size={32} className="shadow-sm" />
          <span className="truncate text-md font-semibold leading-tight tracking-tight text-sidebar-foreground transition-colors group-hover:text-sidebar-foreground/75">
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
              className="w-full bg-transparent p-0"
              aria-label={`${group.title} navigation`}
            >
              {group.items.map((item) => (
                <ListBox.Item key={item.url} id={item.url} textValue={item.title} className={ITEM_CLASS}>
                  <item.icon />
                  <span className="flex-1 truncate">{item.title}</span>
                </ListBox.Item>
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
        "flex min-h-12 w-full items-center gap-3 rounded-lg border-0 bg-transparent px-2 py-2 text-left",
        "cursor-pointer outline-hidden ring-sidebar-ring focus-visible:ring-2",
        "transition-[background-color] duration-150",
        "hover:bg-sidebar-foreground/[0.055] active:bg-sidebar-foreground/10"
      )}
    >
      <SidebarAvatar user={user} userInitials={userInitials} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-sidebar-foreground">
          {user?.fullName ?? "Staff Member"}
        </p>
        <Chip
          size="sm"
          variant="soft"
          color={roleChipColor}
          className="mt-1 h-5 px-2 text-2xs font-medium leading-none"
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
      <Avatar size="sm" className="size-9 shrink-0 rounded-lg">
        <Avatar.Image
          src={user.imageUrl}
          alt={user.fullName ?? "User avatar"}
          className="rounded-lg"
        />
        <Avatar.Fallback className="rounded-lg bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
          {userInitials ?? "U"}
        </Avatar.Fallback>
      </Avatar>
    );
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground ring-1 ring-sidebar-border/40">
      {userInitials ?? "U"}
    </div>
  );
}
