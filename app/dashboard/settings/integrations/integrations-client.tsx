"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, AlertCircle, Loader2,
  ExternalLink, RefreshCw, Wifi, Bell, BellOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  saveBeds24Config,
  testBeds24,
  forceBeds24Sync,
  testArkeselSms,
  toggleHotelNotifications,
} from "@/app/actions/integrations";

interface Props {
  initialData: {
    beds24PropertyId: string;
    beds24ApiKey: string;
    paystackSubaccountCode: string | null;
    lastSyncAt: string | null;
    notificationsEnabled: boolean;
  };
  staffPhone: string | null;
  hotelName: string;
}

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="size-3" /> Connected
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/40 border border-border/50 px-2 py-0.5 rounded-full">
      <AlertCircle className="size-3" /> Not configured
    </span>
  );
}

export function IntegrationsClient({ initialData, staffPhone, hotelName }: Props) {
  // ── Beds24 ────────────────────────────────────────────────────
  const [b24PropertyId, setB24PropertyId] = React.useState(initialData.beds24PropertyId);
  const [b24ApiKey, setB24ApiKey] = React.useState(initialData.beds24ApiKey);
  const [savingB24, setSavingB24] = React.useState(false);
  const [testingB24, setTestingB24] = React.useState(false);
  const [syncingB24, setSyncingB24] = React.useState(false);

  // ── Notifications ─────────────────────────────────────────────
  const [notificationsOn, setNotificationsOn] = React.useState(initialData.notificationsEnabled);
  const [togglingNotif, setTogglingNotif] = React.useState(false);
  const [testPhone, setTestPhone] = React.useState(staffPhone ?? "");
  const [testingNotif, setTestingNotif] = React.useState(false);

  // ── Beds24 handlers ───────────────────────────────────────────
  async function handleSaveBeds24() {
    setSavingB24(true);
    const r = await saveBeds24Config(b24PropertyId, b24ApiKey);
    setSavingB24(false);
    r.success ? toast.success("Beds24 config saved") : toast.error(r.error ?? "Failed to save");
  }

  async function handleTestBeds24() {
    if (!b24ApiKey) { toast.error("Enter an API key first"); return; }
    setTestingB24(true);
    const r = await testBeds24(b24ApiKey);
    setTestingB24(false);
    r.success
      ? toast.success(`Connected — ${r.propertyCount} propert${r.propertyCount === 1 ? "y" : "ies"} found`)
      : toast.error(`Connection failed: ${r.error}`);
  }

  async function handleForceSync() {
    setSyncingB24(true);
    const r = await forceBeds24Sync();
    setSyncingB24(false);
    r.success
      ? toast.success("message" in r ? r.message : "Sync complete")
      : toast.error(r.error ?? "Sync failed");
  }

  // ── Notification handlers ─────────────────────────────────────
  async function handleToggleNotifications(val: boolean) {
    setTogglingNotif(true);
    const r = await toggleHotelNotifications(val);
    setTogglingNotif(false);
    if (r.success) {
      setNotificationsOn(val);
      toast.success(val ? "Guest notifications enabled" : "Guest notifications disabled");
    } else {
      toast.error(r.error ?? "Failed to update");
    }
  }

  async function handleTestNotification() {
    if (!testPhone) { toast.error("Enter a phone number"); return; }
    setTestingNotif(true);
    const r = await testArkeselSms(testPhone, hotelName);
    setTestingNotif(false);
    r.success ? toast.success("Test SMS sent!") : toast.error(`Failed: ${r.error}`);
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
          <p className="text-xs text-muted-foreground mt-0.5">Channel sync and guest notifications</p>
        </div>
      </div>

      {/* ── Guest SMS & Email Notifications ───────────────────── */}
      <section className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Guest SMS & Email Notifications</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Booking confirmations, reminders, and payment receipts sent to guests
            </p>
          </div>
          {togglingNotif
            ? <Loader2 className="size-4 animate-spin text-muted-foreground" />
            : (
              <Switch
                size="lg"
                checked={notificationsOn}
                onCheckedChange={handleToggleNotifications}
                aria-label="Toggle guest notifications"
              />
            )
          }
        </div>

        {notificationsOn && (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Powered by HotelOS.</span>{" "}
              SMS and email are sent from our shared account using your hotel name as the sender.
              Guests see <span className="font-mono bg-muted px-1 rounded text-[11px]">{hotelName.slice(0, 11)}</span> as the sender.
            </p>
            <div className="flex gap-2 items-end pt-1">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Test phone number
                </label>
                <Input
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+233XXXXXXXXX"
                  className="h-8 rounded-lg text-xs"
                />
              </div>
              <Button
                onClick={handleTestNotification}
                disabled={testingNotif}
                variant="outline"
                size="sm"
                className="h-8 rounded-lg text-xs gap-1.5 shrink-0"
              >
                {testingNotif ? <Loader2 className="size-3 animate-spin" /> : <Bell className="size-3" />}
                {testingNotif ? "Sending…" : "Send Test SMS"}
              </Button>
            </div>
          </div>
        )}

        {!notificationsOn && (
          <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
            <BellOff className="size-3 inline-block mr-1" />
            Guests will not receive any SMS or email notifications while this is off.
          </p>
        )}
      </section>

      {/* ── Beds24 — OTA Channel Sync ──────────────────────────── */}
      <section className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Beds24 — OTA Channel Sync</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Syncs availability with Booking.com · Growth &amp; Pro plans only
            </p>
          </div>
          <StatusBadge connected={!!initialData.beds24PropertyId && !!initialData.beds24ApiKey} />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">API Token</label>
            <Input
              type="password"
              value={b24ApiKey}
              onChange={(e) => setB24ApiKey(e.target.value)}
              placeholder="Beds24 long-life token"
              className="h-9 rounded-xl font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Property ID</label>
            <Input
              value={b24PropertyId}
              onChange={(e) => setB24PropertyId(e.target.value)}
              placeholder="e.g. 123456"
              className="h-9 rounded-xl"
            />
          </div>
        </div>

        {initialData.lastSyncAt && (
          <p className="text-[11px] text-muted-foreground">
            Last sync: {new Date(initialData.lastSyncAt).toLocaleString()}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSaveBeds24} disabled={savingB24} size="sm"
            className="h-8 rounded-lg bg-foreground text-background hover:bg-foreground/90 text-xs">
            {savingB24 ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
            {savingB24 ? "Saving…" : "Save Config"}
          </Button>
          <Button onClick={handleTestBeds24} disabled={testingB24} variant="outline" size="sm"
            className="h-8 rounded-lg text-xs gap-1.5">
            {testingB24 ? <Loader2 className="size-3 animate-spin" /> : <Wifi className="size-3" />}
            {testingB24 ? "Testing…" : "Test Connection"}
          </Button>
          <Button onClick={handleForceSync} disabled={syncingB24 || !initialData.beds24PropertyId} variant="outline" size="sm"
            className="h-8 rounded-lg text-xs gap-1.5">
            {syncingB24 ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            {syncingB24 ? "Syncing…" : "Force Full Sync"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          Room mapping to Booking.com is done by HotelOS staff during onboarding.{" "}
          <a href="mailto:support@hotelosprp.com" className="underline">Contact support</a> to set this up.
        </p>
      </section>

      {/* ── Paystack ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Paystack — Online Payments</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Guest online card payments for bookings
            </p>
          </div>
          <StatusBadge connected={!!initialData.paystackSubaccountCode} />
        </div>

        {initialData.paystackSubaccountCode ? (
          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-xs space-y-0.5">
            <p><span className="text-muted-foreground">Subaccount:</span>{" "}
              <span className="font-mono">{initialData.paystackSubaccountCode}</span></p>
            <p className="text-muted-foreground">Online payments are active.</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            No bank account configured. Set up payments to accept online card payments.
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
