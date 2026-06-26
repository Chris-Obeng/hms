"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser, useAuth } from "@clerk/nextjs";
import {
  Search,
  Plus,
  Command,
  LogOut,
  Settings,
  ChevronDown,
  Building2,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { MenuIcon } from "@/components/ui/menu-icon";
import { NotificationIcon } from "@/components/ui/notification-icon";
import { GlobalSearch } from "@/app/dashboard/_components/global-search";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { createClient } from "@/lib/supabase/client";

// ── Props ──────────────────────────────────────────────────────

export interface AppHeaderProps {
  hotelName?: string;
  hotelLogoUrl?: string | null;
  hotelId?: string;
  notificationCount?: number;
  bookingUrl?: string;
}

// ── Component ───────────────────────────────────────────────────

export function AppHeader({
  hotelName,
  hotelLogoUrl,
  hotelId,
  notificationCount = 0,
  bookingUrl,
}: AppHeaderProps) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { signOut } = useAuth();
  const { toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Live notification count — starts from server-rendered value, updates via Realtime
  const [liveNotificationCount, setLiveNotificationCount] = React.useState(notificationCount);

  // Sync when server-side prop changes (e.g., on navigation)
  React.useEffect(() => {
    setLiveNotificationCount(notificationCount);
  }, [notificationCount]);

  // Realtime subscription for notifications
  React.useEffect(() => {
    if (!hotelId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`hotel:${hotelId}:notifications`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `hotel_id=eq.${hotelId}` },
        () => {
          setLiveNotificationCount((prev) => prev + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `hotel_id=eq.${hotelId}` },
        async () => {
          // Re-fetch unread count when notifications are marked as read
          const { count } = await supabase
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("hotel_id", hotelId)
            .eq("is_read", false);
          setLiveNotificationCount(count ?? 0);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId]);

  function copyBookingUrl() {
    if (!bookingUrl) return;
    navigator.clipboard.writeText(bookingUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  // Keyboard shortcut for command palette
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSearchClick = React.useCallback(() => {
    setCommandOpen(true);
  }, []);

  return (
    <>
      <header
        data-slot="app-header"
        className={cn(
          "fixed top-0 left-0 right-0 z-40 flex h-12 items-center gap-2",
          "border-b border-border/60 bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/60",
          "px-3 md:px-4 lg:px-6",
        )}
      >
        {/* Left: Hamburger + Hotel name */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-8 shrink-0 rounded-lg hover:bg-muted/60"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
          >
            <MenuIcon size={16} />
          </Button>

          <Link
            href="/dashboard"
            className="flex items-center gap-2 min-w-0 group"
          >
            {hotelLogoUrl ? (
              <img
                src={hotelLogoUrl}
                alt={hotelName || "Hotel"}
                className="size-7 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="size-7 rounded-lg bg-foreground/5 flex items-center justify-center shrink-0 ring-1 ring-border">
                <Building2 className="size-3.5 text-muted-foreground" />
              </div>
            )}
            <span className="text-sm font-semibold text-foreground truncate hidden sm:inline group-hover:text-foreground/80 transition-colors">
              {hotelName || "Dashboard"}
            </span>
          </Link>
        </div>

        {/* Center: Search bar */}
        <div className="flex-1 flex justify-center max-w-lg mx-auto">
          <button
            onClick={handleSearchClick}
            className={cn(
              "flex items-center gap-2 w-full max-w-md h-8 px-3 rounded-lg",
              "border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors",
              "text-sm text-muted-foreground/70 text-left",
            )}
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground/50" />
            <span className="flex-1 truncate">
              {isMobile ? "Search..." : "Search guests, bookings, rooms..."}
            </span>
            {!isMobile && (
              <kbd className="hidden md:inline-flex items-center gap-0.5 rounded-md border border-border/50 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60 shrink-0">
                <Command className="size-2.5" />
                <span>K</span>
              </kbd>
            )}
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Booking page link */}
          {bookingUrl && (
            <div className="hidden sm:flex items-center gap-1 h-8 rounded-lg border border-border/60 bg-muted/20 px-2 text-xs text-muted-foreground max-w-[180px]">
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground transition-colors min-w-0 flex-1"
                title={bookingUrl}
              >
                <ExternalLink className="size-3 shrink-0" />
                <span className="truncate">
                  {bookingUrl.replace(/^https?:\/\//, "")}
                </span>
              </a>
              <button
                onClick={copyBookingUrl}
                className="shrink-0 hover:text-foreground transition-colors ml-1"
                title="Copy booking link"
              >
                {copied ? (
                  <Check className="size-3 text-emerald-600" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
            </div>
          )}

          {/* New Booking */}
          <Button
            variant="default"
            size="sm"
            className="h-8 rounded-lg text-xs gap-1.5 bg-foreground text-background hover:bg-foreground/90 hidden sm:inline-flex"
            onClick={() => router.push("/dashboard/bookings?new=1")}
          >
            <Plus className="size-3.5" />
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8 rounded-lg relative hover:bg-muted/60"
                  aria-label="Notifications"
                />
              }
            >
              <NotificationIcon size={16} />
              {liveNotificationCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground ring-2 ring-background">
                  {liveNotificationCount > 9 ? "9+" : liveNotificationCount}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="p-4 text-center text-sm text-muted-foreground">
                {liveNotificationCount > 0
                  ? `${liveNotificationCount} unread notification${liveNotificationCount !== 1 ? "s" : ""}`
                  : "No new notifications"}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          {isLoaded && user && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-2 rounded-lg pl-1.5 pr-2 hover:bg-muted/60"
                  />
                }
              >
                <Avatar className="size-6 rounded-md">
                  <AvatarImage
                    src={user.imageUrl}
                    alt={user.fullName || "User"}
                  />
                  <AvatarFallback className="text-[10px] font-medium rounded-md bg-foreground/10">
                    {(user.firstName?.[0] || "U") + (user.lastName?.[0] || "")}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-foreground hidden md:inline max-w-[100px] truncate">
                  {user.firstName || "User"}
                </span>
                <ChevronDown className="size-3 text-muted-foreground/50 hidden md:inline" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {user.fullName || user.firstName || "User"}
                    </span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {user.primaryEmailAddress?.emailAddress}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => router.push("/dashboard/settings")}
                >
                  <Settings className="size-3.5" />
                  Settings
                </DropdownMenuItem>
                {bookingUrl && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => window.open(bookingUrl, "_blank")}
                    >
                      <ExternalLink className="size-3.5" />
                      View booking page
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={copyBookingUrl}>
                      {copied ? (
                        <Check className="size-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copied ? "Copied!" : "Copy booking link"}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" })}>
                  <LogOut className="size-3.5" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Global Search Command Palette */}
      <GlobalSearch open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
