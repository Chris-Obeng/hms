"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUser, useAuth, useClerk } from "@clerk/nextjs";
import { useTheme } from "@/components/theme-provider";
import {
  Plus,
  Building2,
  Sun,
  Moon,
  Bell,
  Search,
  Menu,
  CalendarDays,
  DollarSign,
  CalendarX,
} from "lucide-react";
import {
  Avatar,
  Button,
  Kbd,
  Popover,
  useOverlayState,
} from "@heroui/react";
import {
  NotificationIcon,
  type NotificationIconHandle,
} from "@/components/ui/notification-icon";
import { GlobalSearch } from "@/app/dashboard/_components/global-search";
import { NewBookingModal } from "@/components/bookings/new-booking-modal";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import { useSidebar } from "@/components/ui/sidebar";

import { createClient } from "@/lib/supabase/client";
import {
  fetchNotificationsAction,
  markAllReadAction,
  markSingleReadAction,
  type NotificationItem,
} from "@/app/actions/notifications";
import { toast } from "@heroui/react";

// ── Props ──────────────────────────────────────────────────────

export interface AppHeaderProps {
  hotelName?: string;
  hotelLogoUrl?: string | null;
  hotelId?: string;
  notificationCount?: number;
  roomTypes?: { id: string; name: string; base_price: number }[];
  currency?: string;
  /** Kept for API compatibility — not rendered in the header */
  bookingUrl?: string;
}

// ── Notification type icon ─────────────────────────────────────

function NotifIcon({ type }: { type: string | null }) {
  const base =
    "flex size-8 shrink-0 items-center justify-center rounded-lg";
  switch (type) {
    case "new_booking":
      return (
        <span className={cn(base, "bg-blue-500/10 text-blue-500")}>
          <CalendarDays className="size-4" />
        </span>
      );
    case "payment_received":
      return (
        <span className={cn(base, "bg-emerald-500/10 text-emerald-500")}>
          <DollarSign className="size-4" />
        </span>
      );
    case "booking_cancelled":
      return (
        <span className={cn(base, "bg-orange-500/10 text-orange-500")}>
          <CalendarX className="size-4" />
        </span>
      );
    default:
      return (
        <span className={cn(base, "bg-slate-500/10 text-slate-500")}>
          <Bell className="size-4" />
        </span>
      );
  }
}

// ── Component ───────────────────────────────────────────────────

