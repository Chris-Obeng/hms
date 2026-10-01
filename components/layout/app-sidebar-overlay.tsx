"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser, useOrganization, useClerk } from "@clerk/nextjs";
import {
  CalendarDays,
  CalendarRange,
  Users,
  BedDouble,
  LifeBuoy,
  BarChart3,
  Settings,
  Moon,
  LayoutDashboard,
  ClipboardList,
  ChevronsUpDown,
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
  Separator,
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
    title: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Reservations", url: "/dashboard/bookings", icon: ClipboardList },
      { title: "Calendar", url: "/dashboard/calendar", icon: CalendarDays },
      { title: "Guests", url: "/dashboard/customers", icon: Users },
    ],
  },
  {
    title: "Rooms",
    items: [
      { title: "Rooms", url: "/dashboard/rooms", icon: BedDouble },
      { title: "Availability", url: "/dashboard/availability", icon: CalendarRange },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Night Audit", url: "/dashboard/night-audit", icon: Moon },
      { title: "Reports", url: "/dashboard/reports", icon: BarChart3 },
      { title: "Settings", url: "/dashboard/settings", icon: Settings },
    ],
  },
];

// Resting / hover / selected states for a nav row. One filled pill marks the
// active route; the icon takes the brand color only while selected.
const ITEM_CLASS =
  "flex min-h-10 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-sidebar-foreground/75 outline-hidden cursor-pointer select-none transition-[background-color,color] duration-150 ring-sidebar-ring ring-inset focus-visible:ring-2 data-[hovered=true]:bg-sidebar-foreground/[0.055] data-[hovered=true]:text-sidebar-foreground data-[selected=true]:bg-sidebar-accent data-[selected=true]:font-semibold data-[selected=true]:text-sidebar-accent-foreground [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-sidebar-foreground/55 [&_svg]:transition-colors data-[hovered=true]:[&_svg]:text-sidebar-foreground data-[selected=true]:[&_svg]:text-sidebar-primary";

// ── AppSidebar ─────────────────────────────────────────────────

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { membership } = useOrganization();
  const { isMobile, setOpenMobile, setOpen } = useSidebar();
  const { openUserProfile } = useClerk();

  // Any /dashboard/rooms/* sub-route counts as "Rooms"
  const activePath = pathname.startsWith("/dashboard/rooms/")
    ? "/dashboard/rooms"
    : pathname;
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
      if (key) navigateTo(key);
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
          <ListBox
            selectionMode="single"
            selectedKeys={selectedKeys}
            onSelectionChange={handleSelectionChange}
            className="w-full bg-transparent p-0"
            aria-label="Primary navigation"
          >
            {navGroups.flatMap((group, g) =>
              group.items.map((item, i) => (
                <ListBox.Item
                  key={item.url}
                  id={item.url}
                  textValue={item.title}
                  // Rows sit flush; a hair of air between clusters stands in
                  // for the removed group labels — rhythm without chrome.
                  className={cn(ITEM_CLASS, g > 0 && i === 0 && "mt-1")}
                >
                  <item.icon />
                  <span className="flex-1 truncate">{item.title}</span>
                </ListBox.Item>
              ))
            )}
          </ListBox>
        </ScrollShadow>
      </SidebarContent>

      {/* ── Footer ─────────────────────────────────────────── */}
      <SidebarFooter className="gap-1 border-t border-sidebar-border/60 p-2">
        <ListBox
          selectionMode="single"
          selectedKeys={selectedKeys}
          onSelectionChange={handleSelectionChange}
          className="w-full bg-transparent p-0"
          aria-label="Help and support"
        >
          <ListBox.Item
            id="/support"
            textValue="Help and Support"
            className={ITEM_CLASS}
          >
            <LifeBuoy />
            <span className="flex-1 truncate">Help &amp; Support</span>
          </ListBox.Item>
        </ListBox>

        <Separator className="my-1 bg-sidebar-border/60" />

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
