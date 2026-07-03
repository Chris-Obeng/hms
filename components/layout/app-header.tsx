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
} from "lucide-react";
import { MenuIcon } from "@/components/ui/menu-icon";
import { NotificationIcon, type NotificationIconHandle } from "@/components/ui/notification-icon";
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
  /** Kept for API compatibility with dashboard layout — not displayed in the header */
  bookingUrl?: string;
}

// ── Component ───────────────────────────────────────────────────

export function AppHeader({
  hotelName,
  hotelLogoUrl,
  hotelId,
  notificationCount = 0,
  bookingUrl: _bookingUrl,
}: AppHeaderProps) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { signOut, getToken } = useAuth();
  const { toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const [commandOpen, setCommandOpen] = React.useState(false);

  const bellRef = React.useRef<NotificationIconHandle>(null);

  const playChime = React.useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const AudioContext = window.AudioContext || (window as Window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const playTone = (time: number, freq: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.2, time + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + dur);
      };

      const now = ctx.currentTime;
      playTone(now, 1046.50, 0.6); // C6
      playTone(now + 0.12, 1318.51, 1.0); // E6
    } catch (e) {
      console.error("Chime play error:", e);
    }
  }, []);

  // Live notification count — starts from server-rendered value, updates via Realtime
  const [liveNotificationCount, setLiveNotificationCount] = React.useState(notificationCount);

  // Notification list for dropdown
  type NotificationItem = {
    id: string;
    type: string | null;
    title: string;
    message: string;
    booking_id: string | null;
    is_read: boolean;
    created_at: string | null;
  };
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);

  async function fetchNotifications() {
    if (!hotelId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, message, booking_id, is_read, created_at")
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((data ?? []) as NotificationItem[]);
  }

  async function markAllRead() {
    if (!hotelId) return;
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("hotel_id", hotelId)
      .eq("is_read", false);
    setLiveNotificationCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  function handleNotificationClick(n: NotificationItem) {
    // Mark this one as read
    const supabase = createClient();
    supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    setNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, is_read: true } : item));
    setLiveNotificationCount((prev) => Math.max(0, prev - (n.is_read ? 0 : 1)));
    // Navigate to booking deep-link if available
    if (n.booking_id) {
      router.push(`/dashboard/bookings/${n.booking_id}`);
    }
  }

  function timeAgo(iso: string | null): string {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  React.useEffect(() => {
    setLiveNotificationCount(notificationCount);
  }, [notificationCount]);

  React.useEffect(() => {
    if (!hotelId || !isLoaded) return;
    const hId = hotelId;
    let active = true;

    let channel: any = null;
    const supabase = createClient();

    async function initRealtime() {
      await fetchNotifications();
      if (!active) return;

      try {
        const token = await getToken({ template: "supabase" });
        if (!active) return;
        if (token) {
          supabase.realtime.setAuth(token);
        }
      } catch (e) {
        console.error("Realtime authentication failed:", e);
      }

      if (!active) return;

      channel = supabase
        .channel(`hotel:${hId}:notifications`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `hotel_id=eq.${hId}` },
          (payload: any) => {
            // Animate bell icon
            bellRef.current?.startAnimation();

            // Play sound if enabled in settings
            const soundEnabled = localStorage.getItem("hotelos_sound_enabled") !== "false";
            if (soundEnabled) {
              playChime();
            }

            // Browser notification alert if enabled
            const browserAlerts = localStorage.getItem("hotelos_browser_notifications_enabled") === "true";
            if (browserAlerts && Notification.permission === "granted") {
              try {
                new Notification(payload.new.title || "New Notification", {
                  body: payload.new.message || "",
                  icon: "/icons/icon-192x192.png",
                });
              } catch (e) {
                console.error("Failed to show browser notification:", e);
              }
            }

            setLiveNotificationCount((prev) => prev + 1);
            fetchNotifications();
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `hotel_id=eq.${hId}` },
          async () => {
            const { count } = await supabase
              .from("notifications")
              .select("*", { count: "exact", head: true })
              .eq("hotel_id", hId)
              .eq("is_read", false);
            setLiveNotificationCount(count ?? 0);
            fetchNotifications();
          },
        )
        .subscribe();
    }

    initRealtime();

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [hotelId, isLoaded, getToken, playChime]);

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

          <Link href="/dashboard" className="flex items-center gap-2 min-w-0 group">
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
              <kbd className="hidden md:inline-flex items-center gap-0.5 rounded-md border border-border/50 bg-background px-1.5 py-0.5 text-caption font-medium text-muted-foreground/60 shrink-0">
                <Command className="size-2.5" />
                <span>K</span>
              </kbd>
            )}
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
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
                  aria-label={
                    liveNotificationCount > 0
                      ? `Notifications, ${liveNotificationCount} unread`
                      : "Notifications"
                  }
                />
              }
            >
              <NotificationIcon ref={bellRef} size={16} />
              {liveNotificationCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-caption font-bold text-destructive-foreground ring-2 ring-background">
                  {liveNotificationCount > 9 ? "9+" : liveNotificationCount}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                {liveNotificationCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No notifications
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full text-left flex items-start gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/30 last:border-0 ${!n.is_read ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}
                    >
                      <span className={`mt-1 size-2 rounded-full shrink-0 ${
                        n.type === "new_booking" ? "bg-blue-500" :
                        n.type === "payment_received" ? "bg-emerald-500" :
                        n.type === "ota_conflict" ? "bg-red-500" :
                        n.type === "booking_cancelled" ? "bg-orange-500" :
                        "bg-muted-foreground/40"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{n.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-border/60 px-3 py-2">
                <button
                  onClick={() => router.push("/dashboard/bookings")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center"
                >
                  View all bookings →
                </button>
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
                  <AvatarImage src={user.imageUrl} alt={user.fullName || "User"} />
                  <AvatarFallback className="text-caption font-medium rounded-md bg-foreground/10">
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
                <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
                  <Settings className="size-3.5" />
                  Settings
                </DropdownMenuItem>
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
