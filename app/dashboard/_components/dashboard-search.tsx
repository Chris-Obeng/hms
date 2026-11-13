"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Command } from "cmdk";
import {
  ArrowLeft,
  ArrowUpRight,
  BedDouble,
  CalendarDays,
  CalendarPlus,
  Loader2,
  Search,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { Kbd } from "@heroui/react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SearchHitType, SearchResponse } from "@/lib/search";

// ── Chip palettes — one soft hue per domain ──────
const TONES = {
  blue: "bg-blue-500/10 text-blue-600",
  sky: "bg-sky-500/10 text-sky-600",
  indigo: "bg-indigo-500/10 text-indigo-600",
  emerald: "bg-emerald-500/10 text-emerald-600",
  teal: "bg-teal-500/10 text-teal-600",
  violet: "bg-violet-500/10 text-violet-600",
  amber: "bg-amber-500/10 text-amber-600",
  orange: "bg-orange-500/10 text-orange-600",
  slate: "bg-muted text-muted-foreground",
} as const;

type Tone = keyof typeof TONES;

type ActionGroup = "Bookings" | "Settings";

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

const GROUP_ORDER: ActionGroup[] = ["Bookings", "Settings"];

// ── Result-type presentation ──────────────────────────────────────
const RESULT_META: Record<SearchHitType, { tone: Tone; icon: React.ReactNode }> = {
  guest: { tone: "violet", icon: <UserRound /> },
  booking: { tone: "emerald", icon: <CalendarDays /> },
  room: { tone: "amber", icon: <BedDouble /> },
};

const GROUP_LABEL: Record<SearchHitType, string> = {
  guest: "Guests",
  booking: "Bookings",
  room: "Rooms",
};

function IconChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4!",
        TONES[tone]
      )}
    >
      {children}
    </span>
  );
}

// ── Idle-state quick actions ──────────────────────────────────────
function useActions(
  close: () => void,
  onNewBooking?: () => void
): ActionItem[] {
  return React.useMemo<ActionItem[]>(
    () => [
      { id: "new-booking", label: "New Booking", group: "Bookings", icon: <CalendarPlus />, tone: "blue", action: () => { close(); onNewBooking?.(); } },
      { id: "view-bookings", label: "All Bookings", group: "Bookings", icon: <CalendarDays />, tone: "sky", url: "/dashboard/bookings" },
      { id: "availability", label: "Room Availability", group: "Bookings", icon: <BedDouble />, tone: "indigo", url: "/dashboard/availability" },
      { id: "settings", label: "Hotel Settings", group: "Settings", icon: <Settings />, tone: "slate", url: "/dashboard/settings" },
    ],
    [close, onNewBooking]
  );
}

// Shared cmdk styling — kept identical to the retired palette for continuity.
const LIST_CLASSES =
  "no-scrollbar max-h-[min(60dvh,26rem)] scroll-py-2 overflow-x-hidden overflow-y-auto overscroll-contain p-1 outline-none";
const GROUP_CLASSES =
  "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground";
const ITEM_CLASSES =
  "group/item relative flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

type Status = "idle" | "loading" | "done" | "error";

