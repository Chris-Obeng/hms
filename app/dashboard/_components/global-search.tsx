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
  Search,
  ArrowUpRight,
  DoorOpen,
  CreditCard,
  Wrench,
  UserPlus,
} from "lucide-react";
import { Modal, SearchField, Chip } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { searchGlobal, type SearchResult } from "@/app/actions/search";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────

interface GlobalSearchProps {
  state: UseOverlayStateReturn;
}

type ItemGroup = "Bookings" | "Front Desk" | "Operations" | "Settings" | "Results";

interface NavigableItem {
  id: string;
  label: string;
  subLabel?: string;
  group: ItemGroup;
  icon: React.ReactNode;
  iconColor: string;
  url?: string;
  action?: () => void;
  shortcut?: string;
}

// ── Chip color map for search result types ─────────────────────

const RESULT_CHIP: Record<
  string,
  { color: "accent" | "success" | "warning" | "danger" | "default"; label: string }
> = {
  guest: { color: "accent", label: "Guest" },
  booking: { color: "success", label: "Booking" },
  room: { color: "warning", label: "Room" },
};

// ── Idle action definitions ────────────────────────────────────

function useActions(
  theme: string | undefined,
  setTheme: (t: string) => void,
  router: ReturnType<typeof useRouter>,
  closeModal: () => void,
): NavigableItem[] {
  return React.useMemo<NavigableItem[]>(
    () => [
      // ── Bookings ───────────────────────────────────────────
      {
        id: "new-booking",
        label: "New Booking",
        subLabel: "Create a walk-in or reservation",
        group: "Bookings",
        icon: <CalendarPlus className="size-4" />,
        iconColor: "text-blue-500",
        url: "/dashboard/bookings?new=1",
        shortcut: "N",
      },
      {
        id: "view-bookings",
        label: "View All Bookings",
        subLabel: "Browse reservations and history",
        group: "Bookings",
        icon: <CalendarDays className="size-4" />,
        iconColor: "text-blue-400",
        url: "/dashboard/bookings",
      },
      {
        id: "availability",
        label: "Room Availability",
        subLabel: "Check occupancy and open dates",
        group: "Bookings",
        icon: <BedDouble className="size-4" />,
        iconColor: "text-indigo-500",
        url: "/dashboard/availability",
      },
      // ── Front Desk ────────────────────────────────────────
      {
        id: "check-in",
        label: "Check-In Guest",
        subLabel: "Process arrival and assign room",
        group: "Front Desk",
        icon: <DoorOpen className="size-4" />,
        iconColor: "text-emerald-500",
        url: "/dashboard/bookings?filter=arriving",
      },
      {
        id: "check-out",
        label: "Check-Out Guest",
        subLabel: "Process departure and settle bill",
        group: "Front Desk",
        icon: <LogOut className="size-4" />,
        iconColor: "text-orange-500",
        url: "/dashboard/bookings?filter=departing",
      },
      {
        id: "guests",
        label: "Guest Directory",
        subLabel: "View and manage guest profiles",
        group: "Front Desk",
        icon: <Users className="size-4" />,
        iconColor: "text-violet-500",
        url: "/dashboard/customers",
      },
      {
        id: "add-guest",
        label: "Add Guest Profile",
        subLabel: "Create a new guest record",
        group: "Front Desk",
        icon: <UserPlus className="size-4" />,
        iconColor: "text-violet-400",
        url: "/dashboard/customers?new=1",
      },
      {
        id: "payments",
        label: "Payments",
        subLabel: "Track payments and invoices",
        group: "Front Desk",
        icon: <CreditCard className="size-4" />,
        iconColor: "text-emerald-400",
        url: "/dashboard/payments",
      },
      // ── Operations ─────────────────────────────────────────
      {
        id: "housekeeping",
        label: "Housekeeping",
        subLabel: "Room status and cleaning tasks",
        group: "Operations",
        icon: <ClipboardList className="size-4" />,
        iconColor: "text-amber-500",
        url: "/dashboard/housekeeping",
      },
      {
        id: "rooms",
        label: "Room Directory",
        subLabel: "Manage rooms, types and rates",
        group: "Operations",
        icon: <Wrench className="size-4" />,
        iconColor: "text-amber-400",
        url: "/dashboard/rooms",
      },
      {
        id: "reports",
        label: "Reports",
        subLabel: "Occupancy, revenue and analytics",
        group: "Operations",
        icon: <BarChart3 className="size-4" />,
        iconColor: "text-sky-500",
        url: "/dashboard/reports",
      },
      // ── Settings ───────────────────────────────────────────
      {
        id: "settings",
        label: "Hotel Settings",
        subLabel: "Taxes, policies and integrations",
        group: "Settings",
        icon: <Settings className="size-4" />,
        iconColor: "text-default-500",
        url: "/dashboard/settings",
      },
      {
        id: "theme",
        label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        subLabel: "Toggle UI appearance",
        group: "Settings",
        icon:
          theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          ),
        iconColor: "text-default-400",
        action: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          closeModal();
        },
      },
    ],
    [theme, setTheme, router, closeModal],
  );
}

