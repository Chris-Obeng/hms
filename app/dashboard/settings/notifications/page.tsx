"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "@heroui/react";
import { Bell, BellRing, Speaker, Volume2, ArrowLeft, Loader2, MessageSquareText, Monitor, Smartphone, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getNotificationPrefs, updateNotificationPrefs } from "@/app/actions/settings";
import { getNotificationTemplates } from "@/app/actions/notification-templates";
import { NotificationTemplatesClient } from "./templates-client";
import type { NotificationEventType, NotificationTemplate } from "@/lib/notification-templates";

// ── Event Types ────────────────────────────────────────────────────

const EVENT_TYPES = [
  { key: "new_booking", label: "New Booking", description: "When a new reservation is confirmed" },
  { key: "payment_received", label: "Payment Received", description: "When a payment is successfully processed" },
  { key: "booking_cancelled", label: "Booking Cancelled", description: "When a reservation is cancelled" },
  { key: "check_in_reminder", label: "Check-In Reminder", description: "Day-before arrival reminder" },
  { key: "check_out_reminder", label: "Check-Out Reminder", description: "Morning-of departure reminder" },
  { key: "staff_access_request", label: "Staff Access Request", description: "When a staff member requests access" },
] as const;

// ── Main Component ────────────────────────────────────────────────

