"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import {
  CalendarPlus,
  BedDouble,
  Users,
  CalendarDays,
  LogOut,
  ClipboardList,
  BarChart3,
  Settings,
  Sun,
  Moon,
  Loader2,
  ArrowUpRight,
  DoorOpen,
  CreditCard,
  Wrench,
  UserPlus,
} from "lucide-react";
import type { UseOverlayStateReturn } from "@heroui/react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { searchGlobal, type SearchResult } from "@/app/actions/search";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────

interface GlobalSearchProps {
  state: UseOverlayStateReturn;
}

type ActionGroup = "Bookings" | "Front Desk" | "Operations" | "Settings";

interface ActionItem {
  id: string;
  label: string;
  subLabel?: string;
  group: ActionGroup;
  icon: React.ReactNode;
  iconColor: string;
  url?: string;
  action?: () => void;
  shortcut?: string;
}

// ── Result type meta ───────────────────────────────────────────

const RESULT_META: Record<
  SearchResult["type"],
  { pill: string; iconColor: string }
> = {
  guest: { pill: "Guest", iconColor: "text-violet-500" },
  booking: { pill: "Booking", iconColor: "text-emerald-500" },
  room: { pill: "Room", iconColor: "text-amber-500" },
};

// ── Idle action definitions ────────────────────────────────────

function useActions(
  theme: string | undefined,
  setTheme: (t: string) => void,
  close: () => void,
): ActionItem[] {
  return React.useMemo<ActionItem[]>(
    () => [
      {
        id: "new-booking",
        label: "New Booking",
        subLabel: "Create a walk-in or reservation",
        group: "Bookings",
        icon: <CalendarPlus />,
        iconColor: "text-blue-500",
        url: "/dashboard/bookings?new=1",
        shortcut: "N",
      },
      {
        id: "view-bookings",
        label: "View All Bookings",
        subLabel: "Browse reservations and history",
        group: "Bookings",
        icon: <CalendarDays />,
        iconColor: "text-blue-400",
        url: "/dashboard/bookings",
      },
      {
        id: "availability",
        label: "Room Availability",
        subLabel: "Check occupancy and open dates",
        group: "Bookings",
        icon: <BedDouble />,
        iconColor: "text-indigo-500",
        url: "/dashboard/availability",
      },
      {
        id: "check-in",
        label: "Check-In Guest",
        subLabel: "Process arrival and assign room",
        group: "Front Desk",
        icon: <DoorOpen />,
        iconColor: "text-emerald-500",
        url: "/dashboard/bookings?filter=arriving",
      },
      {
        id: "check-out",
        label: "Check-Out Guest",
        subLabel: "Process departure and settle bill",
        group: "Front Desk",
        icon: <LogOut />,
        iconColor: "text-orange-500",
        url: "/dashboard/bookings?filter=departing",
      },
      {
        id: "guests",
        label: "Guest Directory",
        subLabel: "View and manage guest profiles",
        group: "Front Desk",
        icon: <Users />,
        iconColor: "text-violet-500",
        url: "/dashboard/customers",
      },
      {
        id: "add-guest",
        label: "Add Guest Profile",
        subLabel: "Create a new guest record",
        group: "Front Desk",
        icon: <UserPlus />,
        iconColor: "text-violet-400",
        url: "/dashboard/customers?new=1",
      },
      {
        id: "payments",
        label: "Payments",
        subLabel: "Track payments and invoices",
        group: "Front Desk",
        icon: <CreditCard />,
        iconColor: "text-emerald-400",
        url: "/dashboard/payments",
      },
      {
        id: "housekeeping",
        label: "Housekeeping",
        subLabel: "Room status and cleaning tasks",
        group: "Operations",
        icon: <ClipboardList />,
        iconColor: "text-amber-500",
        url: "/dashboard/housekeeping",
      },
      {
        id: "rooms",
        label: "Room Directory",
        subLabel: "Manage rooms, types and rates",
        group: "Operations",
        icon: <Wrench />,
        iconColor: "text-amber-400",
        url: "/dashboard/rooms",
      },
      {
        id: "reports",
        label: "Reports",
        subLabel: "Occupancy, revenue and analytics",
        group: "Operations",
        icon: <BarChart3 />,
        iconColor: "text-sky-500",
        url: "/dashboard/reports",
      },
      {
        id: "settings",
        label: "Hotel Settings",
        subLabel: "Taxes, policies and integrations",
        group: "Settings",
        icon: <Settings />,
        iconColor: "text-muted-foreground",
        url: "/dashboard/settings",
      },
      {
        id: "theme",
        label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        subLabel: "Toggle UI appearance",
        group: "Settings",
        icon: theme === "dark" ? <Sun /> : <Moon />,
        iconColor: "text-muted-foreground",
        action: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          close();
        },
      },
    ],
    [theme, setTheme, close],
  );
}

