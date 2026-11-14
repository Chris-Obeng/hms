"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { createPlatformBrowserClient } from "@/lib/supabase/platform-browser";
import type { PlatformAdmin } from "./platform-sidebar";

// ── Route title map ────────────────────────────────────────────

const ROUTE_TITLES: Record<string, string> = {
  "/platform": "Hotel Oversight",
  "/platform/settings": "Platform Fees",
};

function getPageTitle(pathname: string): string {
  // Exact match first
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  return "Platform Admin";
}

// ── Component ──────────────────────────────────────────────────

export function PlatformHeader({ admin }: { admin: PlatformAdmin | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const pageTitle = getPageTitle(pathname);

  const initials = admin?.full_name
    ? admin.full_name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : (admin?.email?.[0] ?? "A").toUpperCase();

  async function handleSignOut() {
    // Platform admins sign in with Supabase Auth, so sign-out goes through the
    // platform client. The staff client (Clerk tokens) has no `auth` API.
    const supabase = createPlatformBrowserClient();
    await supabase.auth.signOut();
    router.push("/platform/sign-in");
    router.refresh();
  }

  return (
    <header
      data-slot="platform-header"
      className={cn(
        "sticky top-0 z-40 flex h-12 items-center gap-3",
        "border-b border-border/60 bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/60",
        "px-3 md:px-4"
      )}
    >
      {/* Left: Sidebar trigger + page title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <SidebarTrigger
          className="size-8 shrink-0 rounded-lg hover:bg-muted/60"
          aria-label="Toggle sidebar"
        />

        {/* Divider */}
        <div className="h-4 w-px bg-border/60 shrink-0" aria-hidden />

        {/* Page title */}
        <p className="text-sm font-semibold text-foreground truncate">
          {pageTitle}
        </p>
      </div>

      {/* Right: Admin identity dropdown */}
      <div className="flex items-center gap-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-2 rounded-lg pl-2 pr-2 hover:bg-muted/60"
              />
            }
          >
            {/* Avatar */}
            <div className="size-6 rounded-md bg-foreground/10 flex items-center justify-center text-2xs font-semibold text-foreground shrink-0">
              {initials}
            </div>
            <span className="text-sm font-medium text-foreground hidden sm:inline max-w-[120px] truncate">
              {admin?.full_name ?? admin?.email ?? "Admin"}
            </span>
            <ChevronDown className="size-3 text-muted-foreground/50 hidden sm:inline" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  {admin?.full_name ?? "Admin"}
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {admin?.email}
                </span>
                {admin?.role && (
                  <span className="text-2xs text-muted-foreground capitalize mt-1">
                    {admin.role.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive gap-2"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
