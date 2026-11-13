"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { toast } from "@heroui/react";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import {
  archiveSingleNotificationAction,
  clearReadNotificationsAction,
  fetchNotificationsAction,
  markAllReadAction,
  markSingleReadAction,
  type NotificationItem,
} from "@/app/actions/notifications";
import { presentStaffNotification } from "@/lib/notifications/staff-notifications";
import {
  readBrowserAlertsPreference,
  syncPushSubscriptionStatus,
} from "@/lib/push";

export interface UseNotificationsOptions {
  hotelId?: string;
  staffId?: string;
  initialUnreadCount?: number;
  enabled?: boolean;
}

export interface UseNotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
  readCount: number;
  isLoading: boolean;
  hasLoaded: boolean;
  ringSignal: number;
  refresh: () => Promise<void>;
  markRead: (id: string, isRead?: boolean) => Promise<void>;
  archiveOne: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearRead: () => Promise<void>;
}

function sortFeedDescending(items: NotificationItem[]): NotificationItem[] {
  return [...items]
    .sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    })
    .slice(0, 40);
}

/**
 * Race-free notification state + Supabase Realtime synchronization.
 *
 * Guarantees:
 * 1. Synchronous ref mirrors (`notificationsRef`, `unreadCountRef`) + per-ID
 *    in-flight guards prevent same-frame double-taps from double-decrementing
 *    the badge or firing duplicate archive calls.
 * 2. Surgical inverse-delta rollbacks restore only the failed item(s) without
 *    wiping concurrent Realtime arrivals or sibling dismissals.
 * 3. Deferred resync (`needsResyncRef`) catches Realtime `UPDATE` events that
 *    land mid-mutation and backfills older unread rows when `clearRead` /
 *    `archiveOne` shrinks a >40 feed.
 * 4. Waits for Clerk `isLoaded` before opening the Realtime channel so initial
 *    page hydration never subscribes as `anon`, and auto-recovers on `online`
 *    and `visibilitychange` across long front-desk shifts.
 */