export function DashboardSearch({ onNewBooking }: { onNewBooking?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResponse | null>(null);
  const [status, setStatus] = React.useState<Status>("idle");
  const [nonce, setNonce] = React.useState(0);
  const [modKey, setModKey] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const mobileInputRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const seqRef = React.useRef(0);

  const isQuerying = query.trim().length > 0;

  // Platform hint for the kbd. Deferred so no setState runs in the effect body
  // (react-hooks/set-state-in-effect); the server renders no kbd until then.
  React.useEffect(() => {
    const mac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    const id = requestAnimationFrame(() => setModKey(mac ? "⌘K" : "Ctrl K"));
    return () => cancelAnimationFrame(id);
  }, []);

  // Debounced fetch: abort the prior request, and drop out-of-order responses
  // via a monotonic sequence so a slow earlier query never clobbers a newer one.
  // Loading/idle state is set by onQueryChange (an event handler) so nothing
  // mutates state synchronously in this effect body.
  React.useEffect(() => {
    const q = query.trim();
    if (!q) {
      abortRef.current?.abort();
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const seq = ++seqRef.current;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const data: SearchResponse = await res.json();
        if (seq === seqRef.current) {
          setResults(data);
          setStatus("done");
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        if (seq === seqRef.current) setStatus("error");
      }
    }, 275);
    return () => clearTimeout(t);
  }, [query, nonce]);

  // Abort any in-flight search on unmount.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  // Dismiss both surfaces without navigating; passed to quick actions as close().
  const dismiss = React.useCallback(() => {
    setOpen(false);
    setMobileOpen(false);
  }, []);

  const reset = React.useCallback(() => {
    setQuery("");
    setResults(null);
    setStatus("idle");
  }, []);

  // Typing drives status immediately (event handler, not an effect) so the
  // spinner/skeletons show at once and a stale status never leaks into a newer
  // query; the debounced effect only performs the fetch.
  const onQueryChange = React.useCallback((v: string) => {
    setQuery(v);
    if (v.trim()) {
      setStatus("loading");
    } else {
      setStatus("idle");
      setResults(null);
    }
  }, []);

  const actions = useActions(dismiss, onNewBooking);

  const runResult = React.useCallback(
    (url: string) => {
      dismiss();
      router.push(url);
    },
    [dismiss, router]
  );

  const runAction = React.useCallback(
    (item: ActionItem) => {
      if (item.action) {
        item.action(); // handles its own dismiss()
        return;
      }
      dismiss();
      if (item.url) router.push(item.url);
    },
    [dismiss, router]
  );

  const openFor = React.useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setMobileOpen(true);
    }
  }, []);

  // ⌘K / Ctrl+K anywhere; `/` only when not typing in a field.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openFor();
        return;
      }
      if (e.key === "/") {
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
        e.preventDefault();
        openFor();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFor]);

  // Close the desktop panel on any outside pointer press.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Lock body scroll + focus the field while the mobile overlay is up.
  React.useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => mobileInputRef.current?.focus());
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // A navigation closes everything. Deferred to keep the effect body free of
  // synchronous setState (react-hooks/set-state-in-effect).
  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      setOpen(false);
      setMobileOpen(false);
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  // Screen-reader announcement for the current state of the result set.
  const liveMessage = React.useMemo(() => {
    if (!isQuerying) return "";
    if (status === "loading" && !results) return "Searching…";
    if (status === "error" && !results) return "Search failed.";
    if (!results) return "";
    const total = results.groups.reduce((n, g) => n + g.items.length, 0);
    if (total === 0) return `No results for ${query.trim()}`;
    const parts = results.groups.map((g) => `${g.items.length} ${GROUP_LABEL[g.type].toLowerCase()}`);
    return `${total} result${total === 1 ? "" : "s"}: ${parts.join(", ")}`;
  }, [isQuerying, status, results, query]);

  // Shared cmdk body — identical content for the desktop panel and mobile sheet.
  function listBody() {
    if (!isQuerying) {
      return GROUP_ORDER.map((group) => {
        const items = actions.filter((a) => a.group === group);
        if (items.length === 0) return null;
        return (
          <Command.Group key={group} heading={group} className={GROUP_CLASSES}>
            {items.map((a) => (
              <Command.Item
                key={a.id}
                value={`${a.label} ${a.keywords?.join(" ") ?? ""}`}
                onSelect={() => runAction(a)}
                className={ITEM_CLASSES}
              >
                <IconChip tone={a.tone}>{a.icon}</IconChip>
                <span className="flex-1 truncate">{a.label}</span>
                {a.url && (
                  <ArrowUpRight className="size-4 text-muted-foreground/40 opacity-0 transition-opacity group-data-[selected=true]/item:opacity-100" />
                )}
              </Command.Item>
            ))}
          </Command.Group>
        );
      });
    }

    // A settled error with nothing to fall back on.
    if (status === "error" && !results) {
      return (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">Something went wrong.</p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setNonce((n) => n + 1);
            }}
            className="ui-press min-h-10 rounded-md px-3 py-1 text-xs font-medium text-foreground underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }

    // Loading first results, or bridging the debounce gap before a fetch fires.
    if (!results) {
      return (
        <div className="p-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    const groups = results.groups;
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    if (total === 0) {
      return (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No results for{" "}
          <span className="font-medium text-foreground">“{query.trim()}”</span>
        </div>
      );
    }

    return groups.map((g) => (
      <Command.Group key={g.type} heading={GROUP_LABEL[g.type]} className={GROUP_CLASSES}>
        {g.items.map((hit) => (
          <Command.Item
            key={hit.id}
            value={hit.id}
            onSelect={() => runResult(hit.url)}
            className={ITEM_CLASSES}
          >
            <IconChip tone={RESULT_META[hit.type].tone}>{RESULT_META[hit.type].icon}</IconChip>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-foreground">{hit.label}</span>
              <span className="truncate text-xs text-muted-foreground">{hit.subLabel}</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-data-[selected=true]/item:opacity-100" />
          </Command.Item>
        ))}
      </Command.Group>
    ));
  }

  return (
    <>
      {/* Desktop / tablet: inline field with an anchored, non-modal panel. */}
      <div ref={rootRef} className="relative mx-auto hidden w-full max-w-lg md:block">
        <Command
          shouldFilter={false}
          loop
          className="w-full"
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.preventDefault();
              setOpen(false); // keep focus on the input
            }
          }}
        >
          <div
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg border px-3 transition-[background-color,border-color,box-shadow] duration-150",
              open
                ? "border-ring/60 bg-background ring-4 ring-ring/10"
                : "border-transparent bg-secondary/80 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary"
            )}
          >
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={onQueryChange}
              onFocus={() => setOpen(true)}
              placeholder="Search guests, bookings, rooms…"
              aria-label="Search"
              maxLength={100}
              className="h-full flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            {isQuerying && status === "loading" ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : isQuerying ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  reset();
                  inputRef.current?.focus();
                }}
                className="ui-press inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : (
              modKey && (
                <Kbd className="pointer-events-none hidden select-none text-2xs text-muted-foreground lg:inline-flex">
                  {modKey.startsWith("⌘") ? (
                    <>
                      <Kbd.Abbr keyValue="command" />
                      <Kbd.Content>K</Kbd.Content>
                    </>
                  ) : (
                    <Kbd.Content>Ctrl&nbsp;K</Kbd.Content>
                  )}
                </Kbd>
              )
            )}
          </div>

          {open && (
            <div className="absolute inset-x-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-xl">
              <Command.List className={LIST_CLASSES}>{listBody()}</Command.List>
            </div>
          )}
        </Command>
        <span aria-live="polite" role="status" className="sr-only">
          {liveMessage}
        </span>
      </div>

      {/* Phone: icon trigger opens a full-width search sheet (no route change). */}
      <button
        type="button"
        aria-label="Search"
        onClick={() => setMobileOpen(true)}
        className="ui-press inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
      >
        <Search className="size-5" />
      </button>

      {mobileOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] md:hidden">
            <Command
              shouldFilter={false}
              loop
              className="flex min-h-0 flex-1 flex-col"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  dismiss();
                }
              }}
            >
              <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2">
                <button
                  type="button"
                  aria-label="Close search"
                  onClick={dismiss}
                  className="ui-press inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <ArrowLeft className="size-5" />
                </button>
                <Command.Input
                  ref={mobileInputRef}
                  value={query}
                  onValueChange={onQueryChange}
                  placeholder="Search guests, bookings, rooms…"
                  aria-label="Search"
                  maxLength={100}
                  className="h-full flex-1 border-0 bg-transparent p-0 text-base text-foreground outline-none placeholder:text-muted-foreground/70"
                />
                {isQuerying && status === "loading" && (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                )}
                {isQuerying && status !== "loading" && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      reset();
                      mobileInputRef.current?.focus();
                    }}
                    className="ui-press inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <Command.List className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
                {listBody()}
              </Command.List>
            </Command>
            <span aria-live="polite" role="status" className="sr-only">
              {liveMessage}
            </span>
          </div>,
          document.body
        )}
    </>
  );
}
