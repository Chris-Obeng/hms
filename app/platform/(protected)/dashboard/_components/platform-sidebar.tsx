"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, Settings, Link2, X } from "lucide-react";
import { Button, Avatar, Chip } from "@heroui/react";
import { cn } from "@/lib/utils";
import {
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { PlatformSignOutButton } from "../_sign-out";

// ── Types ──────────────────────────────────────────────────────

export interface PlatformAdmin {
  full_name: string | null;
  role: string | null;
  email: string | null;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** exact match or prefix match for active detection */
  exact?: boolean;
}

// ── Navigation ─────────────────────────────────────────────────

const navItems: NavItem[] = [
  {
    title: "Overview",
    href: "/platform/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    title: "Hotels",
    href: "/platform/dashboard/hotels",
    icon: Building2,
    exact: false,
  },
  {
    title: "Integrations",
    href: "/platform/dashboard/integrations",
    icon: Link2,
    exact: false,
  },
  {
    title: "Settings",
    href: "/platform/dashboard/settings",
    icon: Settings,
    exact: false,
  },
];

// ── Role helpers ───────────────────────────────────────────────

function getRoleLabel(role: string | null | undefined): string {
  const map: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    support: "Support",
    viewer: "Viewer",
  };
  return role ? (map[role] ?? role.replace(/_/g, " ")) : "Platform Admin";
}

function getRoleBadgeClass(role: string | null | undefined): string {
  switch (role) {
    case "super_admin":
      return "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800";
    case "admin":
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800";
    default:
      return "bg-muted/60 text-muted-foreground border-border/60";
  }
}

// ── PlatformSidebar ────────────────────────────────────────────

export function PlatformSidebar({ admin }: { admin: PlatformAdmin | null }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  function handleNavClick() {
    if (isMobile) setOpenMobile(false);
  }

  const initials = admin?.full_name
    ? admin.full_name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : (admin?.email?.[0] ?? "A").toUpperCase();

  const roleLabel = getRoleLabel(admin?.role);
  const roleBadgeClass = getRoleBadgeClass(admin?.role);

  return (
    <>
      {/* ── Header ──────────────────────────────────────────── */}
      <SidebarHeader className="px-3 py-3.5 border-b border-sidebar-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Logo mark */}
            <div className="size-8 rounded-lg bg-foreground flex items-center justify-center shrink-0 ring-1 ring-foreground/20">
              <span className="text-sm font-bold text-background leading-none">
                H
              </span>
            </div>
            {/* Brand name — hidden when icon-collapsed */}
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">
                HotelOS Pro
              </p>
              <p className="text-[11px] text-sidebar-foreground/50 truncate mt-0.5">
                Platform Admin
              </p>
            </div>
          </div>

          {/* Close button — mobile only, using HeroUI Button */}
          {isMobile && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => setOpenMobile(false)}
              aria-label="Close navigation"
              className="shrink-0"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </SidebarHeader>

      {/* ── Navigation ──────────────────────────────────────── */}
      <SidebarContent className="px-2 py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.title}
                      render={
                        <Link href={item.href} onClick={handleNavClick} />
                      }
                      className="group-data-[collapsible=icon]:justify-center"
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer ──────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border/50 p-3">
        <SidebarSeparator className="mb-2" />

        {/* Admin identity */}
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg group-data-[collapsible=icon]:justify-center">
          {/* Avatar using HeroUI */}
          <Avatar
            size="sm"
            fallback={initials}
            className="shrink-0"
            color="secondary"
          />

          {/* Identity — hidden when icon-collapsed */}
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
              {admin?.full_name ?? admin?.email ?? "Admin"}
            </p>
            <Chip
              size="sm"
              variant="soft"
              color={admin?.role === "super_admin" ? "secondary" : "default"}
              className="mt-0.5"
            >
              <span className="text-[10px] font-medium">{roleLabel}</span>
            </Chip>
          </div>
        </div>

        {/* Sign-out button — hidden when icon-collapsed */}
        <div className="mt-1 group-data-[collapsible=icon]:hidden">
          <PlatformSignOutButton />
        </div>
      </SidebarFooter>
    </>
  );
}
