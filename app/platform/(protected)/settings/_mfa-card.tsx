"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, toast } from "@heroui/react";
import { CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { createPlatformBrowserClient } from "@/lib/supabase/platform-browser";

interface TotpFactorSummary {
  id: string;
  friendlyName: string;
  status: string;
  createdAt: string;
}

export function PlatformMfaCard({
  initialFactors,
  initialAal,
}: {
  initialFactors: TotpFactorSummary[];
  initialAal: string;
}) {
  const router = useRouter();
  const [factors, setFactors] = React.useState<TotpFactorSummary[]>(initialFactors);
  const [aal, setAal] = React.useState(initialAal);
  const [enrolling, setEnrolling] = React.useState(false);
  const [pendingEnrollment, setPendingEnrollment] = React.useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = React.useState("");
  const [verifying, setVerifying] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const verifiedFactors = factors.filter((f) => f.status === "verified");
  const isProtected = verifiedFactors.length > 0;

  async function refreshMfaState() {
    const supabase = createPlatformBrowserClient();
    const [{ data: list }, { data: aalData }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (list?.totp) {
      setFactors(
        list.totp.map((f) => ({
          id: f.id,
          friendlyName: f.friendly_name ?? "Authenticator app",
          status: f.status,
          createdAt: f.created_at,
        }))
      );
    }
    if (aalData?.currentLevel) {
      setAal(aalData.currentLevel);
    }
    router.refresh();
  }

  async function handleStartEnroll() {
    setEnrolling(true);
    try {
      const supabase = createPlatformBrowserClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `RoomLine Admin (${new Date().toISOString().slice(0, 10)})`,
      });
      if (error || !data) {
        throw error ?? new Error("Could not start TOTP enrollment.");
      }
      setPendingEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode("");
    } catch (err) {
      toast.danger(
        err instanceof Error
          ? err.message
          : "Could not enroll authenticator app. Ensure TOTP MFA is enabled in Supabase Auth settings."
      );
    } finally {
      setEnrolling(false);
    }
  }

  async function handleConfirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingEnrollment || code.trim().length !== 6) return;
    setVerifying(true);
    try {
      const supabase = createPlatformBrowserClient();
      const { data: challenge, error: challengeErr } =
        await supabase.auth.mfa.challenge({
          factorId: pendingEnrollment.factorId,
        });
      if (challengeErr || !challenge) {
        throw challengeErr ?? new Error("Could not create MFA challenge.");
      }

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: pendingEnrollment.factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyErr) throw verifyErr;

      toast.success("Two-factor authentication enabled (AAL2 active).");
      setPendingEnrollment(null);
      setCode("");
      await refreshMfaState();
    } catch (err) {
      toast.danger(
        err instanceof Error ? err.message : "Invalid verification code."
      );
    } finally {
      setVerifying(false);
    }
  }

  async function handleRemoveFactor(factorId: string) {
    setRemovingId(factorId);
    try {
      const supabase = createPlatformBrowserClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success("Authenticator factor removed.");
      await refreshMfaState();
    } catch (err) {
      toast.danger(
        err instanceof Error ? err.message : "Could not remove factor."
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {isProtected ? (
              <ShieldCheck className="size-4 text-emerald-500" aria-hidden />
            ) : (
              <ShieldAlert className="size-4 text-amber-500" aria-hidden />
            )}
            <h2 className="text-base font-semibold text-foreground">
              Two-factor authentication (TOTP)
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Protects platform fee settings and property status controls with
            hardware-backed AAL2 verification.
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
            isProtected && aal === "aal2"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          {isProtected ? (
            <>
              <CheckCircle2 className="size-4" aria-hidden />
              Enforced ({aal.toUpperCase()})
            </>
          ) : (
            "Recommended — Not enrolled"
          )}
        </span>
      </div>

      {verifiedFactors.length > 0 && (
        <ul className="divide-y divide-border/50 rounded-xl border border-border/50 bg-muted/20">
          {verifiedFactors.map((factor) => (
            <li
              key={factor.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-xs"
            >
              <div>
                <p className="font-medium text-foreground">
                  {factor.friendlyName}
                </p>
                <p className="text-muted-foreground">
                  Added {new Date(factor.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                size="sm"
                variant="tertiary"
                isPending={removingId === factor.id}
                onPress={() => handleRemoveFactor(factor.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {pendingEnrollment ? (
        <form
          onSubmit={handleConfirmEnroll}
          className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4"
        >
          <p className="text-xs text-foreground font-medium">
            1. Scan this QR code in 1Password, Google Authenticator, or Authy:
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Supabase returns a self-contained data:image/svg+xml;utf-8 URI */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingEnrollment.qrCode}
              alt="TOTP QR code"
              className="size-36 rounded-lg bg-white p-2 border border-border/60"
            />
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">
                Or enter setup key manually:
              </p>
              <code className="block break-all rounded bg-background px-3 py-2 font-mono text-[11px] text-foreground border border-border/50">
                {pendingEnrollment.secret}
              </code>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="enroll-totp-code"
              className="block text-xs font-medium text-foreground"
            >
              2. Enter 6-digit code to activate:
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="enroll-totp-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="h-9 w-36 rounded-lg border border-border bg-background px-3 font-mono text-sm tracking-widest text-center text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="submit"
                variant="primary"
                isPending={verifying}
                isDisabled={code.trim().length !== 6}
              >
                Verify &amp; enable
              </Button>
              <Button
                type="button"
                variant="tertiary"
                isDisabled={verifying}
                onPress={() => {
                  void handleRemoveFactor(pendingEnrollment.factorId);
                  setPendingEnrollment(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div>
          <Button
            variant={isProtected ? "secondary" : "primary"}
            isPending={enrolling}
            onPress={handleStartEnroll}
          >
            {isProtected
              ? "Add backup authenticator"
              : "Enable authenticator app (TOTP)"}
          </Button>
        </div>
      )}
    </section>
  );
}
