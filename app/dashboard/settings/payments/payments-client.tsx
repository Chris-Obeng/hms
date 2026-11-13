"use client";

import * as React from "react";
import { Alert, AlertDialog, Button, Chip, Input, Label, ListBox, Radio, RadioGroup, Select, TextField, toast } from "@heroui/react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
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
  { value: "choice", label: "Guest's choice", desc: "Online or at check-in" },
  { value: "pay_now_only", label: "Online", desc: "Required to confirm" },
  { value: "pay_later_only", label: "At check-in", desc: "Collect on arrival" },
];

interface Props {
  initialData: {
    subaccountCode: string | null;
    bankCode: string | null;
    accountNumber: string | null;
    businessName: string | null;
    settlementSchedule: string;
    paymentPolicy: string;
    modeMismatch?: boolean;
    activeMode?: "live" | "test";
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {initialData.modeMismatch && (
        <Alert status="warning" className="rounded-2xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Reconnect your {initialData.activeMode === "live" ? "live" : "test"} payout account</Alert.Title>
            <Alert.Description>
              Online payments are paused until you verify and save a {initialData.activeMode === "live" ? "live" : "test"} account below.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <PenCard>
        <PenCardHead title="When guests pay" />
        <RadioGroup
          aria-label="Payment policy"
          value={policy}
          onChange={(v) => setPolicy(v as PaymentPolicy)}
          isDisabled={savingPolicy}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {POLICY_OPTIONS.map((opt) => (
            <Radio key={opt.value} value={opt.value} className="mt-0">
              <Radio.Content className="group flex h-full w-full items-start gap-3 rounded-2xl border border-border/70 p-4 transition-colors duration-150 data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-ring data-[hovered=true]:border-border data-[selected=true]:border-primary/50 data-[selected=true]:bg-primary/[0.04]">
                <Radio.Control className="mt-px size-5 shrink-0 rounded-full border border-border bg-card shadow-none group-data-[selected=true]:border-transparent group-data-[selected=true]:bg-primary">
                  <Radio.Indicator className="before:rounded-full before:bg-card group-data-[selected=true]:before:scale-[0.4]" />
                </Radio.Control>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{opt.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{opt.desc}</span>
                </span>
              </Radio.Content>
            </Radio>
          ))}
        </RadioGroup>
        {policyDirty && (
          <div className="flex justify-end gap-2">
            <Button variant="tertiary" onPress={() => setPolicy(savedPolicy)} isDisabled={savingPolicy} className="rounded-xl">
              Discard
            </Button>
            <Button variant="primary" isPending={savingPolicy} onPress={savePolicy} className="rounded-xl font-semibold">
              Save
            </Button>
          </div>
        )}
      </PenCard>

      <PenCard>
        <PenCardHead
          title="Payout account"
          actions={connectedNote ? (
            <Chip size="sm" variant="soft" color="success" className="gap-1">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              <Chip.Label>{verified ? "Verified" : "Connected"}</Chip.Label>
            </Chip>
          ) : undefined}
        />
        {connectedNote && <p className="-mt-2 text-sm text-muted-foreground">{connectedNote.replace(/^(Account verified|Connected) — /, "")}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          {banksError ? (
            <div className="flex flex-col gap-1">
              <Label>Bank or mobile money</Label>
              <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-secondary/70 px-3 sm:min-h-10">
                <span className="text-sm text-muted-foreground">Couldn&apos;t load banks</span>
                <Button size="sm" variant="ghost" onPress={loadBanks} isDisabled={banksLoading} className="h-8 rounded-lg">
                  <RefreshCw className={cn("size-4", banksLoading && "animate-spin")} /> Retry
                </Button>
              </div>
            </div>
          ) : (
            <Select
              fullWidth
              value={bankCode || null}
              onChange={(v) => v && changeBank(String(v))}
              isDisabled={banksLoading || verifying || saving}
              placeholder={banksLoading ? "Loading banks…" : "Select bank"}
            >
              <Label>Bank or mobile money</Label>
              <Select.Trigger className="min-h-11 sm:min-h-10">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover className="max-h-72">
                <ListBox>
                  {banks.map((b) => (
                    <ListBox.Item key={b.code} id={b.code} textValue={b.name}>
                      {b.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          )}

          <TextField
            fullWidth
            value={accountNumber}
            onChange={(v) => changeAccountNumber(v.replace(/\D/g, ""))}
            isDisabled={verifying || saving}
          >
            <Label>{isMobileMoney ? "Wallet number" : "Account number"}</Label>
            <Input
              placeholder={isMobileMoney ? "0244000000" : "Account number"}
              inputMode="numeric"
              autoComplete="off"
              maxLength={maxAccountLength}
              className="font-mono"
            />
          </TextField>

          <Button
            variant="secondary"
            onPress={handleVerify}
            isPending={verifying}
            isDisabled={verifying || saving || !bankCode || !accountValid}
            className="rounded-xl font-semibold"
          >
            Verify
          </Button>
        </div>

        {verified && verificationConfirmed && (
          <div className="flex justify-end">
            <Button variant="primary" onPress={handleSave} isPending={saving} isDisabled={saving || !bankCode || !accountNumber} className="rounded-xl font-semibold">
              {isActive ? "Save account" : "Connect account"}
            </Button>
          </div>
        )}
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
          <AlertDialog.Dialog className="rounded-3xl sm:max-w-md">
            <AlertDialog.Header>
              <AlertDialog.Icon status="success" />
              <AlertDialog.Heading className="text-lg font-semibold">Is this the right account?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <dl className="divide-y divide-border/60 rounded-2xl bg-secondary/60 px-4">
                <div className="flex flex-col gap-1 py-3"><dt className="text-xs text-muted-foreground">Account name</dt><dd className="text-sm font-semibold text-foreground">{verified}</dd></div>
                <div className="flex flex-col gap-1 py-3"><dt className="text-xs text-muted-foreground">Account number</dt><dd className="font-mono text-sm font-semibold tracking-wide text-foreground">{accountNumber}</dd></div>
              </dl>
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row">
              <Button slot="close" variant="tertiary" className="rounded-xl" onPress={() => { verificationCloseReason.current = "cancel"; setVerified(null); setVerificationConfirmed(false); }}>No, re-enter</Button>
              {/* Not slot="close": the slot's close runs before this handler, so onOpenChange
                  saw no "confirm" reason and cleared the verification on the first try. */}
              <Button variant="primary" className="rounded-xl font-semibold" onPress={() => { setVerificationConfirmed(true); setVerificationOpen(false); }}>Yes, it&apos;s correct</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