export function useNotifications({
  hotelId,
  staffId,
  initialUnreadCount = 0,
  enabled = true,
}: UseNotificationsOptions): UseNotificationsResult {
  const auth = useAuth();
  const getToken = auth.getToken;
  // In unit tests mocking `{ getToken }` without `isLoaded`, treat undefined as ready;
  // in browser runtime, `isLoaded === false` waits until Clerk finishes hydrating.
  const authReady = auth.isLoaded !== false;

  const getTokenRef = React.useRef(getToken);
  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = React.useState<number>(() =>
    Math.max(0, initialUnreadCount)
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [hasLoaded, setHasLoaded] = React.useState<boolean>(false);
  const [ringSignal, setRingSignal] = React.useState<number>(0);

  // Synchronous mirrors & concurrency guards
  const notificationsRef = React.useRef<NotificationItem[]>(notifications);
  const unreadCountRef = React.useRef<number>(unreadCount);
  const hasLoadedRef = React.useRef<boolean>(false);
  const mutationEpochRef = React.useRef<number>(0);
  const pendingMutationsRef = React.useRef<number>(0);
  const inFlightIdsRef = React.useRef<Set<string>>(new Set());
  const needsResyncRef = React.useRef<boolean>(false);
  const fetchSeqRef = React.useRef<number>(0);
  const seenInsertIdsRef = React.useRef<Set<string>>(new Set());
  const chimeRef = React.useRef<HTMLAudioElement | null>(null);

  const commitNotifications = React.useCallback(
    (updater: NotificationItem[] | ((curr: NotificationItem[]) => NotificationItem[])) => {
      const next =
        typeof updater === "function" ? updater(notificationsRef.current) : updater;
      notificationsRef.current = next;
      setNotifications(next);
      return next;
    },
    []
  );

  const commitUnreadCount = React.useCallback(
    (updater: number | ((curr: number) => number)) => {
      const raw =
        typeof updater === "function" ? updater(unreadCountRef.current) : updater;
      const next = Math.max(0, raw);
      unreadCountRef.current = next;
      setUnreadCount(next);
      return next;
    },
    []
  );

  // Preload front-desk chime audio
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio("/audio/chime.mp3");
    audio.volume = 0.5;
    chimeRef.current = audio;
  }, []);

  // Reconcile shared-workstation browser PushSubscription ownership on shift login
  React.useEffect(() => {
    if (!enabled || !staffId || typeof window === "undefined") return;
    void syncPushSubscriptionStatus();
  }, [enabled, staffId]);

  const playChime = React.useCallback(() => {
    const audio = chimeRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Autoplay policy before first user gesture — safe to ignore.
      });
    } catch {
      // Ignore audio device errors
    }
  }, []);

  // Sync SSR prop ONLY when hotelId changes, so RSC layout re-renders never jump
  // the live badge backward.
  const prevHotelIdRef = React.useRef(hotelId);
  React.useEffect(() => {
    if (prevHotelIdRef.current !== hotelId) {
      prevHotelIdRef.current = hotelId;
      mutationEpochRef.current += 1;
      seenInsertIdsRef.current.clear();
      inFlightIdsRef.current.clear();
      needsResyncRef.current = false;
      hasLoadedRef.current = false;
      commitNotifications([]);
      commitUnreadCount(initialUnreadCount);
      setHasLoaded(false);
    }
  }, [hotelId, initialUnreadCount, commitNotifications, commitUnreadCount]);

  const refresh = React.useCallback(async () => {
    if (!hotelId) return;
    const seq = ++fetchSeqRef.current;
    const epochAtStart = mutationEpochRef.current;

    if (!hasLoadedRef.current) setIsLoading(true);
    try {
      const res = await fetchNotificationsAction(hotelId);
      if (
        seq !== fetchSeqRef.current ||
        epochAtStart !== mutationEpochRef.current ||
        pendingMutationsRef.current > 0
      ) {
        return;
      }
      if (res?.success) {
        for (const item of res.data) {
          seenInsertIdsRef.current.add(item.id);
        }
        commitNotifications(res.data);
        commitUnreadCount(res.unreadCount);
        hasLoadedRef.current = true;
        setHasLoaded(true);
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [hotelId, commitNotifications, commitUnreadCount]);

  const refreshRef = React.useRef(refresh);
  React.useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const finishMutation = React.useCallback(() => {
    pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
    if (pendingMutationsRef.current === 0 && needsResyncRef.current) {
      needsResyncRef.current = false;
      void refreshRef.current();
    }
  }, []);

  // ── Optimistic Mutations ──────────────────────────────────────────────────

  const markRead = React.useCallback(
    async (id: string, nextRead = true) => {
      if (inFlightIdsRef.current.has(id)) return;
      const target = notificationsRef.current.find((n) => n.id === id);
      if (!target || target.is_read === nextRead) return;

      inFlightIdsRef.current.add(id);
      mutationEpochRef.current += 1;
      const epochAfterOptimistic = mutationEpochRef.current;
      pendingMutationsRef.current += 1;

      commitUnreadCount((prev) => prev + (nextRead ? -1 : 1));
      commitNotifications((curr) =>
        curr.map((item) => (item.id === id ? { ...item, is_read: nextRead } : item))
      );

      const rollback = (message: string) => {
        mutationEpochRef.current += 1;
        const stillMatches = notificationsRef.current.find(
          (item) => item.id === id && item.is_read === nextRead
        );
        if (stillMatches) {
          commitNotifications((curr) =>
            curr.map((item) => (item.id === id ? { ...item, is_read: !nextRead } : item))
          );
          commitUnreadCount((prev) => prev + (nextRead ? 1 : -1));
        }
        if (mutationEpochRef.current !== epochAfterOptimistic + 1) {
          needsResyncRef.current = true;
        }
        toast.danger(message);
      };

      try {
        const res = await markSingleReadAction(id, nextRead);
        if (!res.success) {
          rollback(res.error || "Could not update notification");
        }
      } catch {
        rollback("Could not update notification");
      } finally {
        inFlightIdsRef.current.delete(id);
        finishMutation();
      }
    },
    [commitNotifications, commitUnreadCount, finishMutation]
  );

  const archiveOne = React.useCallback(
    async (id: string) => {
      if (inFlightIdsRef.current.has(id)) return;
      const target = notificationsRef.current.find((n) => n.id === id);
      if (!target) return;

      inFlightIdsRef.current.add(id);
      mutationEpochRef.current += 1;
      const epochAfterOptimistic = mutationEpochRef.current;
      pendingMutationsRef.current += 1;

      const wasUnread = !target.is_read;
      if (wasUnread) {
        commitUnreadCount((prev) => prev - 1);
      }
      const nextList = commitNotifications((curr) =>
        curr.filter((item) => item.id !== id)
      );

      const rollback = (message: string) => {
        mutationEpochRef.current += 1;
        const alreadyPresent = notificationsRef.current.some((item) => item.id === id);
        if (!alreadyPresent) {
          commitNotifications((curr) => sortFeedDescending([target, ...curr]));
          if (wasUnread) {
            commitUnreadCount((prev) => prev + 1);
          }
        }
        if (mutationEpochRef.current !== epochAfterOptimistic + 1) {
          needsResyncRef.current = true;
        }
        toast.danger(message);
      };

      try {
        const res = await archiveSingleNotificationAction(id);
        if (!res.success) {
          rollback(res.error || "Could not dismiss notification");
        } else {
          const visibleUnread = nextList.reduce(
            (acc, item) => acc + (!item.is_read ? 1 : 0),
            0
          );
          if (visibleUnread < unreadCountRef.current) {
            needsResyncRef.current = true;
          }
        }
      } catch {
        rollback("Could not dismiss notification");
      } finally {
        inFlightIdsRef.current.delete(id);
        finishMutation();
      }
    },
    [commitNotifications, commitUnreadCount, finishMutation]
  );

  const markAllRead = React.useCallback(async () => {
    if (!hotelId) return;
    const prevList = notificationsRef.current;
    const prevUnread = unreadCountRef.current;
    const flippedIds = new Set(
      prevList.filter((item) => !item.is_read).map((item) => item.id)
    );
    if (prevUnread === 0 && flippedIds.size === 0) return;

    mutationEpochRef.current += 1;
    const epochAfterOptimistic = mutationEpochRef.current;
    pendingMutationsRef.current += 1;

    commitUnreadCount(0);
    commitNotifications((curr) => curr.map((item) => ({ ...item, is_read: true })));

    const rollback = (message: string) => {
      mutationEpochRef.current += 1;
      commitNotifications((curr) =>
        curr.map((item) =>
          flippedIds.has(item.id) ? { ...item, is_read: false } : item
        )
      );
      commitUnreadCount((curr) => curr + prevUnread);
      if (mutationEpochRef.current !== epochAfterOptimistic + 1) {
        needsResyncRef.current = true;
      }
      toast.danger(message);
    };

    try {
      const res = await markAllReadAction(hotelId);
      if (!res.success) {
        rollback(res.error || "Could not mark notifications as read");
      }
    } catch {
      rollback("Could not mark notifications as read");
    } finally {
      finishMutation();
    }
  }, [hotelId, commitNotifications, commitUnreadCount, finishMutation]);

  const clearRead = React.useCallback(async () => {
    if (!hotelId) return;
    const clearedItems = notificationsRef.current.filter((item) => item.is_read);
    if (clearedItems.length === 0) return;

    mutationEpochRef.current += 1;
    const epochAfterOptimistic = mutationEpochRef.current;
    pendingMutationsRef.current += 1;

    const remainingList = commitNotifications((curr) =>
      curr.filter((item) => !item.is_read)
    );

    const rollback = (message: string) => {
      mutationEpochRef.current += 1;
      commitNotifications((curr) => {
        const existingIds = new Set(curr.map((item) => item.id));
        const restored = clearedItems.filter((item) => !existingIds.has(item.id));
        return sortFeedDescending([...curr, ...restored]);
      });
      if (mutationEpochRef.current !== epochAfterOptimistic + 1) {
        needsResyncRef.current = true;
      }
      toast.danger(message);
    };

    try {
      const res = await clearReadNotificationsAction(hotelId);
      if (!res.success) {
        rollback(res.error || "Could not clear read notifications");
      } else {
        const visibleUnread = remainingList.reduce(
          (acc, item) => acc + (!item.is_read ? 1 : 0),
          0
        );
        if (visibleUnread < unreadCountRef.current) {
          needsResyncRef.current = true;
        }
      }
    } catch {
      rollback("Could not clear read notifications");
    } finally {
      finishMutation();
    }
  }, [hotelId, commitNotifications, finishMutation]);

  // ── Initial Server Load (0ms, independent of Clerk browser hydration) ─────
  React.useEffect(() => {
    if (!hotelId || !enabled) return;
    void refreshRef.current();
  }, [hotelId, staffId, enabled]);

  // ── Realtime Subscription & Shift-Long Connection Recovery ────────────────
  React.useEffect(() => {
    if (!hotelId || !enabled || !authReady) return;
    const hId = hotelId;
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let supabase: any = null;
    let authInterval: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let resubscribeAttempts = 0;
    let isSubscribed = false;

    async function maybeShowForegroundBrowserAlert(item: NotificationItem) {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      if (!readBrowserAlertsPreference(staffId)) return;

      // Avoid duplicate OS banners when an active Web Push subscription owned
      // by this staff member is registered on the service worker.
      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration("/");
          const sub = await reg?.pushManager.getSubscription();
          if (sub) return;
        }
      } catch {
        // Fall through to foreground Notification API
      }

      try {
        const presented = presentStaffNotification(item);
        const n = new Notification(presented.title, {
          body: presented.message,
          icon: "/icons/icon-192x192.png",
          badge: "/icons/badge-96x96.png",
          tag: `roomline-notif-${item.id}`,
        });
        if (presented.href) {
          const targetHref = presented.href;
          n.onclick = () => {
            window.focus();
            window.location.assign(targetHref);
            n.close();
          };
        }
      } catch {
        // Ignore environments where Notification constructor is restricted (e.g. mobile SW-only)
      }
    }

    async function refreshRealtimeAuth() {
      try {
        const token = await getTokenRef.current({ template: "supabase" });
        if (!active || !token || !supabase) return;
        supabase.realtime.setAuth(token);
      } catch (e) {
        console.error("Realtime auth refresh failed:", e);
      }
    }

    const reportStatus = onRealtimeStatus({
      label: "notifications",
      hotelId: hId,
      table: "notifications",
    });

    function handleStatus(status: string, err?: unknown) {
      if (status === "SUBSCRIBED") {
        isSubscribed = true;
        resubscribeAttempts = 0;
        return;
      }
      if (status === "CLOSED") {
        isSubscribed = false;
        return;
      }
      if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;

      isSubscribed = false;
      if (resubscribeAttempts === 0) {
        reportStatus(status, err instanceof Error ? err : undefined);
      }
      if (!active || resubscribeAttempts >= 5) return;
      resubscribeAttempts += 1;

      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(async () => {
        await refreshRealtimeAuth();
        if (!active) return;
        openChannel();
      }, resubscribeAttempts * 2_000);
    }

    function openChannel() {
      if (!supabase) return;
      if (channel) supabase.removeChannel(channel);
      channel = buildChannel().subscribe(handleStatus);
    }

    function buildChannel() {
      return supabase
        .channel(`hotel:${hId}:notifications:${staffId ?? "staff"}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `hotel_id=eq.${hId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            const row = payload.new;
            const recipient = row.recipient_staff_id as string | null | undefined;
            if (recipient && (!staffId || recipient !== staffId)) return;
            if (row.archived_at) return;

            const id = String(row.id ?? "");
            if (!id || seenInsertIdsRef.current.has(id)) return;
            seenInsertIdsRef.current.add(id);

            // Advance mutation epoch so any older in-flight fetch cannot
            // overwrite this newly arrived alert with an N-1 server count.
            mutationEpochRef.current += 1;

            const newItem: NotificationItem = {
              id,
              type: (row.type as string | null) ?? null,
              title: String(row.title ?? "Hotel update"),
              message: String(row.message ?? ""),
              booking_id: (row.booking_id as string | null) ?? null,
              is_read: Boolean(row.is_read),
              created_at: (row.created_at as string | null) ?? new Date().toISOString(),
            };

            commitNotifications((curr) => [newItem, ...curr].slice(0, 40));
            if (!newItem.is_read) {
              commitUnreadCount((prev) => prev + 1);
              setRingSignal((prev) => prev + 1);

              try {
                const soundEnabled =
                  localStorage.getItem("RoomLine_sound_enabled") !== "false";
                if (soundEnabled) playChime();
              } catch {
                playChime();
              }

              void maybeShowForegroundBrowserAlert(newItem);
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `hotel_id=eq.${hId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            const row = payload.new;
            const recipient = row.recipient_staff_id as string | null | undefined;
            if (recipient && (!staffId || recipient !== staffId)) return;

            // If a local mutation is in flight, mark dirty so finishMutation()
            // reconciles any cross-tab changes once local writes settle.
            if (pendingMutationsRef.current > 0) {
              needsResyncRef.current = true;
              return;
            }

            if (updateDebounceTimer) clearTimeout(updateDebounceTimer);
            updateDebounceTimer = setTimeout(() => {
              if (!active) return;
              if (pendingMutationsRef.current > 0) {
                needsResyncRef.current = true;
                return;
              }
              void refreshRef.current();
            }, 300);
          }
        );
    }

    async function recoverConnection() {
      if (!active || !supabase) return;
      resubscribeAttempts = 0;
      await refreshRealtimeAuth();
      if (!active) return;
      if (!isSubscribed) {
        openChannel();
      }
      if (pendingMutationsRef.current === 0) {
        void refreshRef.current();
      } else {
        needsResyncRef.current = true;
      }
    }

    const handleOnline = () => {
      void recoverConnection();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void recoverConnection();
      }
    };

    async function initRealtime() {
      try {
        supabase = createClient();
        await refreshRealtimeAuth();
        if (!active) return;

        authInterval = setInterval(refreshRealtimeAuth, 45_000);
        openChannel();

        if (typeof window !== "undefined") {
          window.addEventListener("online", handleOnline);
        }
        if (typeof document !== "undefined") {
          document.addEventListener("visibilitychange", handleVisibilityChange);
        }
      } catch (err) {
        console.error("Failed to init notifications realtime:", err);
      }
    }

    void initRealtime();

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (authInterval) clearInterval(authInterval);
      if (retryTimer) clearTimeout(retryTimer);
      if (updateDebounceTimer) clearTimeout(updateDebounceTimer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [hotelId, staffId, enabled, authReady, playChime, commitNotifications, commitUnreadCount]);

  const readCount = React.useMemo(
    () => notifications.reduce((acc, item) => acc + (item.is_read ? 1 : 0), 0),
    [notifications]
  );

  return {
    notifications,
    unreadCount,
    readCount,
    isLoading,
    hasLoaded,
    ringSignal,
    refresh,
    markRead,
    archiveOne,
    markAllRead,
    clearRead,
  };
}
