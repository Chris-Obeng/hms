"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldCheck } from "lucide-react";

import { createPlatformBrowserClient } from "@/lib/supabase/platform-browser";
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
  const mfaParam = searchParams.get("mfa") === "1";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mfaFactorId, setMfaFactorId] = React.useState<string | null>(null);
  const [mfaCode, setMfaCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(
    errorParam === "unauthorized"
      ? "Your account is not authorised as a platform admin. Contact your system administrator."
      : null
  );
  const [loading, setLoading] = React.useState(false);

  // If redirected from PlatformLayout (`?mfa=1`) with an active AAL1 session,
  // automatically load the admin's verified TOTP factor so they can step up to AAL2.
  React.useEffect(() => {
    if (!mfaParam) return;
    let cancelled = false;
    const supabase = createPlatformBrowserClient();
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      if (cancelled) return;
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (verified) setMfaFactorId(verified.id);
    });
    return () => {
      cancelled = true;
    };
  }, [mfaParam]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createPlatformBrowserClient();

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      const { data: aalData } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.nextLevel === "aal2" && aalData.currentLevel !== "aal2") {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verified = factors?.totp?.find((f) => f.status === "verified");
        if (verified) {
          setMfaFactorId(verified.id);
          return;
        }
      }

      router.push("/platform/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An error occurred. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId || mfaCode.trim().length < 6) return;
    setLoading(true);
    setError(null);

    const supabase = createPlatformBrowserClient();
    try {
      const { data: challenge, error: challengeErr } =
        await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challengeErr || !challenge) {
        throw challengeErr ?? new Error("Could not start MFA challenge.");
      }

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode.trim(),
      });
      if (verifyErr) throw verifyErr;

      router.push("/platform/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Invalid verification code. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelMfa() {
    setLoading(true);
    try {
      await fetch("/platform/auth/sign-out", { method: "POST" });
      const supabase = createPlatformBrowserClient();
      await supabase.auth.signOut();
      setMfaFactorId(null);
      setMfaCode("");
      router.replace("/platform/sign-in");
    } finally {
      setLoading(false);
    }
  }

  if (mfaFactorId) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card className="border-border bg-card text-foreground shadow-2xl">
          <CardHeader className="pb-4">
            <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" aria-hidden />
            </div>
            <CardTitle className="text-xl text-foreground">
              Two-factor verification
            </CardTitle>
            <CardDescription className="text-foreground/50">
              Enter the 6-digit code from your authenticator app to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMfaVerify} className="flex flex-col gap-6">
              <div className="grid gap-2">
                <label
                  htmlFor="totp-code"
                  className="text-xs font-medium text-foreground/70"
                >
                  Authenticator code
                </label>
                <Input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="000000"
                  required
                  value={mfaCode}
                  onChange={(e) =>
                    setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="bg-secondary border-border text-foreground font-mono tracking-widest text-center text-base h-10"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading || mfaCode.trim().length !== 6}
                className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify & continue"
                )}
              </Button>

              <button
                type="button"
                disabled={loading}
                onClick={handleCancelMfa}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Use a different account
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border bg-card text-foreground shadow-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl text-foreground">Sign in</CardTitle>
          <CardDescription className="text-foreground/50">
            Internal access only — authorised Oriel team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            <div className="grid gap-2">
              <label htmlFor="email" className="text-xs font-medium text-foreground/70">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring h-10"
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium text-foreground/70">
                  Password
                </label>
                <Link
                  href="/platform/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground/70 underline-offset-2 hover:underline transition-colors"
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
