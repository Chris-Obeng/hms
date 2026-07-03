/**
 * Platform admin auth OTP confirm route.
 * Handles email confirmation and password reset token exchange.
 * Source: Supabase UI password-based-auth-nextjs block
 */
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createPlatformClient } from "@/lib/supabase/platform-server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const _next = searchParams.get("next");
  const next = _next?.startsWith("/") ? _next : "/platform/dashboard";

  if (token_hash && type) {
    const supabase = await createPlatformClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirect(next);
    } else {
      redirect(`/platform/auth/error?error=${encodeURIComponent(error.message)}`);
    }
  }

  redirect("/platform/auth/error?error=Invalid+or+expired+link");
}
