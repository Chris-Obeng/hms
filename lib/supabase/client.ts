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
 * Automatically injects Clerk's Supabase JWT token if available.
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
              const token = await window.Clerk.session.getToken({ template: "supabase" });
              if (token) {
                headers.set("Authorization", `Bearer ${token}`);
              }
            } catch (e) {
              console.error("Clerk token injection failed:", e);
            }
          }

          return fetch(url, { ...options, headers });
        },
      },
    }
  );
}
