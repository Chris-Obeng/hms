"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Button,
  Chip,
  CloseButton,
  Drawer,
  Popover,
  ScrollShadow,
} from "@heroui/react";
import {
  ArrowUpRight,
  Bell,
  BellRing,
  CalendarCheck2,
  CalendarX2,
  CheckCheck,
  CheckCircle2,
  LogIn,
  LogOut,
  Settings2,
  TriangleAlert,
  UserCheck,
  Wallet,
  X,
} from "lucide-react";
import { NotificationBell } from "@/components/ui/notification-bell";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/hooks/use-notifications";
import { useAppBadge } from "@/hooks/use-app-badge";
import {
  presentStaffNotification,
  type StaffNotificationCategory,
} from "@/lib/notifications/staff-notifications";
import type { NotificationItem } from "@/app/actions/notifications";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface NotificationCenterProps {
  hotelId?: string;
  staffId?: string;
  initialUnreadCount?: number;
}

type FilterTab = "all" | "unread";

const CATEGORY_ICON_STYLE: Record<
  StaffNotificationCategory,
  { tone: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }
> = {
  booking: {
    tone: "bg-blue-500/10 text-blue-600 ring-blue-500/15",
    Icon: CalendarCheck2,
  },
  payment: {
    tone: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/15",
    Icon: Wallet,
  },
  attention: {
    tone: "bg-amber-500/12 text-amber-700 ring-amber-500/20",
    Icon: TriangleAlert,
  },
  cancellation: {
    tone: "bg-rose-500/10 text-rose-600 ring-rose-500/15",
    Icon: CalendarX2,
  },
  arrival: {
    tone: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/15",
    Icon: LogIn,
  },
  departure: {
    tone: "bg-sky-500/10 text-sky-600 ring-sky-500/15",
    Icon: LogOut,
  },
  team: {
    tone: "bg-violet-500/10 text-violet-600 ring-violet-500/15",
    Icon: UserCheck,
  },
  general: {
    tone: "bg-primary/10 text-primary ring-primary/15",
    Icon: BellRing,
  },
};

function CategoryIconChip({ category }: { category: StaffNotificationCategory }) {
  const { tone, Icon } = CATEGORY_ICON_STYLE[category] ?? CATEGORY_ICON_STYLE.general;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
        tone
      )}
    >
      <Icon className="size-[16px]" strokeWidth={1.9} />
    </span>
  );
}

