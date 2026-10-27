"use client";

import * as React from "react";
import { AlertDialog, Button as HeroButton, toast } from "@heroui/react";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { HeroSelectField } from "@/components/ui/hero-select";
import { cn } from "@/lib/utils";
import {
  fetchPaystackBanks,
  verifyBankAccount,
  savePaystackBankAccount,
  updatePaymentPolicy,
  type PaymentPolicy,
} from "@/app/actions/paystack";

// ── Policy Option ─────────────────────────────────────────────────

const POLICY_OPTIONS: { value: PaymentPolicy; label: string; desc: string }[] = [
  {
    value: "choice",
    label: "Guest's Choice",
    desc: "Online or at check-in.",
  },
  {
    value: "pay_now_only",
    label: "Pay Online",
    desc: "Payment is required to confirm.",
  },
  {
    value: "pay_later_only",
    label: "Pay at Check-In",
    desc: "Collect payment on arrival.",
  },
];

// ── Props ─────────────────────────────────────────────────────────

interface Props {
  initialData: {
    subaccountCode: string | null;
    bankCode: string | null;
    accountNumber: string | null;
    businessName: string | null;
    settlementSchedule: string;
    paymentPolicy: string;
  };
}

// ── Component ─────────────────────────────────────────────────────

export function PaymentsSettingsClient({ initialData }: Props) {
  const router = useRouter();
  // Policy
  const [policy, setPolicy] = React.useState<PaymentPolicy>(
    (initialData.paymentPolicy as PaymentPolicy) ?? "choice"
  );
  const [savingPolicy, setSavingPolicy] = React.useState(false);

  // Bank setup
  const [banks, setBanks] = React.useState<{ name: string; code: string; type?: string }[]>([]);
  const [banksLoading, setBanksLoading] = React.useState(false);
  const [banksError, setBanksError] = React.useState(false);
  const [bankCode, setBankCode] = React.useState(initialData.bankCode ?? "");
  const [accountNumber, setAccountNumber] = React.useState(initialData.accountNumber ?? "");
  const [verified, setVerified] = React.useState<string | null>(null);
  const [verificationConfirmed, setVerificationConfirmed] = React.useState(false);
  const [verificationOpen, setVerificationOpen] = React.useState(false);
  const verificationCloseReason = React.useRef<"confirm" | "cancel" | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const verificationAttempt = React.useRef(0);

  // Channel rules from Paystack's bank list: wallets ("mobile_money") are
  // exactly 10 digits with no name lookup; bank channels allow 6–20 digits.
  const selectedBank = banks.find((b) => b.code === bankCode);
  const isMobileMoney = selectedBank?.type === "mobile_money";
  const maxAccountLength = isMobileMoney ? 10 : 20;
  const accountValid = isMobileMoney
    ? /^\d{10}$/.test(accountNumber)
    : /^\d{6,20}$/.test(accountNumber);

  const loadBanks = React.useCallback(async () => {
    setBanksLoading(true);
    setBanksError(false);
    try {
      const r = await fetchPaystackBanks();
      if (r.success) {
        // Paystack's Ghana list repeats some sort codes; keep first per code so
        // the select has unique keys (find() is already first-wins on type).
        const seen = new Set<string>();
        setBanks(r.banks.filter((b) => !seen.has(b.code) && seen.add(b.code)));
      } else setBanksError(true);
    } catch {
      setBanksError(true);
    } finally {
      setBanksLoading(false);
    }
  }, []);

  // Load banks on mount (deferred so state updates stay out of the effect body)
  React.useEffect(() => {
    const t = window.setTimeout(loadBanks, 0);
    return () => window.clearTimeout(t);
  }, [loadBanks]);

  async function handlePolicyChange(p: PaymentPolicy) {
    if (p === policy) return;
    const previous = policy;
    setPolicy(p);
    setSavingPolicy(true);
    const r = await updatePaymentPolicy(p);
    setSavingPolicy(false);
    if (!r.success) {
      setPolicy(previous);
      toast.danger(r.error ?? "Failed to save policy");
    }
  }

  async function handleVerify() {
    if (!bankCode || !accountValid) return;
    const attempt = ++verificationAttempt.current;
    const requestedBankCode = bankCode;
    const requestedAccountNumber = accountNumber;
    setVerifying(true);
    const r = await verifyBankAccount(requestedAccountNumber, requestedBankCode);
    setVerifying(false);
    if (attempt !== verificationAttempt.current || bankCode !== requestedBankCode || accountNumber !== requestedAccountNumber) return;
    if (r.success) {
      setVerified(r.accountName);
      setVerificationConfirmed(false);
      setVerificationOpen(true);
    } else {
      toast.danger(r.error ?? "Could not verify account");
    }
  }

  async function handleSave() {
    if (!accountValid || !verified || !verificationConfirmed || !bankCode) return;
    setSaving(true);
    const r = await savePaystackBankAccount({
      bankCode,
      accountNumber,
      confirmedAccountName: verified,
      // Schedule is no longer editable in the UI — preserve the stored value.
      settlementSchedule: initialData.settlementSchedule,
    });
    setSaving(false);
    if (r.success) {
      toast.success("Bank account saved. Guests can now pay online.");
      router.refresh();
    } else {
      toast.danger(r.error ?? "Failed to save bank account");
    }
  }

  const isActive = !!initialData.subaccountCode;

  // Changing bank or account invalidates a previous verification
  const changeBank = (code: string) => {
    verificationAttempt.current += 1;
    setBankCode(code);
    setVerified(null);
    setVerificationConfirmed(false);
    const next = banks.find((b) => b.code === code);
    if (next?.type === "mobile_money") {
      setAccountNumber((v) => v.slice(0, 10));
    }
  };
  const changeAccountNumber = (raw: string) => {
    verificationAttempt.current += 1;
    setAccountNumber(raw.slice(0, maxAccountLength));
    setVerified(null);
    setVerificationConfirmed(false);
  };

  const policyPreview = policy === "choice"
    ? "Guests can choose online payment or pay when they arrive."
    : policy === "pay_now_only"
      ? "Guests pay online before their booking is confirmed."
      : "Guests complete payment at check-in.";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="payments-settings-section">
        <div className="payments-settings-copy">
          <h2 className="text-section text-foreground">How guests pay</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose the default for new bookings.</p>
        </div>
        <div className="space-y-2" role="radiogroup" aria-label="Payment policy">
          {POLICY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={policy === opt.value}
              disabled={savingPolicy}
              onClick={() => handlePolicyChange(opt.value)}
              className={cn(
                "tap-target w-full text-left rounded-2xl border px-4 py-3.5 transition-[border-color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
                policy === opt.value
                  ? "border-foreground bg-foreground/[0.045]"
                  : "border-border/60 bg-card hover:border-foreground/30"
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="block">
                  <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                  <span className="block text-caption text-muted-foreground mt-0.5">{opt.desc}</span>
                </span>
                <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors", policy === opt.value ? "border-foreground" : "border-border")}>
                  {policy === opt.value && <span className="size-2.5 rounded-full bg-foreground" />}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="rounded-2xl bg-muted/35 px-4 py-3 text-sm"><span className="font-medium">Guest checkout</span><span className="ml-2 text-muted-foreground">{policyPreview}</span>{savingPolicy && <Loader2 className="ml-2 inline size-3.5 animate-spin text-muted-foreground" aria-label="Saving" />}</div>
      </section>

      <section className="payments-settings-section">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="payments-settings-copy">
            <h2 className="text-section text-foreground">Payout account</h2>
            <p className="mt-1 text-sm text-muted-foreground">Where online payments are settled.</p>
          </div>
          {isActive ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-3.5" /> Connected
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              Not connected
            </span>
          )}
        </div>

        {isActive && (
          <div className="flex items-center gap-3 rounded-2xl bg-muted/35 px-4 py-3">
            <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 text-sm"><p className="truncate font-medium">{initialData.businessName}</p><p className="truncate text-muted-foreground">Account ending {initialData.accountNumber?.slice(-4) ?? "—"}</p></div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-label text-muted-foreground mb-1.5 block">Bank</label>
            {banksError ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5">
                <span className="text-caption text-muted-foreground">
                  Could not load Ghana bank list.
                </span>
                <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={loadBanks} disabled={banksLoading}>
                  <RefreshCw className={cn("size-3", banksLoading && "animate-spin")} />
                  Retry
                </Button>
              </div>
            ) : (
              <HeroSelectField
                value={bankCode}
                onValueChange={changeBank}
                isDisabled={banksLoading || verifying || saving}
                options={banks.map((b) => ({ value: b.code, label: b.name }))}
                placeholder={banksLoading ? "Loading banks…" : "Select bank"}
                ariaLabel="Bank"
              />
            )}
          </div>

          <div>
            <label className="text-label text-muted-foreground mb-1.5 block">
              {isMobileMoney ? "Mobile money number" : "Bank account number"}
            </label>
            <div className="flex gap-2">
              <Input
                 value={accountNumber}
                 disabled={verifying || saving}
                onChange={(e) =>
                  changeAccountNumber(e.target.value.replace(/\D/g, ""))
                }
                placeholder={isMobileMoney ? "0244000000" : "Account number"}
                className="h-10 rounded-xl font-mono"
                inputMode="numeric"
                autoComplete="off"
                maxLength={maxAccountLength}
                aria-describedby="account-number-hint"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 rounded-xl shrink-0 min-w-[88px]"
                onClick={handleVerify}
                 disabled={verifying || saving || !bankCode || !accountValid}
              >
                {verifying ? <Loader2 className="size-3.5 animate-spin" /> : "Verify"}
              </Button>
            </div>
            <p id="account-number-hint" className="text-caption text-muted-foreground mt-1.5">{isMobileMoney ? "Enter the 10-digit wallet number." : "Enter the full account number."}</p>
            {verified && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 mt-1 font-medium">
                <CheckCircle2 className="size-3.5" />
                Verified account name: {verified}
              </p>
            )}
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !verified || !verificationConfirmed || !bankCode || !accountNumber}
          className="w-full h-10 rounded-xl bg-foreground text-background hover:bg-foreground/90 text-sm"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin mr-2" /> : null}
          {saving ? "Saving…" : isActive ? "Save changes" : "Connect payout account"}
        </Button>
      </section>

      <AlertDialog.Backdrop
        isOpen={verificationOpen}
        onOpenChange={(open) => {
          setVerificationOpen(open);
          if (!open && verificationCloseReason.current !== "confirm") {
            setVerified(null);
            setVerificationConfirmed(false);
          }
          if (!open) verificationCloseReason.current = null;
        }}
        isDismissable
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="w-full max-w-md rounded-3xl border border-border/60 bg-card p-6 shadow-2xl">
            <AlertDialog.Header>
              <AlertDialog.Icon status="success" />
              <AlertDialog.Heading>Confirm payout account</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-4">
              <p className="text-sm text-muted-foreground">Paystack found this registered account. Confirm that the details are correct before saving.</p>
              <dl className="divide-y divide-border/60 rounded-2xl bg-muted/35 px-4">
                <div className="flex flex-col gap-1 py-3"><dt className="text-xs text-muted-foreground">Account name</dt><dd className="text-sm font-semibold text-foreground">{verified}</dd></div>
                <div className="flex flex-col gap-1 py-3"><dt className="text-xs text-muted-foreground">Account number</dt><dd className="font-mono text-sm font-semibold tracking-wide text-foreground">{accountNumber}</dd></div>
              </dl>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <HeroButton slot="close" variant="tertiary" onPress={() => { verificationCloseReason.current = "cancel"; setVerified(null); setVerificationConfirmed(false); }}>No, re-enter</HeroButton>
              <HeroButton slot="close" variant="primary" onPress={() => { verificationCloseReason.current = "confirm"; setVerificationConfirmed(true); setVerificationOpen(false); }}>Yes, this is correct</HeroButton>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
