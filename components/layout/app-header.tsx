"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { Plus, Menu } from "lucide-react";
import { Avatar, Button } from "@heroui/react";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { DashboardSearch } from "@/app/dashboard/_components/dashboard-search";
import type { GuestSearchResult } from "@/app/actions/customers";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { OrielGlyph } from "@/components/brand/oriel-mark";

const NewBookingModal = dynamic(
  () => import("@/components/bookings/new-booking-modal").then((mod) => mod.NewBookingModal),
  { ssr: false }
);

export interface AppHeaderProps {
  hotelId?: string;
  /** Shown next to the mark so staff always know which property they are in. */
  hotelName?: string;
  staffId?: string;
  notificationCount?: number;
  roomTypes?: { id: string; name: string; base_price: number }[];
  currency?: string;
  bookingUrl?: string;
}

const ICON_BUTTON =
  "size-11 min-w-11 shrink-0 rounded-lg text-muted-foreground md:pointer-fine:size-8 md:pointer-fine:min-w-8 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground";

export function AppHeader({
  hotelId,
  hotelName,
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
          // Safe areas: the header grows under a notch / status bar and keeps
          // clear of landscape side insets, so it blends with the status bar.
          "fixed inset-x-0 top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 pt-[env(safe-area-inset-top)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:gap-4 sm:pr-[max(1rem,env(safe-area-inset-right))] lg:pl-[max(1.5rem,env(safe-area-inset-left))] lg:pr-[max(1.5rem,env(safe-area-inset-right))]",
          "border-b border-border/70 bg-background/85 backdrop-blur-xl supports-backdrop-filter:bg-background/75"
        )}
      >
        {/* Left: navigation, brand and the property you are working in */}
        <div className="flex min-w-0 items-center gap-1 md:gap-2">
          {/* Phones open navigation from the tab bar's More; the header keeps it from md up. */}
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={toggleSidebar}
            aria-label="Open navigation"
            className={cn(ICON_BUTTON, "-ml-2 hidden md:inline-flex")}
          >
            <Menu className="size-5" />
          </Button>

          <Link
            href="/dashboard"
            aria-label={hotelName ? `${hotelName} front desk` : "Oriel front desk"}
            className="ui-press flex min-h-11 min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:min-h-10"
          >
            <OrielGlyph size={24} />
            <span className="hidden font-brand text-xl font-extrabold lowercase leading-none tracking-[-0.055em] text-foreground lg:inline">
              oriel
            </span>
            {hotelName && (
              <>
                <span aria-hidden="true" className="hidden text-lg font-light text-border lg:inline">
                  /
                </span>
                <span className="min-w-0 truncate text-md font-semibold tracking-tight text-foreground">
                  {hotelName}
                </span>
              </>
            )}
          </Link>
        </div>

        {/* Centre: global search (field on md+, icon on phones) */}
        <div className="flex flex-1 items-center justify-end md:justify-center">
          <DashboardSearch onNewBooking={openNewBooking} />
        </div>

        {/* Right: the primary action, notifications, account */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="primary"
            size="sm"
            onPress={openNewBooking}
            aria-label="New booking"
            className="min-w-10 gap-2 rounded-full px-0 text-sm font-semibold max-sm:size-11 sm:px-4 pointer-coarse:h-11"
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
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              aria-label="Open your profile"
              onPress={() => openUserProfile()}
              className={cn(ICON_BUTTON, "hidden rounded-full md:inline-flex")}
            >
              <Avatar size="sm" className="size-8 rounded-full ring-1 ring-border">
                {user.imageUrl && <Avatar.Image src={user.imageUrl} alt="" />}
                <Avatar.Fallback className="bg-[var(--sun-wash)] text-2xs font-semibold text-[var(--sun-deep)]">
                  {initials}
                </Avatar.Fallback>
              </Avatar>
            </Button>
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
