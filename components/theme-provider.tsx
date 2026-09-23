"use client";

import * as React from "react";

// ── Types ──────────────────────────────────────────────────────

export interface UseThemeProps {
  themes: string[];
  forcedTheme?: string;
  setTheme: (theme: string) => void;
  theme?: string;
  resolvedTheme?: string;
  systemTheme?: "dark" | "light" | undefined;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: string | string[];
  defaultTheme?: string;
  enableSystem?: boolean;
  storageKey?: string;
  themes?: string[];
  forcedTheme?: string;
  disableTransitionOnChange?: boolean;
  enableColorScheme?: boolean;
  value?: Record<string, string>;
  nonce?: string;
}

// ── Constants ──────────────────────────────────────────────────

const STORAGE_KEY = "theme";
const THEMES = ["light", "dark"] as const;
const DEFAULT_THEMES: string[] = [...THEMES];
const SYSTEM_DARK = "(prefers-color-scheme: dark)";

// ── Helpers ────────────────────────────────────────────────────

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(SYSTEM_DARK).matches ? "dark" : "light";
}

function getStoredTheme(key: string, fallback: string): string {
  try {
    const stored = localStorage.getItem(key);
    if (stored && (stored === "light" || stored === "dark" || stored === "system")) {
      return stored;
    }
  } catch {
    /* localStorage unavailable */
  }
  return fallback;
}

function resolveTheme(theme: string, system: "dark" | "light"): "dark" | "light" {
  return theme === "system" ? system : (theme as "dark" | "light");
}

function applyAttribute(
  attributes: string[],
  resolved: string,
  valueMap?: Record<string, string>,
) {
  const el = document.documentElement;
  const v = valueMap?.[resolved] ?? resolved;

  for (const attr of attributes) {
    if (attr === "class") {
      el.classList.remove("light", "dark");
      el.classList.add(v);
    } else {
      el.setAttribute(attr, v);
    }
  }
}

function freezeTransitions(nonce?: string) {
  const style = document.createElement("style");
  if (nonce) style.setAttribute("nonce", nonce);
  style.textContent =
    "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}";
  document.head.appendChild(style);
  // Force reflow so the rule applies instantly
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  document.body?.offsetHeight;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.head.removeChild(style);
    });
  });
}

// ── External stores ────────────────────────────────────────────
//
// The system colour scheme and "has hydration finished" both live in the browser
// rather than in React. Reading them through `useSyncExternalStore` makes the
// value available during render, with an explicit server snapshot so the
// hydration pass still matches the streamed markup — no mirroring state in an
// effect, and no extra commit-then-repaint on mount.

function subscribeToSystemTheme(onStoreChange: () => void) {
  const mql = window.matchMedia(SYSTEM_DARK);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getServerSystemTheme(): "dark" | "light" {
  return "light";
}

// Hydration happens exactly once, so there is nothing to subscribe to.
function subscribeToNothing() {
  return () => {};
}

function getHydrated() {
  return true;
}

function getNotHydrated() {
  return false;
}

// ── Context ────────────────────────────────────────────────────

const ThemeCtx = React.createContext<UseThemeProps | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
  storageKey = STORAGE_KEY,
  themes = DEFAULT_THEMES,
  forcedTheme,
  disableTransitionOnChange = false,
  enableColorScheme = true,
  value,
  nonce,
}: ThemeProviderProps) {
  const attrList = React.useMemo(
    () => (Array.isArray(attribute) ? attribute : [attribute]),
    [attribute],
  );

  const [theme, setThemeRaw] = React.useState<string>(() =>
    typeof window === "undefined"
      ? defaultTheme
      : getStoredTheme(storageKey, defaultTheme),
  );

  // ── Track system preference ─────────────────────────────────────
  const liveSystemTheme = React.useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    getServerSystemTheme,
  );
  const systemTheme = enableSystem ? liveSystemTheme : "light";

  // `theme`'s initializer reads localStorage, which the server cannot do, so
  // consumers are handed `undefined` until hydration has finished and the two
  // renders are guaranteed to agree.
  const mounted = React.useSyncExternalStore(
    subscribeToNothing,
    getHydrated,
    getNotHydrated,
  );

  // ── Apply theme to <html> ───────────────────────────────────────
  React.useEffect(() => {
    const effective = forcedTheme ?? theme;
    const resolved = resolveTheme(effective, systemTheme);

    if (disableTransitionOnChange) freezeTransitions(nonce);
    applyAttribute(attrList, resolved, value);
    if (enableColorScheme) {
      document.documentElement.style.colorScheme = resolved;
    }
  }, [theme, systemTheme, forcedTheme, attrList, value, disableTransitionOnChange, enableColorScheme, nonce]);

  // ── Sync meta theme-color ───────────────────────────────────────
  React.useEffect(() => {
    if (!enableColorScheme) return;
    const effective = forcedTheme ?? theme;
    const resolved = resolveTheme(effective, systemTheme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", resolved === "dark" ? "#1C1917" : "#FAFAF8");
    }
  }, [theme, systemTheme, forcedTheme, enableColorScheme]);

  // ── Public API ─────────────────────────────────────────────────
  const setTheme = React.useCallback(
    (next: string) => {
      if (forcedTheme) return;
      setThemeRaw(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* quota exceeded */
      }
    },
    [storageKey, forcedTheme],
  );

  const resolvedTheme: string | undefined =
    mounted
      ? forcedTheme ?? resolveTheme(theme, systemTheme)
      : undefined;

  const ctx = React.useMemo<UseThemeProps>(
    () => ({
      themes: enableSystem ? [...themes, "system"] : themes,
      forcedTheme,
      setTheme,
      theme: mounted ? theme : undefined,
      resolvedTheme,
      systemTheme: enableSystem ? systemTheme : undefined,
    }),
    [themes, enableSystem, forcedTheme, setTheme, mounted, theme, resolvedTheme, systemTheme],
  );

  return <ThemeCtx.Provider value={ctx}>{children}</ThemeCtx.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────

export function useTheme(): UseThemeProps {
  const ctx = React.useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
