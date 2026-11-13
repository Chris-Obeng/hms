"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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
 * Clerk "supabase" template JWT for the signed-in staff member, or null.
 * Clerk caches the token and refreshes it before it expires, so calling this
 * on every request and every Realtime heartbeat is cheap.
 */
async function getClerkToken(): Promise<string | null> {
  if (typeof window === "undefined" || !window.Clerk?.session) return null;
  try {
    return (await window.Clerk.session.getToken({ template: "supabase" })) ?? null;
  } catch (error) {
    console.error("[supabase/client] Clerk token request failed:", error);
    return null;
  }
}

function buildClient() {
  const client = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // One token source for REST, Storage and Realtime. supabase-js calls it
      // per request, and Realtime calls it on connect and on every heartbeat
      // (25s), so channels never run on an expired JWT. Never pass a token to
      // `realtime.setAuth(token)`: a manual token turns this refresh off for
      // every channel on the shared socket. Call `realtime.setAuth()` with no
      // argument to fetch a fresh one.
      accessToken: getClerkToken,
      realtime: {
        // Heartbeats from a Web Worker keep running when the tab is in the
        // background, where browsers throttle main-thread timers and the
        // socket would otherwise drop silently.
        worker: true,
        // If the socket still drops (sleep, network change), reconnect at
        // once instead of waiting for the next backoff step.
        heartbeatCallback: (status) => {
          if (status === "disconnected" && client.realtime.getChannels().length > 0) {
            client.realtime.connect();
          }
        },
      },
    }
  );
  return client;
}

let browserClient: ReturnType<typeof buildClient> | null = null;

/**
 * Browser Supabase client for hotel staff (Clerk sessions). Subject to Row
 * Level Security. One instance per tab, so every subscription shares a single
 * Realtime socket. See https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794
 *
 * `supabase.auth` is not available on this client (Clerk owns auth). Platform
 * super-admins use `createPlatformBrowserClient` from `./platform-browser`.
 */
export function createClient() {
  browserClient ??= buildClient();
  return browserClient;
}
