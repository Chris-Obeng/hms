"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { Plus, Menu } from "lucide-react";
import { Avatar, Button, Separator } from "@heroui/react";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { DashboardSearch } from "@/app/dashboard/_components/dashboard-search";
import type { GuestSearchResult } from "@/app/actions/customers";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { RoomLineMark } from "@/components/brand/roomline-mark";

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

const ICON_BUTTON =
  "size-11 min-w-11 shrink-0 rounded-lg text-muted-foreground md:size-8 md:min-w-8 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground";

export function AppHeader({
  hotelId,
  staffId,
  notificationCount = 0,
  roomTypes: _roomTypes = [],
  currency = "GHS",
  bookingUrl: _bookingUrl,
}: AppHeaderProps) {
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const { toggleSidebar } = useSidebar();

  void _roomTypes;
  void _bookingUrl;

  const [newBookingOpen, setNewBookingOpen] = React.useState(false);
  const [prefillGuest, setPrefillGuest] = React.useState<GuestSearchResult | null>(null);
  const openNewBooking = React.useCallback(() => {
    setPrefillGuest(null);
    setNewBookingOpen(true);
  }, []);

  // Other surfaces (guest profile sheet, empty states) can open the booking wizard via this event.
  React.useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ guest?: GuestSearchResult } | undefined>).detail;
      setPrefillGuest(detail?.guest ?? null);
      setNewBookingOpen(true);
    };
    window.addEventListener("roomline:new-booking", open);
    return () => window.removeEventListener("roomline:new-booking", open);
  }, []);

  const initials = user ? (user.firstName?.[0] ?? "U") + (user.lastName?.[0] ?? "") : "";

  return (
    <>
      <header
        data-slot="app-header"
        className={cn(
          "fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 px-2 sm:gap-4 sm:px-4 lg:px-6",
          "border-b border-border/50 bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/70"
        )}
      >
        {/* Left: menu + brand */}
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={toggleSidebar}
            aria-label="Toggle sidebar"
            className={ICON_BUTTON}
          >
            <Menu className="size-5" />
          </Button>

          <Link
            href="/dashboard"
            aria-label="RoomLine front desk"
            className="ui-press flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1 md:min-h-10 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <RoomLineMark size={24} />
            <span className="truncate text-md font-bold tracking-tight text-foreground">
              RoomLine
            </span>
          </Link>
        </div>

        {/* Centre: global search (field on md+, icon on phones) */}
        <div className="flex flex-1 items-center justify-end md:justify-center">
          <DashboardSearch onNewBooking={openNewBooking} />
        </div>

        {/* Right: primary action, notifications, account */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="primary"
            size="sm"
            onPress={openNewBooking}
            aria-label="New booking"
            className="min-w-10 gap-2 rounded-lg px-0 text-sm font-semibold max-sm:size-11 sm:px-3"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">New booking</span>
          </Button>

          <NotificationCenter
            hotelId={hotelId}
            staffId={staffId}
            initialUnreadCount={notificationCount}
          />

          {isLoaded && user && (
            <>
              <Separator orientation="vertical" className="mx-1 hidden h-4 self-center md:block" />
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                aria-label="Open user profile"
                onPress={() => openUserProfile()}
                className={cn(ICON_BUTTON, "hidden md:inline-flex")}
              >
                <Avatar size="sm" className="size-6 rounded-full">
                  {user.imageUrl && <Avatar.Image src={user.imageUrl} alt="" />}
                  <Avatar.Fallback className="text-2xs font-semibold">{initials}</Avatar.Fallback>
                </Avatar>
              </Button>
            </>
          )}
        </div>
      </header>

      <NewBookingModal
        open={newBookingOpen}
        onOpenChange={(next) => {
          setNewBookingOpen(next);
          if (!next) setPrefillGuest(null);
        }}
        prefillGuest={prefillGuest}
        currency={currency}
      />
    </>
  );
}
