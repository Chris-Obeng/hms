"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

/**
 * Pure Supabase Auth browser client for `/platform` (`HIGH-10`).
 *
 * Unlike `lib/supabase/client.ts` (which injects a Clerk `"supabase"` template
 * JWT for hotel staff), Platform Super-Admins authenticate directly via
 * Supabase Auth + TOTP MFA cookies, so Clerk sessions in the same browser must
 * never overwrite the Authorization header here.
 */
export function createPlatformBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
