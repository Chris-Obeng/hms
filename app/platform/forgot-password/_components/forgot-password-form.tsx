"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { createPlatformBrowserClient } from "@/lib/supabase/platform-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createPlatformBrowserClient();
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/platform/auth/confirm?type=recovery&next=/platform/update-password`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl text-foreground">Check your email</CardTitle>
          <CardDescription className="text-foreground/50">
            Password reset instructions sent
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/50">
            If an account exists for <strong className="text-foreground">{email}</strong>, you will receive a password reset link shortly.
          </p>
          <Link
            href="/platform/sign-in"
            className="inline-block mt-4 text-sm text-foreground/60 hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl text-foreground">Reset your password</CardTitle>
        <CardDescription className="text-foreground/50">
          Enter your email and we&rsquo;ll send you a reset link
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid gap-2">
            <label htmlFor="email" className="text-xs font-medium text-foreground/70">
              Email address
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@RoomLineprp.com"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring h-10"
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
            className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            {loading ? <><Loader2 className="size-4 mr-2 animate-spin" />Sending…</> : "Send reset link"}
          </Button>
          <Link
            href="/platform/sign-in"
            className="text-center text-xs text-muted-foreground hover:text-foreground/70 underline-offset-2 hover:underline transition-colors"
          >
            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
