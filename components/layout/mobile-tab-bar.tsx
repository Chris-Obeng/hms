"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, CalendarDays, ClipboardList, LayoutGrid, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Today", icon: LayoutGrid, exact: true },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/dashboard/rooms", label: "Rooms", icon: BedDouble },
] as const;

/**
 * Phone navigation: the four places front-desk staff live, within thumb reach,
 * plus More for everything in the sidebar. Hidden from md up, where the header
 * opens the sidebar. Sits above the home indicator (safe-area inset).
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();

  return (
    <nav
      aria-label="Main"
      className="rl-tabbar fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-xl supports-backdrop-filter:bg-background/80 md:hidden"
    >
      <ul className="grid h-16 grid-cols-5">
        {TABS.map((tab) => {
          const active = "exact" in tab && tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "ui-press flex h-full flex-col items-center justify-center gap-1 text-2xs font-semibold outline-none focus-visible:bg-secondary",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-12 place-items-center rounded-full transition-colors duration-150 ease-[ease]",
                    active && "bg-[var(--accent-soft)]"
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={toggleSidebar}
            className="ui-press flex h-full w-full flex-col items-center justify-center gap-1 text-2xs font-semibold text-muted-foreground outline-none focus-visible:bg-secondary"
          >
            <span className="grid h-8 w-12 place-items-center rounded-full">
              <Menu className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
