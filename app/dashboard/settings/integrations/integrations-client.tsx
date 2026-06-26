"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveBeds24Config, saveArkeselConfig } from "@/app/actions/integrations";

interface Props {
  initialData: {
    beds24PropertyId: string;
    beds24ApiKey: string;
    arkeselApiKey: string;
    arkeselSenderName: string;
    paystackSubaccountCode: string | null;
  };
}

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
      <CheckCircle2 className="size-3.5" /> Connected
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <AlertCircle className="size-3.5" /> Not configured
    </span>
  );
}

export function IntegrationsClient({ initialData }: Props) {
  // Beds24
  const [b24PropertyId, setB24PropertyId] = React.useState(initialData.beds24PropertyId);
  const [b24ApiKey, setB24ApiKey] = React.useState(initialData.beds24ApiKey);
  const [savingB24, setSavingB24] = React.useState(false);

  // Arkesel
  const [arkApiKey, setArkApiKey] = React.useState(initialData.arkeselApiKey);
  const [arkSender, setArkSender] = React.useState(initialData.arkeselSenderName);
  const [savingArk, setSavingArk] = React.useState(false);

  async function handleSaveBeds24() {
    setSavingB24(true);
    const r = await saveBeds24Config(b24PropertyId, b24ApiKey);
    setSavingB24(false);
    if (r.success) toast.success("Beds24 config saved");
    else toast.error(r.error ?? "Failed to save");
  }

  async function handleSaveArkesel() {
    setSavingArk(true);
    const r = await saveArkeselConfig(arkApiKey, arkSender);
    setSavingArk(false);
    if (r.success) toast.success("Arkesel config saved");
    else toast.error(r.error ?? "Failed to save");
  }

  return (
    <div className="space-y-8 max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Third-party service connections</p>
        </div>
      </div>

      {/* ── Beds24 ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Beds24 — OTA Channel Sync</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Syncs availability with Booking.com via Beds24</p>
          </div>
          <StatusBadge connected={!!initialData.beds24PropertyId && !!initialData.beds24ApiKey} />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">API Key</label>
            <Input
              type="password"
              value={b24ApiKey}
              onChange={(e) => setB24ApiKey(e.target.value)}
              placeholder="Beds24 v2 API key"
              className="h-9 rounded-xl font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Property ID</label>
            <Input
              value={b24PropertyId}
              onChange={(e) => setB24PropertyId(e.target.value)}
              placeholder="e.g. 123456"
              className="h-9 rounded-xl"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          Room mapping to Booking.com is done by HotelOS staff during onboarding. Contact support to set this up.
        </p>

        <Button onClick={handleSaveBeds24} disabled={savingB24}
          className="h-9 rounded-xl bg-foreground text-background hover:bg-foreground/90 text-sm">
          {savingB24 ? <Loader2 className="size-3.5 animate-spin mr-2" /> : null}
          {savingB24 ? "Saving…" : "Save Beds24 Config"}
        </Button>
      </section>

      <div className="border-t border-border/40" />

      {/* ── Arkesel ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Arkesel — SMS & Email</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Guest booking confirmations and reminders</p>
          </div>
          <StatusBadge connected={!!initialData.arkeselApiKey} />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">API Key</label>
            <Input
              type="password"
              value={arkApiKey}
              onChange={(e) => setArkApiKey(e.target.value)}
              placeholder="Arkesel API key"
              className="h-9 rounded-xl font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sender Name / ID</label>
            <Input
              value={arkSender}
              onChange={(e) => setArkSender(e.target.value)}
              placeholder="e.g. HotelName"
              className="h-9 rounded-xl"
              maxLength={11}
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1">Max 11 characters. Shown as SMS sender.</p>
          </div>
        </div>

        <Button onClick={handleSaveArkesel} disabled={savingArk}
          className="h-9 rounded-xl bg-foreground text-background hover:bg-foreground/90 text-sm">
          {savingArk ? <Loader2 className="size-3.5 animate-spin mr-2" /> : null}
          {savingArk ? "Saving…" : "Save Arkesel Config"}
        </Button>
      </section>

      <div className="border-t border-border/40" />

      {/* ── Paystack status ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Paystack — Payments</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Online card payments for guest bookings</p>
          </div>
          <StatusBadge connected={!!initialData.paystackSubaccountCode} />
        </div>

        {initialData.paystackSubaccountCode ? (
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs space-y-1">
            <p><span className="text-muted-foreground">Subaccount:</span> <span className="font-mono">{initialData.paystackSubaccountCode}</span></p>
            <p className="text-muted-foreground">Payments are active. Guests can pay online.</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            No bank account configured yet.
          </p>
        )}

        <Link href="/dashboard/settings/payments"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ExternalLink className="size-3" />
          Manage bank account → Payments settings
        </Link>
      </section>
    </div>
  );
}
