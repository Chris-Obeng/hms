"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { Plus, Menu } from "lucide-react";
import { Avatar, Button } from "@heroui/react";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { DashboardSearch } from "@/app/dashboard/_components/dashboard-search";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

const NewBookingModal = dynamic(
  () => import("@/components/bookings/new-booking-modal").then((mod) => mod.NewBookingModal),
  { ssr: false }
);

export interface AppHeaderProps {
  hotelId?: string;
  staffId?: string;
  notificationCount?: number;
  roomTypes?: { id: string; name: string; base_price: number }[];
  currency?: string;
  bookingUrl?: string;
}

export function AppHeader({
  hotelId,
  staffId,
  notificationCount = 0,
  roomTypes: _roomTypes = [],
  currency = "GHS",
  bookingUrl: _bookingUrl,
}: AppHeaderProps) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const { toggleSidebar } = useSidebar();

  void _roomTypes;
  void _bookingUrl;

  const [newBookingOpen, setNewBookingOpen] = React.useState(false);
  const openNewBooking = React.useCallback(() => setNewBookingOpen(true), []);

  // Other surfaces (guest profile sheet) can open the booking wizard via this event.
  React.useEffect(() => {
    const open = () => setNewBookingOpen(true);
    window.addEventListener("roomline:new-booking", open);
    return () => window.removeEventListener("roomline:new-booking", open);
  }, []);

  return (
    <>
      <header
        data-slot="app-header"
        className={cn(
          "fixed left-0 right-0 top-0 z-30 flex items-center justify-between gap-2",
          "h-14 border-b border-border/60 bg-background/85 backdrop-blur-xl supports-backdrop-filter:bg-background/70",
          "px-3 md:px-4 lg:px-6"
        )}
      >
        {/* Left */}
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={toggleSidebar}
            aria-label="Toggle sidebar"
            className="size-8 shrink-0 rounded-lg text-muted-foreground transition-[transform,background-color,color] duration-150 ease-[var(--ease-out-ui)] active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
          >
            <Menu className="size-5" />
          </Button>

          <button
            type="button"
            onClick={() => router.push("/dashboard/settings/hotel")}
            title="Hotel settings"
            className="group flex min-w-0 cursor-pointer items-center gap-2 rounded-lg p-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className="truncate text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-foreground/80">
              RoomLine
            </span>
          </button>
        </div>

        {/* Center: inline global search (desktop field + mobile icon) */}
        <div className="flex flex-1 items-center justify-end md:mx-auto md:max-w-lg md:justify-center">
          <DashboardSearch onNewBooking={openNewBooking} />
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="primary"
            size="sm"
            onPress={() => setNewBookingOpen(true)}
            aria-label="New booking"
            className="inline-flex h-8 gap-1.5 rounded-lg text-xs"
          >
            <Plus className="size-3.5" />
          </Button>

          <NotificationCenter
            hotelId={hotelId}
            staffId={staffId}
            initialUnreadCount={notificationCount}
          />

          {/* User avatar — opens Clerk's UserProfile modal */}
          {isLoaded && user && (
            <div className="hidden md:block">
              <button
                type="button"
                aria-label="Open user profile"
                onClick={() => openUserProfile()}
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60"
              >
                <Avatar size="sm" className="size-6 rounded-md">
                  <Avatar.Image
                    src={user.imageUrl}
                    alt={user.fullName || "User"}
                  />
                  <Avatar.Fallback className="rounded-md bg-foreground/10 text-[10px] font-medium">
                    {(user.firstName?.[0] ?? "U") + (user.lastName?.[0] ?? "")}
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
