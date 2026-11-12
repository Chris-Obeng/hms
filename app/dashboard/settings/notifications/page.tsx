"use client";

import * as React from "react";
import { toast } from "@heroui/react";
import {
  Bell,
  BellRing,
  Speaker,
  Volume2,
  MessageSquareText,
  Monitor,
  Smartphone,
  Info,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getNotificationPrefs, updateNotificationPrefs } from "@/app/actions/settings";
import { getNotificationTemplates } from "@/app/actions/notification-templates";
import { NotificationTemplatesClient } from "./templates-client";
import type {
  NotificationEventType,
  NotificationTemplate,
} from "@/lib/notification-templates";
import {
  disableWebPush,
  enableWebPush,
  getSafeNotificationPermission,
  isIosNonStandaloneBrowser,
  isWebPushSupported,
  syncPushSubscriptionStatus,
} from "@/lib/push";
import { sendTestPushAction } from "@/app/actions/push-test";

// ── Event Types ────────────────────────────────────────────────────

const EVENT_TYPES = [
  { key: "new_booking", label: "New Booking", description: "When a new reservation is confirmed" },
  { key: "payment_received", label: "Payment Received", description: "When a payment is successfully processed" },
  { key: "booking_cancelled", label: "Booking Cancelled", description: "When a reservation is cancelled" },
  { key: "check_in_reminder", label: "Check-In Reminder", description: "Day-before arrival reminder" },
  { key: "check_out_reminder", label: "Check-Out Reminder", description: "Morning-of departure reminder" },
  { key: "staff_access_request", label: "Staff Access Request", description: "When a staff member joins or requests access" },
] as const;

// ── Main Component ────────────────────────────────────────────────

