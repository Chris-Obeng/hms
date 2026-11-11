"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useUser, useAuth, useClerk } from "@clerk/nextjs";
import {
  Plus,
  Bell,
  Menu,
  CalendarDays,
  DollarSign,
  CalendarX,
  ArrowLeft,
} from "lucide-react";
import {
  Avatar,
  Button,
  Modal,
  useOverlayState,
} from "@heroui/react";
import { NotificationBell } from "@/components/ui/notification-bell";
import { DashboardSearch } from "@/app/dashboard/_components/dashboard-search";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import { useSidebar } from "@/components/ui/sidebar";

import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import {
  fetchNotificationsAction,
  markAllReadAction,
  markSingleReadAction,
  clearReadNotificationsAction,
  type NotificationItem,
} from "@/app/actions/notifications";
import { toast } from "@heroui/react";

const NewBookingModal = dynamic(
  () => import("@/components/bookings/new-booking-modal").then((mod) => mod.NewBookingModal),
  { ssr: false },
);

// Props

export interface AppHeaderProps {
  hotelId?: string;
  staffId?: string;
  notificationCount?: number;
  roomTypes?: { id: string; name: string; base_price: number }[];
  currency?: string;
  bookingUrl?: string;
}

// Notification type icon

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

// Component

export function AppHeader({
  hotelId,
  staffId,
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

  void _bookingUrl;

  // ── Notifications dialog overlay state
  const notifState = useOverlayState();
  const [newBookingOpen, setNewBookingOpen] = React.useState(false);
  const openNewBooking = React.useCallback(() => setNewBookingOpen(true), []);

  // ── Audio
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

  // Notifications
  const [liveCount, setLiveCount] = React.useState(notificationCount);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(
    [],
  );
  const [selectedNotification, setSelectedNotification] = React.useState<NotificationItem | null>(null);

  const fetchNotifications = React.useCallback(async () => {
    if (!hotelId) return;
    const res = await fetchNotificationsAction(hotelId);
    if (res.success) {
      setNotifications(res.data);
      setLiveCount(res.unreadCount);
    }
  }, [hotelId]);

  const clearRead = React.useCallback(async () => {
    if (!hotelId) return;
    const res = await clearReadNotificationsAction(hotelId);
    if (!res.success) toast.danger(res.error);
    else fetchNotifications();
  }, [hotelId, fetchNotifications]);

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
      setSelectedNotification(n);
    },
    [],
  );

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setLiveCount(notificationCount);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [notificationCount]);

  // Other surfaces (guest profile sheet) can open the booking wizard via this event.
  React.useEffect(() => {
    const open = () => setNewBookingOpen(true);
    window.addEventListener("roomline:new-booking", open);
    return () => window.removeEventListener("roomline:new-booking", open);
  }, []);

  //  Realtime subscription
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

        const reportStatus = onRealtimeStatus({
          label: "notifications",
          hotelId: hId,
          table: "notifications",
        });

        function handleStatus(status: string, err?: unknown) {
          if (status === "SUBSCRIBED") {
            resubscribeAttempts = 0;
            return;
          }
          if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;

          console.warn(`Realtime notifications: ${status}`, err ?? "");
          // Reported once per outage rather than once per retry: the loop below
          // makes up to five attempts on the same broken channel.
          if (resubscribeAttempts === 0) {
            reportStatus(status, err instanceof Error ? err : undefined);
          }
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
                const recipient = payload.new.recipient_staff_id;
                if (recipient && recipient !== staffId) return;
                console.log("Realtime: notification INSERT", payload);

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
  }, [hotelId, staffId, isLoaded, getToken, playChime, fetchNotifications]);

  // Render

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
        {/*  Left  */}
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
            <span className="truncate text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-foreground/80">
              RoomLine
            </span>
          </button>
        </div>

        {/*  Center: inline global search (desktop field + mobile icon)  */}
        <div className="flex flex-1 items-center justify-end md:mx-auto md:max-w-lg md:justify-center">
          <DashboardSearch onNewBooking={openNewBooking} />
        </div>

        {/* ── Right: actions  */}
        <div className="flex shrink-0 items-center gap-1.5">

          {/* New Booking */}
          <Button
            variant="primary"
            size="sm"
            onPress={() => setNewBookingOpen(true)}
            aria-label="New booking"
            className="inline-flex h-8 gap-1.5 rounded-lg text-xs"
          >
            <Plus className="size-3.5" />
          </Button>

          {/* ── Notifications — full HeroUI dialog for desktop and mobile ── */}
          <NotificationBell
            count={liveCount}
            max={9}
            color="red"
            size={36}
            onClick={notifState.open}
            aria-haspopup="dialog"
            aria-expanded={notifState.isOpen}
            className="shrink-0"
          />
          <Modal.Backdrop
            isOpen={notifState.isOpen}
            onOpenChange={(isOpen) => {
              notifState.setOpen(isOpen);
              if (isOpen) fetchNotifications();
              else setSelectedNotification(null);
            }}
          >
              <Modal.Container>
              <Modal.Dialog className="flex h-[min(88dvh,44rem)] w-[calc(100%-1rem)] max-w-2xl flex-col overflow-hidden p-0 sm:w-full">
                <Modal.CloseTrigger />
                {/* Panel header */}
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
                  <span className="text-sm font-semibold text-foreground">
                    Notifications
                  </span>
                  {(liveCount > 0 || notifications.some((n) => n.is_read)) && (
                    <div className="flex items-center gap-3">
                    {notifications.some((n) => n.is_read) && <button type="button" onClick={clearRead} className="text-[11px] text-muted-foreground hover:text-foreground">Clear read</button>}
                    {liveCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="cursor-pointer text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Mark all read
                    </button>
                    )}</div>
                  )}
                </div>

                {/* Notification list */}
                <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,18rem)_1fr]">
                <div className={cn("min-h-0 overflow-y-auto border-border/60 md:block md:border-r", selectedNotification && "hidden")}>
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
                            "bg-blue-50/20",
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

                <div className={cn("min-h-0 overflow-y-auto p-5 md:block md:p-6", !selectedNotification && "hidden md:block")}>
                  {selectedNotification ? (
                    <div className="space-y-5">
                      <button type="button" onClick={() => setSelectedNotification(null)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground md:hidden"><ArrowLeft className="size-4" />Back to notifications</button>
                      <div className="flex items-start gap-3">
                        <NotifIcon type={selectedNotification.type} />
                        <div><h3 className="text-base font-semibold">{selectedNotification.title}</h3><p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(selectedNotification.created_at, { fallback: "", justNow: "just now" })}</p></div>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">{selectedNotification.message}</p>
                      {selectedNotification.booking_id && <Button onPress={() => router.push(`/dashboard/bookings/${selectedNotification.booking_id}`)}>Open booking</Button>}
                    </div>
                  ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select notification to view details</div>}
                </div>
                </div>

                {/* Panel footer */}
                <div className="border-t border-border/60 px-3 py-2">
                  <p className="text-center text-xs text-muted-foreground">Notifications retained until cleared</p>
                </div>
              </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>


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

      <NewBookingModal
        open={newBookingOpen}
        onOpenChange={setNewBookingOpen}
        currency={currency}
      />
    </>
  );
}
