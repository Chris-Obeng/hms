"use client";

import * as React from "react";
import { AlertDialog, Button as HeroButton, toast } from "@heroui/react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { HeroSelectField } from "@/components/ui/hero-select";
import { cn } from "@/lib/utils";
import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";
import {
  fetchPaystackBanks,
  verifyBankAccount,
  savePaystackBankAccount,
  updatePaymentPolicy,
  type PaymentPolicy,
} from "@/app/actions/paystack";

const POLICY_OPTIONS: { value: PaymentPolicy; label: string; desc: string }[] = [
  { value: "choice", label: "Guest's Choice", desc: "Online or at check-in." },
  { value: "pay_now_only", label: "Pay Online", desc: "Payment is required to confirm." },
  { value: "pay_later_only", label: "Pay at Check-In", desc: "Collect payment on arrival." },
];

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

export function PaymentsSettingsClient({ initialData }: Props) {
  const router = useRouter();

  // ── Policy (explicit save, per the design's Save action) ──────────
  const initialPolicy = (initialData.paymentPolicy as PaymentPolicy) ?? "choice";
  const [policy, setPolicy] = React.useState<PaymentPolicy>(initialPolicy);
  const [savedPolicy, setSavedPolicy] = React.useState<PaymentPolicy>(initialPolicy);
  const [savingPolicy, setSavingPolicy] = React.useState(false);
  const policyDirty = policy !== savedPolicy;

  async function savePolicy() {
    setSavingPolicy(true);
    const r = await updatePaymentPolicy(policy);
    setSavingPolicy(false);
    if (r.success) {
      setSavedPolicy(policy);
      toast.success("Payment policy saved.");
    } else {
      toast.danger(r.error ?? "Failed to save policy");
    }
  }

  // ── Bank setup ────────────────────────────────────────────────────
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
  const fieldsUntouched = bankCode === (initialData.bankCode ?? "") &&
    accountNumber === (initialData.accountNumber ?? "");
  const isActive = !!initialData.subaccountCode;
  const connectedNote = verified
    ? `Account verified — ${selectedBank?.name ?? "bank"} ••••${accountNumber.slice(-4)}`
    : isActive && fieldsUntouched
      ? `Connected — ${initialData.businessName ?? "bank account"} ••••${initialData.accountNumber?.slice(-4) ?? "—"}`
      : null;

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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PenCard className="gap-3.5">
        <PenCardHead title="Payment policy" caption="When guests are asked to pay." />
        <div className="flex flex-col gap-3 sm:flex-row" role="radiogroup" aria-label="Payment policy">
          {POLICY_OPTIONS.map((opt) => {
            const selected = policy === opt.value;
            return <button key={opt.value} type="button" role="radio" aria-checked={selected}
              disabled={savingPolicy} onClick={() => setPolicy(opt.value)}
              className={cn(
                "flex min-w-0 flex-1 items-start gap-2.5 rounded-xl p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "bg-[#0485F70A] ring-[1.5px] ring-inset ring-[var(--pen-accent)]" : "bg-card ring-1 ring-inset ring-border hover:ring-border",
              )}>
              <span aria-hidden className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-card",
                selected ? "border-[var(--pen-accent)]" : "border-border",
              )}>
                {selected && <span className="size-2 rounded-full bg-[var(--pen-accent)]" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-foreground">{opt.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{opt.desc}</span>
              </span>
            </button>;
          })}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3">
          <p className="text-[11px] text-muted-foreground">
            Policy applies to new bookings immediately.
            {savingPolicy && <Loader2 className="ml-2 inline size-3.5 animate-spin text-muted-foreground" aria-label="Saving" />}
          </p>
          <HeroButton variant="primary" isPending={savingPolicy} isDisabled={!policyDirty} onPress={savePolicy}
            className="h-9 rounded-full px-4 text-sm font-medium">
            Save
          </HeroButton>
        </footer>
      </PenCard>

      <PenCard className="gap-3.5">
        <PenCardHead title="Settlement account" caption="Where your payouts are sent." />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex w-full flex-col gap-1.5 sm:w-60">
            <label className="text-xs font-medium text-muted-foreground">Bank / mobile money</label>
            {banksError ? (
              <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border px-3 py-2">
                <span className="text-[11px] text-muted-foreground">Could not load banks.</span>
                <HeroButton variant="outline" size="sm" className="h-7 shrink-0 rounded-full px-3 text-xs" onPress={loadBanks} isDisabled={banksLoading}>
                  <RefreshCw className={cn("size-3", banksLoading && "animate-spin")} /> Retry
                </HeroButton>
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
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Account number</label>
            <input value={accountNumber}
              disabled={verifying || saving}
              onChange={(e) => changeAccountNumber(e.target.value.replace(/\D/g, ""))}
              placeholder={isMobileMoney ? "0244000000" : "Account number"}
              className="h-10 w-full rounded-[10px] border border-border/70 bg-card px-3 font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60"
              inputMode="numeric" autoComplete="off" maxLength={maxAccountLength}
              aria-describedby="account-number-hint" />
          </div>
          <HeroButton variant="outline" className="h-10 shrink-0 rounded-full px-4 text-sm font-medium sm:w-[120px]"
            onPress={handleVerify} isPending={verifying}
            isDisabled={verifying || saving || !bankCode || !accountValid}>
            Verify
          </HeroButton>
        </div>
        <p id="account-number-hint" className="text-[11px] text-muted-foreground">
          {isMobileMoney ? "Enter the 10-digit wallet number." : "Enter the full account number. We verify the name before saving."}
        </p>
        {connectedNote && <p className="flex items-center gap-2 rounded-[10px] bg-[#17C9640F] px-3 py-2.5 text-xs font-medium text-[var(--success)]">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> {connectedNote}
        </p>}
        <footer className="border-t border-border/50 pt-3">
          <HeroButton variant="primary" onPress={handleSave}
            isPending={saving}
            isDisabled={saving || !verified || !verificationConfirmed || !bankCode || !accountNumber}
            className="h-9 rounded-full px-4 text-sm font-medium">
            {isActive ? "Save changes" : "Connect payout account"}
          </HeroButton>
        </footer>
      </PenCard>

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
