import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import type { Database } from "@/types/database.types";

/**
 * Per-request Supabase client bound to the current user's cookies and
 * Clerk JWT session. The Clerk JWT is sent as an Authorization header
 * so that Supabase Row Level Security (RLS) can identify the user
 * via `auth.jwt() ->> 'sub'` (returns the Clerk user ID).
 *
 * RLS setup requires a JWT template in Clerk Dashboard named "supabase"
 * that includes at minimum:
 *   { "sub": "{{user.id}}", "aud": "authenticated", "role": "authenticated" }
 * signed with Supabase's JWT secret (found in Supabase Dashboard → Settings → API).
 *
 * If no Clerk session exists (public page), the client falls back to
 * the anon key with no auth header — RLS treats this as the public role.
 */
export async function createClient() {
  const cookieStore = await cookies();

  // Retrieve the Clerk JWT for the "supabase" template.
  // If the template isn't configured yet, getToken returns null
  // and we fall through to the anon client.
  let token: string | null = null;
  try {
    const { getToken } = await auth();
    if (getToken) {
      token = await getToken({ template: "supabase" });
    }
  } catch (e) {
    // Clerk session unavailable or template not configured — use anon client.
    // Log a warning in non-production so misconfigurations surface early.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[supabase/server] Clerk JWT fetch failed (falling back to anon):", e);
    }
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
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
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}