const GROUP_ORDER: ActionGroup[] = ["Bookings", "Front Desk", "Operations", "Settings"];

// ── Row content ────────────────────────────────────────────────

function ItemContent({
  icon,
  iconColor,
  label,
  subLabel,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  subLabel?: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          "bg-muted/70 text-muted-foreground transition-colors",
          "group-data-selected/command-item:bg-muted group-data-selected/command-item:text-foreground",
          "[&_svg]:size-4!",
          iconColor,
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {subLabel && (
          <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">
            {subLabel}
          </span>
        )}
      </span>
    </>
  );
}

// ── Component ───────────────────────────────────────────────────

export function GlobalSearch({ state }: GlobalSearchProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);

  const close = React.useCallback(() => state.close(), [state]);
  const actions = useActions(theme, setTheme, close);

  // Reset search state when dialog closes (onOpenChange fires on any close)
  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        setQuery("");
        setResults([]);
        setSearching(false);
      }
      state.setOpen(open);
    },
    [state],
  );

  // Debounced server search — searching state set in handleQueryChange
  React.useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      try {
        const res = await searchGlobal(q);
        setResults(res.success ? res.data : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const handleQueryChange = React.useCallback((v: string) => {
    setQuery(v);
    if (!v.trim()) {
      setResults([]);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }, []);

  const runAction = React.useCallback(
    (item: ActionItem) => {
      if (item.action) {
        item.action();
        return;
      }
      if (item.url) {
        close();
        router.push(item.url);
      }
    },
    [router, close],
  );

  const runResult = React.useCallback(
    (r: SearchResult) => {
      close();
      router.push(r.url);
    },
    [router, close],
  );

  const isQuerying = !!query.trim();
  const showEmpty = isQuerying && !searching && results.length === 0;

  return (
    <CommandDialog
      open={state.isOpen}
      onOpenChange={handleOpenChange}
      title="Command Palette"
      description="Search guests, bookings, rooms, or run an action"
      className="top-[12vh] max-w-xl! translate-y-0 sm:top-[18vh]"
    >
      <CommandInput
        value={query}
        onValueChange={handleQueryChange}
        placeholder="Search guests, bookings, rooms…"
        aria-label="Search guests, bookings, rooms, or run an action"
      />

      <CommandList className="max-h-[min(420px,50vh)]">
        {searching && (
          <div
            aria-live="polite"
            className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            Searching records…
          </div>
        )}

        {showEmpty && (
          <CommandEmpty className="py-10">
            <p className="font-medium text-foreground">No results found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No guests, bookings, or rooms match &ldquo;{query}&rdquo;
            </p>
          </CommandEmpty>
        )}

        {isQuerying && !searching && results.length > 0 && (
          <CommandGroup heading={`Results · ${results.length}`}>
            {results.map((r) => {
              const meta = RESULT_META[r.type];
              return (
                <CommandItem
                  key={r.id}
                  value={`${r.label} ${r.subLabel}`}
                  onSelect={() => runResult(r)}
                  className="gap-3 py-2"
                >
                  <ItemContent
                    icon={<ArrowUpRight />}
                    iconColor={meta.iconColor}
                    label={r.label}
                    subLabel={r.subLabel}
                  />
                  <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {meta.pill}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {!isQuerying &&
          GROUP_ORDER.map((group, gi) => {
            const items = actions.filter((a) => a.group === group);
            if (items.length === 0) return null;
            return (
              <React.Fragment key={group}>
                {gi > 0 && <CommandSeparator />}
                <CommandGroup heading={group}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.subLabel ?? ""}`}
                      onSelect={() => runAction(item)}
                      className="gap-3 py-2"
                      keywords={
                        item.id === "theme" ? ["dark", "light", "mode"] : undefined
                      }
                    >
                      <ItemContent
                        icon={item.icon}
                        iconColor={item.iconColor}
                        label={item.label}
                        subLabel={item.subLabel}
                      />
                      {item.shortcut && (
                        <CommandShortcut>{item.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            );
          })}
      </CommandList>

      {/* Footer hints */}
      <div className="flex items-center gap-4 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-medium">↑↓</kbd>
          Navigate
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-medium">↵</kbd>
          Select
        </span>
        <span className="ml-auto hidden sm:inline">⌘K</span>
      </div>
    </CommandDialog>
  );
}
