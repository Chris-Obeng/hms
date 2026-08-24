"use client";

import * as React from "react";
import { toast } from "@heroui/react";
import { CheckCircle2, AlertCircle, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeroSelectField } from "@/components/ui/hero-select";
import { cn } from "@/lib/utils";
import { SettingsSubHeader } from "../_components/settings-sub-header";
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
    desc: "Guests decide — pay online now or at check-in. Best conversion.",
  },
  {
    value: "pay_now_only",
    label: "Online Payment Required",
    desc: "Booking only confirms after card payment. No ghost reservations.",
  },
  {
    value: "pay_later_only",
    label: "Pay at Check-In",
    desc: "No online payment collected. All guests pay on arrival.",
  },
];

// ── Props ─────────────────────────────────────────────────────────

interface Props {
  hotelName: string;
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

export function PaymentsSettingsClient({ hotelName, initialData }: Props) {
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
  const [businessName, setBusinessName] = React.useState(initialData.businessName ?? hotelName);
  const [settlement, setSettlement] = React.useState(initialData.settlementSchedule);
  const [verified, setVerified] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

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
      if (r.success) setBanks(r.banks);
      else setBanksError(true);
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
    setVerifying(true);
    const r = await verifyBankAccount(accountNumber, bankCode);
    setVerifying(false);
    if (r.success) {
      setVerified(r.accountName);
    } else {
      toast.danger(r.error ?? "Could not verify account");
    }
  }

  async function handleSave() {
    if (!accountValid || !verified || !bankCode || !businessName) return;
    setSaving(true);
    const r = await savePaystackBankAccount({
      businessName,
      bankCode,
      accountNumber,
      settlementSchedule: settlement,
    });
    setSaving(false);
    if (r.success) {
      toast.success("Bank account saved. Guests can now pay online.");
    } else {
      toast.danger(r.error ?? "Failed to save bank account");
    }
  }

  const isActive = !!initialData.subaccountCode;

  // Changing bank or account invalidates a previous verification
  const changeBank = (code: string) => {
    setBankCode(code);
    setVerified(null);
    const next = banks.find((b) => b.code === code);
    if (next?.type === "mobile_money") {
      setAccountNumber((v) => v.slice(0, 10));
    }
  };
  const changeAccountNumber = (raw: string) => {
    setAccountNumber(raw.slice(0, maxAccountLength));
    setVerified(null);
  };

  return (
    <div className="space-y-7 max-w-xl">
      <SettingsSubHeader icon={CreditCard} title="Payments" subtitle="Payment policy and Paystack bank setup" />

      {/* Payment Policy */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-section text-foreground">Payment policy</h2>
          {savingPolicy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
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
                "tap-target w-full text-left rounded-xl border px-4 py-3 transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                policy === opt.value
                  ? "border-foreground bg-foreground/[0.04]"
                  : "border-border/60 hover:border-border"
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="block">
                  <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                  <span className="block text-caption text-muted-foreground mt-0.5">{opt.desc}</span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "size-4 rounded-full border-2 shrink-0 transition-colors",
                    policy === opt.value
                      ? "border-foreground bg-foreground ring-2 ring-offset-1 ring-foreground"
                      : "border-border"
                  )}
                />
              </span>
            </button>
          ))}
        </div>
        <p className="text-caption text-muted-foreground">
          Applies to new bookings made through your guest booking page.
        </p>
      </section>

      {/* Paystack Bank Account */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-section text-foreground">Paystack bank account</h2>
          {isActive ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="size-3.5" />
              Active
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <AlertCircle className="size-3.5" />
              Not set up
            </span>
          )}
        </div>

        {!isActive && (
          <p className="text-caption rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2.5 leading-relaxed">
            Guests cannot pay online until a bank account is set up. Walk-in and “pay at check-in”
            bookings still work.
          </p>
        )}

        {isActive && (
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-caption space-y-1">
            <p className="truncate">
              <span className="text-muted-foreground">Subaccount:</span>{" "}
              <span className="font-mono">{initialData.subaccountCode}</span>
            </p>
            <p className="truncate">
              <span className="text-muted-foreground">Account:</span> {initialData.accountNumber} ·{" "}
              {initialData.businessName}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-label text-muted-foreground mb-1.5 block">Business name</label>
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Hotel trading name"
              className="h-10 rounded-xl"
            />
          </div>

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
                isDisabled={banksLoading}
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
                disabled={verifying || !bankCode || !accountValid}
              >
                {verifying ? <Loader2 className="size-3.5 animate-spin" /> : "Verify"}
              </Button>
            </div>
            <p id="account-number-hint" className="text-caption text-muted-foreground mt-1.5">
              {isMobileMoney
                ? "MTN MoMo, Telecel Cash or AirtelTigo number — exactly 10 digits. We confirm the registered wallet name."
                : selectedBank
                  ? "Ghana bank accounts are often longer than 10 digits — enter the full number."
                  : "Select a bank first, then enter the full account number."}
            </p>
            {verified && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                <CheckCircle2 className="size-3.5" />
                {verified}
              </p>
            )}
          </div>

          <div>
            <label className="text-label text-muted-foreground mb-1.5 block">Settlement schedule</label>
            <HeroSelectField
              value={settlement}
              onValueChange={setSettlement}
              options={[
                { value: "auto", label: "Automatic (T+1)" },
                { value: "weekly", label: "Weekly" },
                { value: "manual", label: "Manual" },
              ]}
              ariaLabel="Settlement schedule"
            />
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !verified || !bankCode || !accountNumber || !businessName}
          className="w-full h-10 rounded-xl bg-foreground text-background hover:bg-foreground/90 text-sm"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin mr-2" /> : null}
          {saving ? "Saving…" : isActive ? "Update Bank Account" : "Save & Activate Payments"}
        </Button>
      </section>
    </div>
  );
}
