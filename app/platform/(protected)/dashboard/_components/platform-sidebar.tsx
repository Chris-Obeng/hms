"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Percent, X } from "lucide-react";
import { Button, Avatar, Chip } from "@heroui/react";
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
    title: "Hotel Oversight",
    href: "/platform",
    icon: Building2,
    exact: true,
  },
  {
    title: "Platform Fees",
    href: "/platform/settings",
    icon: Percent,
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

  return (
    <>
      {/* ── Header ──────────────────────────────────────────── */}
      <SidebarHeader className="px-3 py-4 border-b border-sidebar-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Logo mark */}
            <div className="size-8 rounded-lg bg-foreground flex items-center justify-center shrink-0 ring-1 ring-foreground/20">
              <span className="text-sm font-bold text-background leading-none">
                H
              </span>
            </div>
            {/* Brand name — hidden when icon-collapsed */}
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">
                RoomLine
              </p>
              <p className="text-2xs text-sidebar-foreground/50 truncate mt-1">
                Platform Admin
              </p>
            </div>
          </div>

          {/* Close button — mobile only, using HeroUI Button */}
          {isMobile && (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
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
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg group-data-[collapsible=icon]:justify-center">
          {/* Avatar using HeroUI */}
          <Avatar size="sm" className="shrink-0" color="default">
            <Avatar.Fallback>{initials}</Avatar.Fallback>
          </Avatar>

          {/* Identity — hidden when icon-collapsed */}
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
              {admin?.full_name ?? admin?.email ?? "Admin"}
            </p>
            <Chip
              size="sm"
              variant="soft"
              color={admin?.role === "super_admin" ? "accent" : "default"}
              className="mt-1"
            >
              <span className="text-2xs font-medium">{roleLabel}</span>
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
