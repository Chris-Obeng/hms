"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
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

    const supabase = createClient();
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
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-xl text-white">Check your email</CardTitle>
          <CardDescription className="text-white/50">
            Password reset instructions sent
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-white/50">
            If an account exists for <strong className="text-white">{email}</strong>, you will receive a password reset link shortly.
          </p>
          <Link
            href="/platform/sign-in"
            className="inline-block mt-4 text-sm text-white/60 hover:text-white underline underline-offset-2 transition-colors"
          >
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader>
        <CardTitle className="text-xl text-white">Reset your password</CardTitle>
        <CardDescription className="text-white/50">
          Enter your email and we'll send you a reset link
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
            {loading ? <><Loader2 className="size-4 mr-2 animate-spin" />Sending…</> : "Send reset link"}
          </Button>
          <Link
            href="/platform/sign-in"
            className="text-center text-xs text-white/40 hover:text-white/70 underline-offset-2 hover:underline transition-colors"
          >
            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
