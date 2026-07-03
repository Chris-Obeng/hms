/**
 * lib/supabase/platform-server.ts
 *
 * Dedicated Supabase SSR client for the platform admin area.
 *
 * KEY DIFFERENCE from lib/supabase/server.ts:
 *   - Uses ONLY cookie-based Supabase Auth sessions — no Clerk JWT header.
 *   - The hotel staff client (server.ts) injects a Clerk JWT as Authorization header.
 *     That would be wrong here since platform admins are Supabase Auth users, not Clerk users.
 *   - Using getClaims() per Supabase 2026 docs (faster, local JWT verification via JWKS).
 *
 * Based on: https://supabase.com/ui/docs/nextjs/password-based-auth
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

export async function createPlatformClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore.
            // The middleware handles token refresh and sets cookies on the response.
          }
        },
      },
    }
  );
}