// ── Group order for the idle view ──────────────────────────────
const GROUP_ORDER: ItemGroup[] = ["Bookings", "Front Desk", "Operations", "Settings"];

// ── Component ───────────────────────────────────────────────────

export function GlobalSearch({ state }: GlobalSearchProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  const closeModal = React.useCallback(() => state.close(), [state]);
  const actions = useActions(theme, setTheme, router, closeModal);

  // ── Reset on close ───────────────────────────────────────────
  React.useEffect(() => {
    if (!state.isOpen) {
      setQuery("");
      setResults([]);
      setSearching(false);
      setSelectedIndex(0);
    }
  }, [state.isOpen]);

  // ── Focus input on open ──────────────────────────────────────
  React.useEffect(() => {
    if (state.isOpen) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
        setSelectedIndex(0);
      }, 80);
      return () => clearTimeout(t);
    }
  }, [state.isOpen]);

  // ── Debounced search ─────────────────────────────────────────
  React.useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchGlobal(query);
        setResults(res.success ? res.data : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // ── Reset selection on change ────────────────────────────────
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query, results]);

  // ── Scroll selected item into view ───────────────────────────
  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [selectedIndex]);

  // ── Build flat navigable list ─────────────────────────────────
  const navigableItems = React.useMemo<NavigableItem[]>(() => {
    if (query.trim()) {
      return results.map((r) => ({
        id: r.id,
        label: r.label,
        subLabel: r.subLabel,
        group: "Results" as ItemGroup,
        icon: <ArrowUpRight className="size-4" />,
        iconColor:
          r.type === "guest"
            ? "text-violet-500"
            : r.type === "booking"
              ? "text-emerald-500"
              : "text-amber-500",
        url: r.url,
      }));
    }
    return actions;
  }, [query, results, actions]);

  // ── Select handler ───────────────────────────────────────────
  const handleSelect = React.useCallback(
    (item: NavigableItem) => {
      if (item.url) {
        closeModal();
        router.push(item.url);
      } else if (item.action) {
        item.action();
      }
    },
    [router, closeModal],
  );

  // ── Keyboard nav ─────────────────────────────────────────────
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
        return;
      }
      if (navigableItems.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((p) => (p + 1) % navigableItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((p) => (p - 1 + navigableItems.length) % navigableItems.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = navigableItems[selectedIndex];
        if (item) handleSelect(item);
      }
    },
    [navigableItems, selectedIndex, handleSelect, closeModal],
  );

  const isQuerying = !!query.trim();
  const showEmpty = isQuerying && !searching && results.length === 0;

  // ── Single item row ───────────────────────────────────────────
  const renderItem = (item: NavigableItem, idx: number, resultType?: string) => {
    const active = idx === selectedIndex;
    const chip = resultType ? RESULT_CHIP[resultType] : undefined;

    return (
      <li key={item.id} role="option" aria-selected={active}>
        <button
          ref={active ? selectedRef : null}
          type="button"
          onClick={() => handleSelect(item)}
          onMouseEnter={() => setSelectedIndex(idx)}
          className={cn(
            "group w-full cursor-pointer text-left",
            "flex items-center gap-3 rounded-xl px-3 py-2.5",
            "transition-colors duration-100",
            active
              ? "bg-default-100 dark:bg-default-100/8"
              : "hover:bg-default-50 dark:hover:bg-default-100/5",
          )}
        >
          {/* Icon pill */}
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              "transition-colors duration-100",
              active
                ? "bg-default-200/70 dark:bg-default-100/10"
                : "bg-default-100 dark:bg-default-900/60",
              item.iconColor,
            )}
          >
            {item.icon}
          </span>

          {/* Labels */}
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-sm font-medium",
                active
                  ? "text-foreground"
                  : "text-default-700 dark:text-default-300",
              )}
            >
              {item.label}
            </span>
            {item.subLabel && (
              <span className="mt-0.5 block truncate text-[11px] text-default-400/80">
                {item.subLabel}
              </span>
            )}
          </span>

          {/* Right: chip for search results OR shortcut key */}
          {chip ? (
            <Chip
              size="sm"
              variant="soft"
              color={chip.color}
              className="shrink-0"
            >
              {chip.label}
            </Chip>
          ) : item.shortcut ? (
            <kbd
              className={cn(
                "hidden shrink-0 select-none items-center rounded-md sm:inline-flex",
                "border border-default-200 dark:border-default-800",
                "bg-default-50 dark:bg-default-950",
                "px-1.5 py-0.5 text-[10px] font-medium",
                active
                  ? "text-default-600 dark:text-default-400"
                  : "text-default-400",
              )}
            >
              {item.shortcut}
            </kbd>
          ) : null}
        </button>
      </li>
    );
  };

  // ── Group sections for idle view ──────────────────────────────
  const renderGroups = () => {
    const grouped = GROUP_ORDER.map((group) => ({
      group,
      items: actions.filter((a) => a.group === group),
    })).filter((g) => g.items.length > 0);

    let globalIdx = 0;

    return (
      <div className="space-y-1 py-2">
        {grouped.map(({ group, items }, gi) => (
          <div key={group}>
            {gi > 0 && <div className="mx-3 my-1 h-px bg-divider/40" />}
            <div className="mb-1 px-3 pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-default-400">
                {group}
              </span>
            </div>
            <ul role="listbox" aria-label={group} className="space-y-0.5 px-1">
              {items.map((item) => {
                const el = renderItem(item, globalIdx);
                globalIdx++;
                return el;
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  // ── Search results view ───────────────────────────────────────
  const renderResults = () => {
    const byType: Record<string, { items: NavigableItem[]; startIdx: number }> = {};
    let idx = 0;
    for (const r of results) {
      const t = r.type;
      if (!byType[t]) byType[t] = { items: [], startIdx: idx };
      const item = navigableItems[idx];
      if (item) byType[t].items.push(item);
      idx++;
    }

    return (
      <div className="py-2">
        <div className="mb-1 flex items-center justify-between px-3 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-default-400">
            Results
          </span>
          <span className="text-[10px] text-default-400/60">
            {results.length} found
          </span>
        </div>
        <ul role="listbox" aria-label="Search results" className="space-y-0.5 px-1">
          {results.map((r, i) => {
            const item = navigableItems[i];
            if (!item) return null;
            return renderItem(item, i, r.type);
          })}
        </ul>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <Modal.Backdrop
      isOpen={state.isOpen}
      onOpenChange={state.setOpen}
      variant="blur"
      className="bg-black/30 backdrop-blur-sm"
    >
      <Modal.Container
        placement="top"
        size="lg"
        className="items-start px-4 pt-[10vh] md:px-0"
      >
        <Modal.Dialog
          aria-label="PMS Command Palette"
          className={cn(
            "w-full max-w-[560px] mx-auto outline-none overflow-hidden",
            "rounded-2xl border border-default-200/60 dark:border-default-800/50",
            "bg-background dark:bg-zinc-950",
            "shadow-2xl shadow-black/10 dark:shadow-black/40",
          )}
        >
          {/* ── Context badge ─────────────────────────────── */}
          <div className="flex items-center gap-2 border-b border-divider/40 px-4 py-3">
            <span className="inline-flex items-center rounded-lg bg-default-100 dark:bg-default-800/60 px-2.5 py-1 text-[11px] font-semibold text-default-500 dark:text-default-400">
              Hotel PMS
            </span>
            <span className="text-[11px] text-default-400/60">
              {isQuerying ? `Searching for "${query}"` : "What do you need?"}
            </span>
          </div>

          {/* ── Search input ───────────────────────────────── */}
          <div className="flex items-center gap-2 border-b border-divider/40 px-4 py-3">
            <SearchField
              fullWidth
              variant="secondary"
              value={query}
              onChange={setQuery}
              aria-label="Search guests, bookings, rooms, or run an action"
            >
              <SearchField.Group className="border-0 shadow-none bg-transparent h-auto gap-2 ring-0 outline-none w-full flex items-center">
                <Search className="size-[18px] shrink-0 text-default-400" />
                <SearchField.Input
                  ref={inputRef}
                  placeholder="Search guests, bookings, rooms…"
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-transparent border-0 shadow-none outline-none ring-0 text-sm text-foreground placeholder:text-default-400/60 py-1 px-0"
                />
                {query && (
                  <SearchField.ClearButton className="text-default-400 hover:text-default-600 transition-colors shrink-0" />
                )}
              </SearchField.Group>
            </SearchField>

            <kbd className="hidden sm:inline-flex shrink-0 select-none items-center rounded-lg border border-default-200 dark:border-default-800 bg-default-50 dark:bg-default-900 px-2 py-1 text-[11px] font-medium text-default-400">
              Esc
            </kbd>
          </div>

          {/* ── Body ──────────────────────────────────────── */}
          <div
            className="max-h-[420px] min-h-[200px] overflow-y-auto overscroll-contain scrollbar-none"
          >
            {searching ? (
              <div className="flex flex-col items-center justify-center gap-2.5 py-14 text-sm text-default-400">
                <Loader2 className="size-5 animate-spin text-default-500/60" />
                <span className="text-[13px] font-medium">Searching records…</span>
              </div>
            ) : showEmpty ? (
              <div className="flex flex-col items-center gap-1.5 py-14 px-6 text-center">
                <Search className="size-7 text-default-300 mb-1" />
                <span className="text-sm font-medium text-foreground">
                  No results found
                </span>
                <span className="text-[12px] text-default-400 max-w-xs">
                  No guests, bookings, or rooms match &ldquo;{query}&rdquo;
                </span>
              </div>
            ) : isQuerying ? (
              renderResults()
            ) : (
              renderGroups()
            )}
          </div>

          {/* ── Footer keyboard hint ───────────────────────── */}
          <div className="flex items-center gap-5 border-t border-divider/40 bg-default-50/60 dark:bg-default-900/20 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <kbd className="inline-flex size-5 items-center justify-center rounded border border-default-200 dark:border-default-800 bg-background dark:bg-default-950 text-[10px] font-medium text-default-500">
                ↑
              </kbd>
              <kbd className="inline-flex size-5 items-center justify-center rounded border border-default-200 dark:border-default-800 bg-background dark:bg-default-950 text-[10px] font-medium text-default-500">
                ↓
              </kbd>
              <span className="text-[11px] text-default-400">Navigate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="inline-flex h-5 items-center justify-center rounded border border-default-200 dark:border-default-800 bg-background dark:bg-default-950 px-1.5 text-[10px] font-medium text-default-500">
                ↵
              </kbd>
              <span className="text-[11px] text-default-400">Select</span>
            </div>
            <div className="ml-auto text-[11px] text-default-400/50">
              ⌘K
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