function NotificationSkeletonList() {
  return (
    <div className="divide-y divide-border/45" aria-busy="true" aria-label="Loading notifications">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="flex items-start gap-3 px-4 py-4">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-2/5 rounded-md" />
              <Skeleton className="h-3 w-11 rounded-md" />
            </div>
            <Skeleton className="h-3 w-4/5 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationEmptyState({ filter }: { filter: FilterTab }) {
  if (filter === "unread") {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <span
          aria-hidden="true"
          className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/15"
        >
          <CheckCircle2 className="size-5" strokeWidth={1.9} />
        </span>
        <p className="text-sm font-semibold text-foreground">
          You&apos;re all caught up
        </p>
        <p className="mt-1 max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
          No unread updates right now. Switch to All to see earlier activity.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-inset ring-border/70"
      >
        <Bell className="size-5" strokeWidth={1.9} />
      </span>
      <p className="text-sm font-semibold text-foreground">
        No notifications yet
      </p>
      <p className="mt-1 max-w-[28ch] text-xs leading-relaxed text-muted-foreground">
        New bookings, guest payments, and daily check-in reminders will appear here automatically.
      </p>
    </div>
  );
}

interface NotificationRowProps {
  item: NotificationItem;
  onActivate: (item: NotificationItem, href: string | null) => void;
  onDismiss: (id: string) => void;
}

const NotificationRow = React.memo(function NotificationRow({
  item,
  onActivate,
  onDismiss,
}: NotificationRowProps) {
  const presented = React.useMemo(() => presentStaffNotification(item), [item]);
  const relativeTime = formatRelativeTime(item.created_at, {
    fallback: "",
    justNow: "Just now",
  });

  return (
    <div
      className={cn(
        "group/notif relative flex items-start border-b border-border/45 last:border-b-0",
        "transition-colors duration-150",
        !item.is_read ? "bg-primary/[0.035]" : "bg-transparent",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/50"
      )}
    >
      <button
        type="button"
        onClick={() => onActivate(item, presented.href)}
        className={cn(
          "flex w-full min-w-0 flex-1 cursor-pointer items-start gap-3 px-4 py-4 pr-12 text-left outline-none",
          "touch-manipulation select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
          "active:opacity-85"
        )}
      >
        <CategoryIconChip category={presented.category} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {!item.is_read && (
                <>
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full bg-primary"
                  />
                  <span className="sr-only">Unread: </span>
                </>
              )}
              <p
                className={cn(
                  "truncate text-sm leading-snug tracking-[-0.01em]",
                  !item.is_read
                    ? "font-semibold text-foreground"
                    : "font-medium text-foreground/85"
                )}
              >
                {presented.title}
              </p>
            </div>

            {relativeTime && (
              <span className="shrink-0 text-2xs font-normal tabular-nums text-muted-foreground">
                {relativeTime}
              </span>
            )}
          </div>

          {presented.message && (
            <p className="mt-1 line-clamp-2 text-xs leading-[1.45] text-muted-foreground">
              {presented.message}
            </p>
          )}

          {(presented.actionLabel || presented.reference) && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {presented.actionLabel && (
                <span className="inline-flex items-center gap-1 text-2xs font-semibold text-primary">
                  {presented.actionLabel}
                  <ArrowUpRight className="size-3" />
                </span>
              )}
              {presented.reference && (
                <span className="text-2xs tabular-nums text-muted-foreground/75">
                  Ref #{presented.reference}
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      <button
        type="button"
        aria-label="Dismiss notification"
        title="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(item.id);
        }}
        className={cn(
          "ui-press absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground/65 outline-none",
          "max-md:size-11 max-md:top-2 max-md:right-1 max-md:opacity-100",
          "md:opacity-0 md:group-hover/notif:opacity-100 md:focus-visible:opacity-100",
          "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring/50"
        )}
      >
        <X className="size-4 max-md:size-4" />
      </button>
    </div>
  );
});

export interface NotificationPanelProps {
  notifications: NotificationItem[];
  unreadCount: number;
  readCount: number;
  isLoading: boolean;
  hasLoaded: boolean;
  isDesktop: boolean;
  filter: FilterTab;
  onFilterChange: (next: FilterTab) => void;
  onMarkAllRead: () => void;
  onClearRead: () => void;
  onActivateRow: (item: NotificationItem, href: string | null) => void;
  onDismissRow: (id: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

export function NotificationPanel({
  notifications,
  unreadCount,
  readCount,
  isLoading,
  hasLoaded,
  isDesktop,
  filter,
  onFilterChange,
  onMarkAllRead,
  onClearRead,
  onActivateRow,
  onDismissRow,
  onOpenSettings,
  onClose,
}: NotificationPanelProps) {
  const visibleItems = React.useMemo(
    () =>
      filter === "unread"
        ? notifications.filter((item) => !item.is_read)
        : notifications,
    [notifications, filter]
  );

  const canMarkAllRead = unreadCount > 0;
  const canClearRead = readCount > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Tier 1: Title & Preferences chrome — isolated from dynamic list actions */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3 max-md:pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-md font-semibold tracking-[-0.01em] text-foreground">
            Notifications
          </h2>
          {unreadCount > 0 && (
            <Chip
              size="sm"
              variant="soft"
              color="accent"
              className="h-5 shrink-0 rounded-full px-2 text-2xs font-semibold tabular-nums"
            >
              {unreadCount} new
            </Chip>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={onOpenSettings}
            aria-label="Notification settings"
            className="size-8 rounded-lg text-muted-foreground max-md:size-11 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
          >
            <Settings2 className="size-4 max-md:size-[16px]" />
          </Button>
          {!isDesktop && (
            <CloseButton
              aria-label="Close notifications"
              onPress={onClose}
              className="size-11 rounded-lg text-muted-foreground"
            />
          )}
        </div>
      </div>

      {/* Tier 2: Fixed-height filter + stable action bar (never mounts/unmounts or shifts) */}
      <div className="flex h-10 max-md:h-11 shrink-0 items-center justify-between gap-2 border-y border-border/60 bg-muted/30 px-4 max-md:px-3">
        <div
          role="tablist"
          aria-label="Filter notifications"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-muted/70 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            onClick={() => onFilterChange("all")}
            className={cn(
              "ui-press inline-flex h-8 max-md:h-8 cursor-pointer items-center whitespace-nowrap rounded-md px-3 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              filter === "all"
                ? "bg-card font-semibold text-foreground shadow-2xs ring-1 ring-border/60"
                : "font-medium text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            )}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "unread"}
            onClick={() => onFilterChange("unread")}
            className={cn(
              "ui-press inline-flex h-8 max-md:h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-3 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              filter === "unread"
                ? "bg-card font-semibold text-foreground shadow-2xs ring-1 ring-border/60"
                : "font-medium text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            )}
          >
            <span>Unread</span>
            <span
              className={cn(
                "tabular-nums text-2xs",
                unreadCount > 0 ? "text-primary font-semibold" : "text-muted-foreground/70"
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!canMarkAllRead}
            onClick={onMarkAllRead}
            className={cn(
              "ui-press inline-flex h-8 max-md:h-10 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/50",
              canMarkAllRead
                ? "cursor-pointer text-foreground/85 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                : "pointer-events-none text-muted-foreground opacity-40"
            )}
          >
            <CheckCheck className="size-4 shrink-0" />
            <span className="max-[360px]:hidden">Mark all read</span>
            <span className="min-[361px]:hidden" aria-hidden="true">
              Read all
            </span>
          </button>

          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border/70" />

          <button
            type="button"
            disabled={!canClearRead}
            onClick={onClearRead}
            className={cn(
              "ui-press inline-flex h-8 max-md:h-10 items-center whitespace-nowrap rounded-md px-2 text-xs font-medium outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/50",
              canClearRead
                ? "cursor-pointer text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                : "pointer-events-none text-muted-foreground opacity-40"
            )}
          >
            Clear read
          </button>
        </div>
      </div>

      {/* Scrollable feed with soft edge shadow — data-slot="drawer-body" + touch-pan-y
          excludes feed from HeroUI Drawer.Dialog pointer-capture sheet dragging */}
      <ScrollShadow
        data-slot="drawer-body"
        size={24}
        className="native-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y"
      >
        {isLoading && !hasLoaded && notifications.length === 0 ? (
          <NotificationSkeletonList />
        ) : visibleItems.length === 0 ? (
          <NotificationEmptyState filter={filter} />
        ) : (
          <div>
            {visibleItems.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                onActivate={onActivateRow}
                onDismiss={onDismissRow}
              />
            ))}
          </div>
        )}
      </ScrollShadow>
    </div>
  );
}

export function NotificationCenter({
  hotelId,
  staffId,
  initialUnreadCount = 0,
}: NotificationCenterProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(true);
  const [filter, setFilter] = React.useState<FilterTab>("all");

  const {
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
  } = useNotifications({
    hotelId,
    staffId,
    initialUnreadCount,
    enabled: Boolean(hotelId),
  });

  // Show the unread count on the installed app icon (dock / home screen).
  useAppBadge(unreadCount);

  // Track breakpoint via capability/viewport media query so desktop renders an
  // origin-anchored Popover and mobile renders a bottom Drawer sheet.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Close panel only when the route pathname actually changes (never on initial mount)
  const prevPathnameRef = React.useRef(pathname);
  React.useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    const id = requestAnimationFrame(() => setIsOpen(false));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setIsOpen(nextOpen);
      if (nextOpen) {
        void refresh();
      }
    },
    [refresh]
  );

  const handleActivateRow = React.useCallback(
    (item: NotificationItem, href: string | null) => {
      if (!item.is_read) {
        void markRead(item.id, true);
      }
      if (href) {
        setIsOpen(false);
        router.push(href);
      }
    },
    [markRead, router]
  );

  const handleOpenSettings = React.useCallback(() => {
    setIsOpen(false);
    router.push("/dashboard/settings/notifications");
  }, [router]);

  const panelContent = (
    <NotificationPanel
      notifications={notifications}
      unreadCount={unreadCount}
      readCount={readCount}
      isLoading={isLoading}
      hasLoaded={hasLoaded}
      isDesktop={isDesktop}
      filter={filter}
      onFilterChange={setFilter}
      onMarkAllRead={() => void markAllRead()}
      onClearRead={() => void clearRead()}
      onActivateRow={handleActivateRow}
      onDismissRow={(id) => void archiveOne(id)}
      onOpenSettings={handleOpenSettings}
      onClose={() => setIsOpen(false)}
    />
  );

  return (
    <>
      {isDesktop ? (
        <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
          <NotificationBell
            count={unreadCount}
            max={99}
            color="danger"
            ringSignal={ringSignal}
            isOpen={isOpen}
          />

          <Popover.Content
            placement="bottom end"
            offset={8}
            shouldFlip
            className="w-[26rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-border/80 bg-popover p-0 shadow-[0_14px_40px_-10px_rgba(15,23,42,0.16),0_2px_10px_-3px_rgba(15,23,42,0.06)]"
          >
            <Popover.Dialog
              aria-label="Notifications"
              className="flex max-h-[min(78dvh,36rem)] flex-col overflow-hidden p-0 outline-none"
            >
              {panelContent}
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      ) : (
        <NotificationBell
          count={unreadCount}
          max={99}
          color="danger"
          ringSignal={ringSignal}
          isOpen={isOpen}
          onPress={() => handleOpenChange(!isOpen)}
        />
      )}

      {/* Mobile: native-feeling HeroUI bottom Drawer sheet */}
      <Drawer.Backdrop
        isOpen={isOpen && !isDesktop}
        onOpenChange={handleOpenChange}
        variant="blur"
      >
        <Drawer.Content placement="bottom">
          <Drawer.Dialog
            aria-label="Notifications"
            className="flex max-h-[86dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border/70 bg-popover p-0 pb-[env(safe-area-inset-bottom)]"
          >
            <Drawer.Handle className="pt-3 pb-1" />
            {panelContent}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  );
}