export function AppHeader({
  hotelName,
  hotelLogoUrl,
  hotelId,
  notificationCount = 0,
  roomTypes = [],
  currency = "GHS",
  bookingUrl: _bookingUrl,
}: AppHeaderProps) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { openUserProfile } = useClerk();
  const { toggleSidebar } = useSidebar();


  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  void _bookingUrl;

  // ── HeroUI-native overlay state for the command palette ──────
  const searchState = useOverlayState();
  const [newBookingOpen, setNewBookingOpen] = React.useState(false);

  // ── Audio ────────────────────────────────────────────────────
  const bellRef = React.useRef<NotificationIconHandle>(null);
  const chimeRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      chimeRef.current = new Audio("/audio/chime.mp3");
      chimeRef.current.volume = 0.5;
    }
  }, []);

  const playChime = React.useCallback(() => {
    const audio = chimeRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      audio.play().catch((e) =>
        console.warn("Chime blocked by autoplay policy:", e),
      );
    } catch (e) {
      console.error("Chime error:", e);
    }
  }, []);

  // ── Notifications ────────────────────────────────────────────
  const [liveCount, setLiveCount] = React.useState(notificationCount);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(
    [],
  );

  const fetchNotifications = React.useCallback(async () => {
    if (!hotelId) return;
    const res = await fetchNotificationsAction(hotelId);
    if (res.success) {
      setNotifications(res.data);
      setLiveCount(res.unreadCount);
    }
  }, [hotelId]);

  const markAllRead = React.useCallback(async () => {
    if (!hotelId) return;
    const prevCount = liveCount;
    const prevNotifs = notifications;
    setLiveCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const res = await markAllReadAction(hotelId);
    if (!res.success) {
      toast.danger(res.error || "Failed to mark all as read");
      setLiveCount(prevCount);
      setNotifications(prevNotifs);
      fetchNotifications();
    }
  }, [hotelId, liveCount, notifications, fetchNotifications]);

  const handleNotifClick = React.useCallback(
    async (n: NotificationItem) => {
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, is_read: true } : item,
        ),
      );
      setLiveCount((prev) => Math.max(0, prev - (n.is_read ? 0 : 1)));
      markSingleReadAction(n.id);
      if (n.booking_id) {
        router.push(`/dashboard/bookings/${n.booking_id}`);
      }
    },
    [router],
  );

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setLiveCount(notificationCount);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [notificationCount]);

  // ── Realtime subscription ────────────────────────────────────
  React.useEffect(() => {
    if (!hotelId || !isLoaded) return;
    const hId = hotelId;
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let supabase: any = null;
    let authInterval: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let resubscribeAttempts = 0;

    async function initRealtime() {
      await fetchNotifications();
      if (!active) return;

      try {
        supabase = createClient();

        async function refreshRealtimeAuth() {
          try {
            const token = await getToken({ template: "supabase" });
            if (!active || !token || !supabase) return;
            supabase.realtime.setAuth(token);
          } catch (e) {
            console.error("Realtime auth refresh failed:", e);
          }
        }

        // The websocket does not go through the REST fetch wrapper that injects
        // the Clerk JWT, so it must be authenticated before subscribing or RLS
        // filters out every change until the first interval tick.
        await refreshRealtimeAuth();
        if (!active) return;

        authInterval = setInterval(refreshRealtimeAuth, 45_000);

        function handleStatus(status: string, err?: unknown) {
          if (status === "SUBSCRIBED") {
            resubscribeAttempts = 0;
            return;
          }
          if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;

          console.warn(`Realtime notifications: ${status}`, err ?? "");
          if (!active || resubscribeAttempts >= 5) return;
          resubscribeAttempts += 1;

          retryTimer = setTimeout(async () => {
            // A refreshed token only takes effect on a new subscription, and
            // subscribe() is a no-op unless the channel is closed — so the
            // channel is torn down and rebuilt with the same handlers.
            await refreshRealtimeAuth();
            if (!active) return;
            openChannel();
          }, resubscribeAttempts * 2_000);
        }

        function openChannel() {
          if (channel) supabase.removeChannel(channel);
          channel = buildChannel().subscribe(handleStatus);
        }

        function buildChannel() {
          return supabase
            .channel(`hotel:${hId}:notifications`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "notifications",
                filter: `hotel_id=eq.${hId}`,
              },
              (payload: { new: Record<string, unknown> }) => {
                console.log("Realtime: notification INSERT", payload);
                bellRef.current?.startAnimation();

                const soundEnabled =
                  localStorage.getItem("RoomLine_sound_enabled") !== "false";
                if (soundEnabled) playChime();

                const browserAlerts =
                  localStorage.getItem(
                    "RoomLine_browser_notifications_enabled",
                  ) === "true";
                if (browserAlerts && Notification.permission === "granted") {
                  try {
                    new Notification(
                      String(payload.new.title ?? "New Notification"),
                      {
                        body: String(payload.new.message ?? ""),
                        icon: "/icons/icon-192x192.png",
                      },
                    );
                  } catch (e) {
                    console.error("Browser notification error:", e);
                  }
                }

                setLiveCount((prev) => prev + 1);
                fetchNotifications();
              },
            )
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "notifications",
                filter: `hotel_id=eq.${hId}`,
              },
              async () => {
                const { count } = await supabase
                  .from("notifications")
                  .select("*", { count: "exact", head: true })
                  .eq("hotel_id", hId)
                  .eq("is_read", false);
                setLiveCount(count ?? 0);
                fetchNotifications();
              },
            );
        }

        openChannel();
      } catch (err) {
        console.error("Failed to init realtime:", err);
      }
    }

    initRealtime();
    return () => {
      active = false;
      if (authInterval) clearInterval(authInterval);
      if (retryTimer) clearTimeout(retryTimer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [hotelId, isLoaded, getToken, playChime, fetchNotifications]);

  // ── ⌘K shortcut ─────────────────────────────────────────────
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        searchState.toggle();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [searchState]);

  // ── Render ───────────────────────────────────────────────────

  return (
    <>
      <header
        data-slot="app-header"
        className={cn(
          "fixed left-0 right-0 top-0 z-30 flex items-center justify-between gap-2",
          "h-14 border-b border-border/60 bg-background/85 backdrop-blur-xl supports-backdrop-filter:bg-background/70",
          "px-3 md:px-4 lg:px-6",
        )}
      >
        {/* ── Left ─────────────────────────────────────────── */}
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Sidebar toggle — HeroUI ghost icon button */}
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={toggleSidebar}
            aria-label="Toggle sidebar"
            className="size-8 shrink-0 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-muted/60 hover:text-foreground active:scale-[0.98]"
          >
            <Menu className="size-5" />
          </Button>

          <button
            type="button"
            onClick={() => router.push("/dashboard/settings/hotel")}
            title="Hotel settings"
            className="group flex min-w-0 items-center gap-2 text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-lg p-0.5"
          >
            {hotelLogoUrl ? (
              <img
                src={hotelLogoUrl}
                alt={hotelName || "Hotel"}
                className="size-7 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/5 ring-1 ring-border group-hover:bg-foreground/10 transition-colors">
                <Building2 className="size-3.5 text-muted-foreground" />
              </span>
            )}
            <span className="hidden truncate text-sm font-semibold text-foreground transition-colors group-hover:text-foreground/80 sm:inline">
              {hotelName || "Dashboard"}
            </span>
          </button>
        </div>

        {/* ── Center: search trigger ────────────────────────── */}
        {/* Desktop: full pill search bar */}
        <div className="mx-auto hidden max-w-lg flex-1 justify-center md:flex">
          <button
            type="button"
            onClick={searchState.open}
            aria-label="Open command palette (Ctrl+K)"
            className={cn(
              "flex h-8 w-full max-w-sm items-center gap-2 rounded-lg px-3 text-left",
              "border border-border/50 bg-muted/30 text-sm text-muted-foreground/70",
              "transition-all duration-200 hover:bg-muted/50 hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground/50" />
            <span className="flex-1 truncate text-muted-foreground/60">
              Search guests, bookings, rooms…
            </span>
            <Kbd className="hidden md:inline-flex bg-background/80 border border-border/50 text-muted-foreground/60 text-[9px] scale-90">
              <Kbd.Abbr keyValue="command" />
              <Kbd.Content>K</Kbd.Content>
            </Kbd>
          </button>
        </div>

        {/* ── Right: actions ────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-1.5">

          {/* Mobile-only: search icon button */}
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={searchState.open}
            aria-label="Open search"
            className="size-8 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-muted/60 active:scale-[0.97] md:hidden"
          >
            <Search className="size-4" />
          </Button>

          {/* New Booking */}
          <Button
            variant="primary"
            size="sm"
            onPress={() => setNewBookingOpen(true)}
            aria-label="New booking"
            className="hidden h-8 gap-1.5 rounded-lg text-xs sm:inline-flex"
          >
            <Plus className="size-3.5" />
          </Button>

          {/* Theme toggle */}
          {mounted ? (
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              className="size-8 rounded-lg text-muted-foreground transition-all duration-300 hover:bg-muted/60 hover:text-foreground active:scale-[0.98]"
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>
          ) : (
            <div aria-hidden="true" className="size-8 rounded-lg" />
          )}

          {/* ── Notifications — HeroUI Popover (rich content, not a menu) ── */}
          <Popover onOpenChange={(isOpen) => { if (isOpen) fetchNotifications(); }}>
            <Popover.Trigger>
              <Button
                variant="ghost"
                isIconOnly
                aria-label={
                  liveCount > 0
                    ? `Notifications, ${liveCount} unread`
                    : "Notifications"
                }
                className="relative flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 transition-colors"
              >
                <NotificationIcon ref={bellRef} size={16} />
                {liveCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground ring-2 ring-background"
                  >
                    {liveCount > 9 ? "9+" : liveCount}
                  </span>
                )}
              </Button>
            </Popover.Trigger>

            <Popover.Content placement="bottom end" className="w-80 p-0">
              <Popover.Dialog className="outline-none">
                {/* Panel header */}
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
                  <span className="text-sm font-semibold text-foreground">
                    Notifications
                  </span>
                  {liveCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="cursor-pointer text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Notification list */}
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
                      <Bell className="size-5 text-muted-foreground/40" />
                      <span className="text-sm text-muted-foreground">
                        No notifications
                      </span>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleNotifClick(n)}
                        className={cn(
                          "w-full cursor-pointer text-left",
                          "flex items-start gap-3 border-b border-border/30 px-3 py-2.5 last:border-0",
                          "transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
                          !n.is_read &&
                            "bg-blue-50/20 dark:bg-blue-950/10",
                        )}
                      >
                        <NotifIcon type={n.type} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {n.title}
                            </p>
                            {!n.is_read && (
                              <span
                                aria-label="Unread"
                                className="size-1.5 shrink-0 rounded-full bg-blue-500"
                              />
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {n.message}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground/60">
                            {formatRelativeTime(n.created_at, { fallback: "", justNow: "just now" })}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {/* Panel footer */}
                <div className="border-t border-border/60 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard/bookings")}
                    className="w-full cursor-pointer text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View all bookings →
                  </button>
                </div>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>


          {/* ── User avatar — opens Clerk's default UserProfile modal ── */}
          {isLoaded && user && (
            <div className="hidden md:block">
              <button
                type="button"
                aria-label="Open user profile"
                onClick={() => openUserProfile()}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-transparent border-0 shadow-none hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 transition-colors cursor-pointer"
              >
                <Avatar size="sm" className="size-6 rounded-md">
                  <Avatar.Image
                    src={user.imageUrl}
                    alt={user.fullName || "User"}
                  />
                  <Avatar.Fallback className="rounded-md bg-foreground/10 text-[10px] font-medium">
                    {(user.firstName?.[0] ?? "U") +
                      (user.lastName?.[0] ?? "")}
                  </Avatar.Fallback>
                </Avatar>
              </button>
            </div>
          )}

        </div>
      </header>

      {/* ── Global Search command palette ─────────────────────── */}
      <GlobalSearch state={searchState} />
      <NewBookingModal
        open={newBookingOpen}
        onOpenChange={setNewBookingOpen}
        roomTypes={roomTypes}
        currency={currency}
      />
    </>
  );
}