export default function NotificationSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = React.useState(false);
  const [notificationPermission, setNotificationPermission] = React.useState<NotificationPermission>("default");
  const [eventPrefs, setEventPrefs] = React.useState<Record<string, boolean>>({});
  const [savingEvents, setSavingEvents] = React.useState<Set<string>>(() => new Set());
  const [notifTemplates, setNotifTemplates] = React.useState<Record<NotificationEventType, NotificationTemplate> | null>(null);
  const eventPrefsRef = React.useRef<Record<string, boolean>>({});
  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const isMountedRef = React.useRef(false);

  // Load preferences
  React.useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    async function loadPrefs() {
      try {
        const [prefsResult, templatesResult] = await Promise.all([
          getNotificationPrefs(),
          getNotificationTemplates(),
        ]);

        if (cancelled) return;

        if (prefsResult.success) {
          setEventPrefs(prefsResult.data);
          eventPrefsRef.current = prefsResult.data;
        } else {
          const defaults: Record<string, boolean> = {};
          EVENT_TYPES.forEach((evt) => { defaults[evt.key] = true; });
          setEventPrefs(defaults);
          eventPrefsRef.current = defaults;
        }

        if (templatesResult.success) {
          setNotifTemplates(templatesResult.data);
        }
      } catch {
        if (cancelled) return;
        const defaults: Record<string, boolean> = {};
        EVENT_TYPES.forEach((evt) => { defaults[evt.key] = true; });
        setEventPrefs(defaults);
        eventPrefsRef.current = defaults;
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadPrefs();

    // Load sound preference from localStorage
    const sound = localStorage.getItem("RoomLine_sound_enabled");
    if (sound !== null) {
      setSoundEnabled(sound === "true");
    }

    // Load browser push preference & permission state
    if (typeof window !== "undefined") {
      setNotificationPermission(Notification.permission);
      const alerts = localStorage.getItem("RoomLine_browser_notifications_enabled") === "true";
      setBrowserAlertsEnabled(alerts && Notification.permission === "granted");
    }

    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, []);

  // Toggle event preference
  const toggleEvent = (key: string) => {
    const previousValue = eventPrefsRef.current[key] ?? true;
    const nextPrefs = {
      ...eventPrefsRef.current,
      [key]: !previousValue,
    };

    eventPrefsRef.current = nextPrefs;
    setEventPrefs(nextPrefs);
    setSavingEvents((current) => new Set(current).add(key));

    saveQueueRef.current = saveQueueRef.current.then(async () => {
      const result = await updateNotificationPrefs(eventPrefsRef.current);

      if (!isMountedRef.current) return;

      setSavingEvents((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });

      if (!result.success) {
        toast.danger(result.error || "Failed to save notification preference");
      }
    });
  };

  // Toggle sound
  const toggleSound = () => {
    const newVal = !soundEnabled;
    setSoundEnabled(newVal);
    localStorage.setItem("RoomLine_sound_enabled", String(newVal));
  };

  // Toggle browser push alerts
  const toggleBrowserAlerts = async () => {
    if (typeof window === "undefined") return;

    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        localStorage.setItem("RoomLine_browser_notifications_enabled", "true");
        setBrowserAlertsEnabled(true);
        toast.success("Browser notifications authorized!");
      } else {
        localStorage.setItem("RoomLine_browser_notifications_enabled", "false");
        setBrowserAlertsEnabled(false);
        toast.danger("Notification permission denied");
      }
    } else if (Notification.permission === "denied") {
      toast.danger("Alerts are blocked. Please reset site permissions in your browser address bar.");
    } else {
      const newVal = !browserAlertsEnabled;
      setBrowserAlertsEnabled(newVal);
      localStorage.setItem("RoomLine_browser_notifications_enabled", String(newVal));
      if (newVal) {
        toast.success("Browser alerts enabled");
      } else {
        toast.success("Browser alerts disabled");
      }
    }
  };

  // Test sound
  const playTestSound = () => {
    try {
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
      toast.success("Test sound played");
    } catch {
      toast.danger("Could not play test sound");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-page-title text-foreground">
            Notifications
          </h1>
          <p className="text-body text-muted-foreground mt-0.5">
            Control what notifications you receive
          </p>
        </div>
      </div>

      {/* Sound Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Volume2 className="size-3.5" />
            Notification Sound
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Play a chime when new bookings arrive. Sound preference is saved to this device only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Speaker className="size-3.5 text-muted-foreground" />
              <span className="text-sm text-foreground">Enable sound</span>
            </div>
            <Switch checked={soundEnabled} onCheckedChange={toggleSound} size="lg" />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg text-xs h-8"
            onClick={playTestSound}
          >
            Test Sound
          </Button>
        </CardContent>
      </Card>

      {/* Browser Alerts & PWA Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Monitor className="size-3.5" />
            Browser & PWA Alerts
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Receive desktop and mobile background notifications. Fully compatible with PWA features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Smartphone className="size-3.5 text-muted-foreground" />
              <span className="text-sm text-foreground">Browser alerts</span>
            </div>
            <Switch checked={browserAlertsEnabled} onCheckedChange={toggleBrowserAlerts} size="lg" />
          </div>

          <div className="rounded-xl bg-muted/30 border border-border/40 p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <Info className="size-3.5" />
              <span>Notification Status</span>
            </div>
            <p className="text-muted-foreground/80 pl-5">
              Permission status:{" "}
              <span className="font-semibold capitalize text-foreground">
                {notificationPermission}
              </span>
            </p>
            {notificationPermission === "denied" && (
              <p className="text-destructive/80 pl-5 leading-normal">
                Browser alerts are blocked. Click the lock/settings icon next to the site URL to reset.
              </p>
            )}
            {notificationPermission === "granted" && browserAlertsEnabled && (
              <p className="text-emerald-700 dark:text-emerald-400 pl-5 leading-normal">
                Real-time alerts active. Keep the dashboard open, or install it as a PWA, to receive them.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Event Type Toggles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BellRing className="size-3.5" />
            Notification Types
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Toggle which events trigger notifications. These preferences sync across all your devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {EVENT_TYPES.map((event, index) => (
            <React.Fragment key={event.key}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Bell className="size-3.5 text-muted-foreground/60 shrink-0" />
                    <span className="text-sm font-medium text-foreground">{event.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground/70 mt-0.5 pl-6">
                    {event.description}
                  </p>
                </div>
                <Switch
                  checked={eventPrefs[event.key] ?? true}
                  onCheckedChange={() => toggleEvent(event.key)}
                  isDisabled={savingEvents.has(event.key)}
                  size="lg"
                  aria-label={`${event.label} notifications`}
                />
              </div>
              {index < EVENT_TYPES.length - 1 && <Separator className="opacity-30" />}
            </React.Fragment>
          ))}
        </CardContent>
      </Card>

      {/* Message Templates */}
      {notifTemplates && (
        <Card id="message-templates" className="scroll-mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquareText className="size-3.5" />
              Message Templates
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Customize transactional emails sent to guests. Click a card to edit and use variables for booking details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationTemplatesClient initialTemplates={notifTemplates} />
          </CardContent>
        </Card>
      )}

    </div>
  );
}
