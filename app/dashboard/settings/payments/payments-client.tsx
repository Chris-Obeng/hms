"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "@heroui/react";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  hotelEmail: string;
  currency: string;
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

export function PaymentsSettingsClient({ hotelName, hotelEmail, currency, initialData }: Props) {
  // Policy
  const [policy, setPolicy] = React.useState<PaymentPolicy>(
    (initialData.paymentPolicy as PaymentPolicy) ?? "choice"
  );
  const [savingPolicy, setSavingPolicy] = React.useState(false);

  // Bank setup
  const [banks, setBanks] = React.useState<{ name: string; code: string }[]>([]);
  const [banksLoading, setBanksLoading] = React.useState(false);
  const [bankCode, setBankCode] = React.useState(initialData.bankCode ?? "");
  const [accountNumber, setAccountNumber] = React.useState(initialData.accountNumber ?? "");
  const [businessName, setBusinessName] = React.useState(initialData.businessName ?? hotelName);
  const [settlement, setSettlement] = React.useState(initialData.settlementSchedule);
  const [verified, setVerified] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Load banks on mount
  React.useEffect(() => {
    setBanksLoading(true);
    fetchPaystackBanks().then((r) => {
      if (r.success) setBanks(r.banks);
      setBanksLoading(false);
    });
  }, []);

  // Reset verification when bank/account changes
  React.useEffect(() => {
    setVerified(null);
  }, [bankCode, accountNumber]);

  async function handlePolicyChange(p: PaymentPolicy) {
    setPolicy(p);
    setSavingPolicy(true);
    const r = await updatePaymentPolicy(p);
    setSavingPolicy(false);
    if (!r.success) toast.danger(r.error ?? "Failed to save policy");
  }

  async function handleVerify() {
    if (!bankCode || accountNumber.length < 10) return;
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
    if (!verified || !bankCode || !accountNumber || !businessName) return;
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

  return (
    <div className="space-y-8 max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Payments</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Payment policy and Paystack bank setup</p>
        </div>
      </div>

      {/* Payment Policy */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Payment Policy</h2>
          {savingPolicy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="space-y-2">
          {POLICY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handlePolicyChange(opt.value)}
              className={cn(
                "w-full text-left rounded-xl border px-4 py-3 transition-all",
                policy === opt.value
                  ? "border-foreground bg-foreground/5"
                  : "border-border/60 hover:border-border"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </div>
                <div
                  className={cn(
                    "size-4 rounded-full border-2 shrink-0 transition-colors",
                    policy === opt.value
                      ? "border-foreground bg-foreground"
                      : "border-border"
                  )}
                />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Paystack Bank Account */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Paystack Bank Account</h2>
          {isActive ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="size-3.5" />
              Active
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
              <AlertCircle className="size-3.5" />
              Not set up
            </span>
          )}
        </div>

        {!isActive && (
          <p className="text-xs text-muted-foreground rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            Guests cannot pay online until a bank account is set up. Walk-in and "pay at check-in" bookings still work.
          </p>
        )}

        {isActive && (
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs space-y-1">
            <p><span className="text-muted-foreground">Subaccount:</span> <span className="font-mono">{initialData.subaccountCode}</span></p>
            <p><span className="text-muted-foreground">Account:</span> {initialData.accountNumber} · {initialData.businessName}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Business name</label>
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Hotel trading name"
              className="h-9 rounded-xl"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Bank</label>
            <HeroSelectField value={bankCode} onValueChange={setBankCode} isDisabled={banksLoading} options={banks.map((b) => ({ value: b.code, label: b.name }))} placeholder={banksLoading ? "Loading banks…" : "Select bank"} ariaLabel="Bank" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Account number</label>
            <div className="flex gap-2">
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="0123456789"
                className="h-9 rounded-xl font-mono"
                maxLength={10}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-xl shrink-0"
                onClick={handleVerify}
                disabled={verifying || !bankCode || accountNumber.length < 10}
              >
                {verifying ? <Loader2 className="size-3.5 animate-spin" /> : "Verify"}
              </Button>
            </div>
            {verified && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 mt-1.5 font-medium">
                <CheckCircle2 className="size-3.5" />
                {verified}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Settlement schedule</label>
            <HeroSelectField value={settlement} onValueChange={setSettlement} options={[{ value: "auto", label: "Automatic (T+1)" }, { value: "weekly", label: "Weekly" }, { value: "manual", label: "Manual" }]} ariaLabel="Settlement schedule" />
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !verified || !bankCode || !accountNumber || !businessName}
          className="w-full h-9 rounded-xl bg-foreground text-background hover:bg-foreground/90 text-sm"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin mr-2" /> : null}
          {saving ? "Saving…" : isActive ? "Update Bank Account" : "Save & Activate Payments"}
        </Button>
      </section>
    </div>
  );
}
