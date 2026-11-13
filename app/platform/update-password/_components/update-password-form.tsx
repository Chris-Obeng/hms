"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createPlatformBrowserClient } from "@/lib/supabase/platform-browser";
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
    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createPlatformBrowserClient();
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
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl text-foreground">New password</CardTitle>
        <CardDescription className="text-foreground/50">Choose a strong password</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid gap-2">
            <label htmlFor="password" className="text-xs font-medium text-foreground/70">
              New password
            </label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring h-10"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="confirm" className="text-xs font-medium text-foreground/70">
              Confirm password
            </label>
            <Input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            {loading ? <><Loader2 className="size-4 mr-2 animate-spin" />Saving…</> : "Save new password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