export default function NotificationSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const [pushSupported, setPushSupported] = React.useState(true);
  const [iosNeedsInstall, setIosNeedsInstall] = React.useState(false);
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = React.useState(false);
  const [togglingAlerts, setTogglingAlerts] = React.useState(false);
  const [currentStaffId, setCurrentStaffId] = React.useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] =
    React.useState<NotificationPermission>("default");
  const [eventPrefs, setEventPrefs] = React.useState<Record<string, boolean>>({});
  const [savingEvents, setSavingEvents] = React.useState<Set<string>>(() => new Set());
  const [notifTemplates, setNotifTemplates] = React.useState<
    Record<NotificationEventType, NotificationTemplate> | null
  >(null);
  const [sendingTest, setSendingTest] = React.useState(false);
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
          EVENT_TYPES.forEach((evt) => {
            defaults[evt.key] = true;
          });
          setEventPrefs(defaults);
          eventPrefsRef.current = defaults;
        }

        if (templatesResult.success) {
          setNotifTemplates(templatesResult.data);
        }
      } catch {
        if (cancelled) return;
        const defaults: Record<string, boolean> = {};
        EVENT_TYPES.forEach((evt) => {
          defaults[evt.key] = true;
        });
        setEventPrefs(defaults);
        eventPrefsRef.current = defaults;
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPrefs();

    const deviceSetup = window.setTimeout(() => {
      try {
        const sound = localStorage.getItem("RoomLine_sound_enabled");
        if (sound !== null) {
          setSoundEnabled(sound === "true");
        }
      } catch {
        // Ignore storage read errors
      }

      setPushSupported(isWebPushSupported());
      setIosNeedsInstall(isIosNonStandaloneBrowser());
      setNotificationPermission(getSafeNotificationPermission());

      void syncPushSubscriptionStatus().then((status) => {
        if (!isMountedRef.current) return;
        setPushSupported(status.supported);
        setIosNeedsInstall(status.iosNeedsInstall);
        setNotificationPermission(status.permission);
        setBrowserAlertsEnabled(status.active);
        if (status.staffId) setCurrentStaffId(status.staffId);
      });
    }, 0);

    return () => {
      window.clearTimeout(deviceSetup);
      cancelled = true;
      isMountedRef.current = false;
    };
  }, []);

  // Toggle event preference with isolated queue + rollback on error
  const toggleEvent = (key: string) => {
    const previousValue = eventPrefsRef.current[key] ?? true;
    const nextPrefs = {
      ...eventPrefsRef.current,
      [key]: !previousValue,
    };

    eventPrefsRef.current = nextPrefs;
    setEventPrefs(nextPrefs);
    setSavingEvents((current) => new Set(current).add(key));

    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        try {
          const result = await updateNotificationPrefs(eventPrefsRef.current);
          if (!isMountedRef.current) return;

          if (!result.success) {
            const reverted = { ...eventPrefsRef.current, [key]: previousValue };
            eventPrefsRef.current = reverted;
            setEventPrefs(reverted);
            toast.danger(result.error || "Failed to save notification preference");
          }
        } catch {
          if (!isMountedRef.current) return;
          const reverted = { ...eventPrefsRef.current, [key]: previousValue };
          eventPrefsRef.current = reverted;
          setEventPrefs(reverted);
          toast.danger("Failed to save notification preference");
        } finally {
          if (isMountedRef.current) {
            setSavingEvents((current) => {
              const next = new Set(current);
              next.delete(key);
              return next;
            });
          }
        }
      })
      .catch(() => {});
  };

  // Toggle sound
  const toggleSound = () => {
    const newVal = !soundEnabled;
    setSoundEnabled(newVal);
    try {
      localStorage.setItem("RoomLine_sound_enabled", String(newVal));
    } catch {
      // Ignore storage write errors
    }
  };

  // Toggle browser push alerts
  const toggleBrowserAlerts = async () => {
    if (typeof window === "undefined" || togglingAlerts) return;
    setTogglingAlerts(true);
    try {
      if (browserAlertsEnabled) {
        await disableWebPush(currentStaffId);
        setBrowserAlertsEnabled(false);
        setNotificationPermission(getSafeNotificationPermission());
        toast.success("Push alerts disabled on this device");
      } else {
        const { staffId } = await enableWebPush();
        if (staffId) setCurrentStaffId(staffId);
        setBrowserAlertsEnabled(true);
        setNotificationPermission(getSafeNotificationPermission());
        toast.success("Background push alerts enabled");
      }
    } catch (error) {
      setNotificationPermission(getSafeNotificationPermission());
      toast.danger(
        error instanceof Error ? error.message : "Could not update push alerts"
      );
    } finally {
      if (isMountedRef.current) {
        setTogglingAlerts(false);
      }
    }
  };

  // Send a test notification through the real delivery pipeline
  const sendTestPush = async () => {
    setSendingTest(true);
    try {
      const result = await sendTestPushAction();
      if (result.success) {
        toast.success("Test sent — check for a browser push alert");
      } else {
        toast.danger(result.error || "Could not send test notification");
      }
    } finally {
      setSendingTest(false);
    }
  };

  // Play the real front-desk chime (/audio/chime.mp3), with clean AudioContext fallback
  const playTestSound = async () => {
    try {
      const audio = new Audio("/audio/chime.mp3");
      audio.volume = 0.5;
      await audio.play();
      toast.success("Test chime played");
    } catch {
      try {
        const audioCtx = new AudioContext();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = 800;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.45);
        oscillator.onended = () => {
          void audioCtx.close().catch(() => {});
        };
        toast.success("Test chime played");
      } catch {
        toast.danger("Could not play test sound");
      }
    }
  };

  if (loading) {
    return (
      <div
        className="space-y-6 max-w-lg"
        aria-busy="true"
        aria-label="Loading notification settings"
      >
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Sound Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Volume2 className="size-4" />
            Notification Sound
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            Play a chime when new updates arrive. Sound preference is saved to this device only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Speaker className="size-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Enable sound</span>
            </div>
            <Switch
              checked={soundEnabled}
              onCheckedChange={toggleSound}
              size="lg"
              aria-label="Enable notification sound"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg text-xs h-8"
            onClick={() => void playTestSound()}
          >
            Test Sound
          </Button>
        </CardContent>
      </Card>

      {/* Device Alerts (Desktop & Phone) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Monitor className="size-4" />
            Device Alerts
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            Get booking and payment pop-up alerts on this computer or phone, even when RoomLine is closed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="size-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Alerts on this device</span>
            </div>
            <Switch
              checked={browserAlertsEnabled}
              onCheckedChange={() => void toggleBrowserAlerts()}
              isDisabled={togglingAlerts || (!pushSupported && !iosNeedsInstall)}
              size="lg"
              aria-label="Alerts on this device"
            />
          </div>

          <div className="rounded-xl bg-muted/30 border border-border/40 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground font-medium">
              <Info className="size-4" />
              <span>Alert Status</span>
            </div>
            <p className="text-muted-foreground/80 pl-5">
              Status:{" "}
              <span className="font-semibold text-foreground">
                {iosNeedsInstall
                  ? "Add to Home Screen required"
                  : !pushSupported
                    ? "Not supported in this browser"
                    : notificationPermission === "granted" && browserAlertsEnabled
                      ? "On for this device"
                      : notificationPermission === "denied"
                        ? "Blocked in browser settings"
                        : "Off on this device"}
              </span>
            </p>
            {iosNeedsInstall && (
              <p className="text-muted-foreground pl-5 leading-normal">
                On iPhone or iPad, tap Share in Safari and choose &ldquo;Add to Home Screen&rdquo;, then open RoomLine from your Home Screen to turn on device alerts.
              </p>
            )}
            {!iosNeedsInstall && notificationPermission === "denied" && (
              <p className="text-destructive/80 pl-5 leading-normal">
                Alerts are blocked by your browser. Click the site settings icon next to the address bar and allow notifications to turn them back on.
              </p>
            )}
            {notificationPermission === "granted" && browserAlertsEnabled && (
              <p className="text-emerald-700 pl-5 leading-normal">
                You&apos;ll receive instant booking and payment alerts for your account here, even when the dashboard tab is closed.
              </p>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="rounded-lg text-xs h-8"
            onClick={() => void sendTestPush()}
            disabled={!browserAlertsEnabled || sendingTest || togglingAlerts}
          >
            {sendingTest ? "Sending..." : "Send Test Alert"}
          </Button>
        </CardContent>
      </Card>

      {/* Event Type Toggles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BellRing className="size-4" />
            Notification Types
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            Toggle which events trigger notifications. These preferences sync across all your devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {EVENT_TYPES.map((event, index) => (
            <React.Fragment key={event.key}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Bell className="size-4 text-muted-foreground/60 shrink-0" />
                    <span className="text-sm font-medium text-foreground">
                      {event.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/70 mt-1 pl-6">
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
              <MessageSquareText className="size-4" />
              Message Templates
            </CardTitle>
            <CardDescription className="text-xs mt-1">
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
