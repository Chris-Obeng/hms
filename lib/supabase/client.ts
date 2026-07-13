"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

// Clerk attaches itself to window after the SDK initializes.
// We declare a minimal interface for the methods we use rather than
// casting to any — this keeps full type-checking on the call sites.
declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: (options: { template: string }) => Promise<string | null>;
      };
    };
  }
}

/**
 * Browser-side Supabase client. Subject to Row Level Security.
 *
 * Always fetches a fresh Clerk JWT for every REST request so tokens
 * never go stale. The optional `token` parameter is intentionally
 * NOT used inside the fetch wrapper — passing a pinned token into the
 * closure would cause REST calls to fail once the token expires (~60s).
 *
 * Realtime auth is handled separately via `supabase.realtime.setAuth()`
 * on a 45-second refresh interval (see AppHeader).
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        fetch: async (url, options = {}) => {
          const headers = new Headers(options.headers);

          if (typeof window !== "undefined" && window.Clerk?.session) {
            try {
              // Always request a fresh token — Clerk caches and auto-refreshes
              // internally so this is fast and never uses an expired JWT.
              const freshToken = await window.Clerk.session.getToken({
                template: "supabase",
              });
              if (freshToken) {
                headers.set("Authorization", `Bearer ${freshToken}`);
              }
            } catch (e) {
              console.error("[supabase/client] Clerk token injection failed:", e);
            }
          }

          return fetch(url, { ...options, headers });
        },
      },
    }
  );
}
