"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push("/platform/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader>
        <CardTitle className="text-xl text-white">New password</CardTitle>
        <CardDescription className="text-white/50">Choose a strong password</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-white/70">
              New password
            </label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white/10 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/30 h-10"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="confirm" className="text-xs font-medium text-white/70">
              Confirm password
            </label>
            <Input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            {loading ? <><Loader2 className="size-4 mr-2 animate-spin" />Saving…</> : "Save new password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
