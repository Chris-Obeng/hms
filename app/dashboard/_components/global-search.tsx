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
  BarChart3,
  Settings,
  Sun,
  Moon,
  ArrowUpRight,
  DoorOpen,
  CreditCard,
  Wrench,
  UserPlus,
  UserRound,
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
} from "@/components/ui/command";
import { searchGlobal, type SearchResult } from "@/app/actions/search";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────

interface GlobalSearchProps {
  state: UseOverlayStateReturn;
}

type ActionGroup = "Bookings" | "Front Desk" | "Operations" | "Settings";

/** Soft tinted chip palettes — one hue per domain, dark-mode aware */
const TONES = {
  blue: "bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400",
  sky: "bg-sky-500/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-400",
  indigo:
    "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400",
  emerald:
    "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400",
  teal: "bg-teal-500/10 text-teal-600 dark:bg-teal-400/10 dark:text-teal-400",
  violet:
    "bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-400",
  amber:
    "bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400",
  orange:
    "bg-orange-500/10 text-orange-600 dark:bg-orange-400/10 dark:text-orange-400",
  slate: "bg-muted text-muted-foreground",
} as const;

type Tone = keyof typeof TONES;

interface ActionItem {
  id: string;
  label: string;
  group: ActionGroup;
  icon: React.ReactNode;
  tone: Tone;
  url?: string;
  action?: () => void;
  keywords?: string[];
}

// ── Result type meta ───────────────────────────────────────────

const RESULT_META: Record<
  SearchResult["type"],
  { label: string; icon: React.ReactNode; tone: Tone }
> = {
  guest: { label: "Guest", icon: <UserRound />, tone: "violet" },
  booking: { label: "Booking", icon: <CalendarDays />, tone: "emerald" },
  room: { label: "Room", icon: <BedDouble />, tone: "amber" },
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
        group: "Bookings",
        icon: <CalendarPlus />,
        tone: "blue",
        url: "/dashboard/bookings?new=1",
      },
      {
        id: "view-bookings",
        label: "All Bookings",
        group: "Bookings",
        icon: <CalendarDays />,
        tone: "sky",
        url: "/dashboard/bookings",
      },
      {
        id: "availability",
        label: "Room Availability",
        group: "Bookings",
        icon: <BedDouble />,
        tone: "indigo",
        url: "/dashboard/availability",
      },
      {
        id: "check-in",
        label: "Check-In Guest",
        group: "Front Desk",
        icon: <DoorOpen />,
        tone: "emerald",
        url: "/dashboard/bookings?filter=arriving",
      },
      {
        id: "check-out",
        label: "Check-Out Guest",
        group: "Front Desk",
        icon: <LogOut />,
        tone: "orange",
        url: "/dashboard/bookings?filter=departing",
      },
      {
        id: "guests",
        label: "Guest Directory",
        group: "Front Desk",
        icon: <Users />,
        tone: "violet",
        url: "/dashboard/customers",
      },
      {
        id: "add-guest",
        label: "Add Guest",
        group: "Front Desk",
        icon: <UserPlus />,
        tone: "violet",
        url: "/dashboard/customers?new=1",
      },
      {
        id: "payments",
        label: "Payments",
        group: "Front Desk",
        icon: <CreditCard />,
        tone: "teal",
        url: "/dashboard/payments",
      },
      {
        id: "rooms",
        label: "Rooms",
        group: "Operations",
        icon: <Wrench />,
        tone: "amber",
        url: "/dashboard/rooms",
      },
      {
        id: "reports",
        label: "Reports",
        group: "Operations",
        icon: <BarChart3 />,
        tone: "sky",
        url: "/dashboard/reports",
      },
      {
        id: "settings",
        label: "Hotel Settings",
        group: "Settings",
        icon: <Settings />,
        tone: "slate",
        url: "/dashboard/settings",
      },
      {
        id: "theme",
        label: theme === "dark" ? "Light Mode" : "Dark Mode",
        group: "Settings",
        icon: theme === "dark" ? <Sun /> : <Moon />,
        tone: "slate",
        action: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          close();
        },
        keywords: ["appearance", "dark", "light", "mode", "theme", "toggle"],
      },
    ],
    [theme, setTheme, close],
  );
}

const GROUP_ORDER: ActionGroup[] = ["Bookings", "Front Desk", "Operations", "Settings"];

// ── Shared bits ─────────────────────────────────────────────────

function IconChip({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-3.5!",
        TONES[tone],
      )}
    >
      {children}
    </span>
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

  // Reset search state when dialog closes
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

  // Debounced server search — stale responses discarded via cancelled flag
  React.useEffect(() => {
    const q = query.trim();
    if (!q) return;

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await searchGlobal(q);
        if (cancelled) return;
        setResults(res.success ? res.data : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
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
  // Keep previous results visible while a new search runs (stale-while-revalidate)
  const showResults = isQuerying && results.length > 0;
  const showEmpty =
    isQuerying && !searching && results.length === 0;

  return (
    <CommandDialog
      open={state.isOpen}
      onOpenChange={handleOpenChange}
      title="Command Palette"
      description="Search guests, bookings, rooms, or run an action"
    >
      <CommandInput
        value={query}
        onValueChange={handleQueryChange}
        loading={searching}
        placeholder="Search guests, bookings, rooms…"
        aria-label="Search guests, bookings, rooms, or run an action"
        autoComplete="off"
        spellCheck={false}
      />

      <CommandList className="max-h-[min(380px,calc(100dvh-12rem))] sm:max-h-[420px]">
        {showEmpty && (
          <CommandEmpty>
            <p className="font-medium text-foreground">No results</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nothing matches &ldquo;{query}&rdquo;
            </p>
          </CommandEmpty>
        )}

        {showResults && (
          <CommandGroup heading={`Results · ${results.length}`}>
            {results.map((r) => {
              const meta = RESULT_META[r.type];
              return (
                <CommandItem
                  key={r.id}
                  value={`${r.label} ${r.subLabel}`}
                  onSelect={() => runResult(r)}
                >
                  <IconChip tone={meta.tone}>{meta.icon}</IconChip>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.label}</span>
                    {r.subLabel && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {r.subLabel}
                      </span>
                    )}
                  </span>
                  <ArrowUpRight className="size-3.5! shrink-0 text-muted-foreground/40 transition-colors group-data-selected/command-item:text-muted-foreground" />
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
                      value={`${item.label} ${item.group}`}
                      keywords={item.keywords}
                      onSelect={() => runAction(item)}
                    >
                      <IconChip tone={item.tone}>{item.icon}</IconChip>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {item.label}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            );
          })}
      </CommandList>

      {/* Footer hints — desktop only; touch devices skip the noise */}
      <div className="hidden items-center gap-4 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground/70 sm:flex">
        <span className="flex items-center gap-1.5">
          <kbd className="inline-flex h-5 items-center rounded border border-border/60 bg-muted/40 px-1.5 font-medium">
            ↑↓
          </kbd>
          Navigate
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="inline-flex h-5 items-center rounded border border-border/60 bg-muted/40 px-1.5 font-medium">
            ↵
          </kbd>
          Select
        </span>
        <span className="ml-auto font-medium tracking-wide">⌘K</span>
      </div>
    </CommandDialog>
  );
}
