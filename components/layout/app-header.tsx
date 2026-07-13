"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser, useAuth } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import {
  Search,
  Plus,
  Command,
  LogOut,
  Settings,
  ChevronDown,
  Building2,
  Sun,
  Moon,
  Bell,
  CalendarDays,
  DollarSign,
  AlertTriangle,
  CalendarX,
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
import {
  fetchNotificationsAction,
  markAllReadAction,
  markSingleReadAction,
  type NotificationItem,
} from "@/app/actions/notifications";
import { toast } from "sonner";

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

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const bellRef = React.useRef<NotificationIconHandle>(null);
  const chimeAudioRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      chimeAudioRef.current = new Audio("/audio/chime.mp3");
      chimeAudioRef.current.volume = 0.5;
    }
  }, []);

  const playChime = React.useCallback(() => {
    if (!chimeAudioRef.current) return;
    try {
      chimeAudioRef.current.currentTime = 0;
      chimeAudioRef.current.play().catch((err) => {
        console.warn("Chime play blocked by browser autoplay policy:", err);
      });
    } catch (e) {
      console.error("Chime play error:", e);
    }
  }, []);

  // Live notification count — starts from server-rendered value, updates via Realtime
  const [liveNotificationCount, setLiveNotificationCount] = React.useState(notificationCount);

  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);

  const fetchNotifications = React.useCallback(async () => {
    if (!hotelId) return;
    const res = await fetchNotificationsAction(hotelId);
    if (res.success) {
      setNotifications(res.data);
      setLiveNotificationCount(res.unreadCount);
    }
  }, [hotelId]);

  const markAllRead = React.useCallback(async () => {
    if (!hotelId) return;
    const previousCount = liveNotificationCount;
    const previousNotifications = notifications;

    setLiveNotificationCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

    const res = await markAllReadAction(hotelId);
    if (!res.success) {
      toast.error(res.error || "Failed to mark all as read");
      // Revert optimistic updates
      setLiveNotificationCount(previousCount);
      setNotifications(previousNotifications);
      // Fetch fresh state to be authoritative
      fetchNotifications();
    }
  }, [hotelId, liveNotificationCount, notifications, fetchNotifications]);

  const handleNotificationClick = React.useCallback(async (n: NotificationItem) => {
    setNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, is_read: true } : item));
    setLiveNotificationCount((prev) => Math.max(0, prev - (n.is_read ? 0 : 1)));
    
    // Fire and forget read update on server
    markSingleReadAction(n.id);

    // Navigate to booking deep-link if available
    if (n.booking_id) {
      router.push(`/dashboard/bookings/${n.booking_id}`);
    }
  }, [router]);

  const timeAgo = React.useCallback((iso: string | null): string => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }, []);

  React.useEffect(() => {
    setLiveNotificationCount(notificationCount);
  }, [notificationCount]);

  React.useEffect(() => {
    if (!hotelId || !isLoaded) return;
    const hId = hotelId;
    let active = true;

    let channel: any = null;
    let supabase: any = null;
    let authInterval: NodeJS.Timeout | null = null;

    async function initRealtime() {
      await fetchNotifications();
      if (!active) return;

      try {
        const token = await getToken({ template: "supabase" });
        if (!active) return;

        supabase = createClient(token || undefined);

        async function updateRealtimeAuth() {
          try {
            const newToken = await getToken({ template: "supabase" });
            if (!active) return;
            if (newToken && supabase) {
              supabase.realtime.setAuth(newToken);
            }
          } catch (e) {
            console.error("Realtime authentication/refresh failed:", e);
          }
        }

        // Keep token fresh (expires in 60s, refresh every 45s)
        authInterval = setInterval(updateRealtimeAuth, 45000);

        channel = supabase
          .channel(`hotel:${hId}:notifications`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "notifications", filter: `hotel_id=eq.${hId}` },
            (payload: any) => {
              console.log("Realtime: Received notification insert:", payload);
              
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
          .subscribe((status: string, err?: any) => {
            console.log(`Realtime: Subscription status for notifications: ${status}`, err || "");
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.warn("Realtime: Subscription error, attempting refresh...");
              updateRealtimeAuth();
            }
          });
      } catch (err) {
        console.error("Failed to initialize realtime connection:", err);
      }
    }

    initRealtime();

    return () => {
      active = false;
      if (authInterval) {
        clearInterval(authInterval);
      }
      if (channel && supabase) {
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
          "fixed top-0 left-0 right-0 z-30 flex items-center gap-2",
          "h-[calc(3rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]",
          "border-b border-border/60 bg-background/85 backdrop-blur-xl supports-backdrop-filter:bg-background/70",
          "px-3 md:px-4 lg:px-6",
          "native-chrome",
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

          {/* Theme Toggle */}
          {mounted ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground active:scale-[0.98] transition-all duration-300"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>
          ) : (
            <div className="size-8 rounded-lg" />
          )}

          {/* Notifications */}
          <DropdownMenu onOpenChange={(open) => {
            if (open) {
              fetchNotifications();
            }
          }}>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      markAllRead();
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
                  notifications.map((n) => {
                    const renderNotificationIcon = (type: string | null) => {
                      switch (type) {
                        case "new_booking":
                          return (
                            <div className="size-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                              <CalendarDays className="size-4" />
                            </div>
                          );
                        case "payment_received":
                          return (
                            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                              <DollarSign className="size-4" />
                            </div>
                          );
                        case "ota_conflict":
                          return (
                            <div className="size-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                              <AlertTriangle className="size-4" />
                            </div>
                          );
                        case "booking_cancelled":
                          return (
                            <div className="size-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                              <CalendarX className="size-4" />
                            </div>
                          );
                        default:
                          return (
                            <div className="size-8 rounded-lg bg-slate-500/10 text-slate-500 flex items-center justify-center shrink-0">
                              <Bell className="size-4" />
                            </div>
                          );
                      }
                    };

                    return (
                      <button
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left flex items-start gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/30 last:border-0 cursor-pointer ${
                          !n.is_read ? "bg-blue-50/20 dark:bg-blue-950/10" : ""
                        }`}
                      >
                        {renderNotificationIcon(n.type)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <p className="text-xs font-semibold text-foreground truncate">{n.title}</p>
                            {!n.is_read && (
                              <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            {timeAgo(n.created_at)}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="border-t border-border/60 px-3 py-2">
                <button
                  onClick={() => router.push("/dashboard/bookings")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center cursor-pointer"
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
