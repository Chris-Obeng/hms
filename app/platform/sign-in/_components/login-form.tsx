"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PlatformLoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(
    errorParam === "unauthorized"
      ? "Your account is not authorised as a platform admin. Contact your system administrator."
      : null
  );
  const [loading, setLoading] = React.useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Use the browser Supabase client — pure Supabase Auth, no Clerk
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Middleware will validate the platform_admins whitelist on the next request
      router.push("/platform/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-white/10 bg-white/5 text-white shadow-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl text-white">Sign in</CardTitle>
          <CardDescription className="text-white/50">
            Internal access only — authorised HotelOS team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="grid gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-white/70">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@hotelosprp.com"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/10 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/30 h-10"
              />
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium text-white/70">
                  Password
                </label>
                <Link
                  href="/platform/forgot-password"
                  className="text-xs text-white/40 hover:text-white/70 underline-offset-2 hover:underline transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/10 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/30 h-10"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-white text-[#1C1917] hover:bg-white/90 font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
