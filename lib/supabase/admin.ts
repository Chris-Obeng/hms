import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Service-role Supabase client. BYPASSES Row Level Security — use only
 * for trusted server-to-server work (e.g. the Clerk webhook handler that
 * needs to insert staff_profiles before the user has a session).
 *
 * Never expose this to the browser; never accept user input and forward it
 * to this client without authorization checks at the application layer.
 */
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
