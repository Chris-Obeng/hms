"use client";

import * as React from "react";
import { Button, Skeleton, Switch, toast } from "@heroui/react";

import { getNotificationPrefs, updateNotificationPrefs } from "@/app/actions/settings";
import { SettingsGroup, SettingsRow } from "../_components/settings-ui";
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
  { key: "new_booking", label: "New bookings" },
  { key: "payment_received", label: "Payments received" },
  { key: "booking_cancelled", label: "Cancellations" },
  { key: "check_in_reminder", label: "Arrivals tomorrow" },
  { key: "check_out_reminder", label: "Departures this morning" },
  { key: "staff_access_request", label: "Staff access requests" },
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
  const [sendingTest, setSendingTest] = React.useState(false);
  const eventPrefsRef = React.useRef<Record<string, boolean>>({});
  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const isMountedRef = React.useRef(false);

  // Guest emails moved to their own tab; keep old "#message-templates" links working.
  React.useEffect(() => {
    if (window.location.hash === "#message-templates") window.location.replace("/dashboard/settings/emails");
  }, []);

  // Load preferences
  React.useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    async function loadPrefs() {
      try {
        const prefsResult = await getNotificationPrefs();

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
      <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading notification settings">
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
            <Skeleton className="h-4 w-24 rounded-md lg:mt-6" />
            <Skeleton className="h-40 w-full rounded-3xl" />
          </div>
        ))}
      </div>
    );
  }

  const pushStatus = iosNeedsInstall
    ? { tone: "default" as const, text: "On iPhone, add RoomLine to your Home Screen first." }
    : !pushSupported
      ? { tone: "default" as const, text: "Not supported in this browser." }
      : notificationPermission === "denied"
        ? { tone: "danger" as const, text: "Blocked in browser settings." }
        : null;

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup title="This device" className="gap-0 py-2 sm:py-2">
        <ul className="divide-y divide-border/60">
          <li className="py-3">
            <SettingsRow label="Sound">
              <Button size="sm" variant="ghost" onPress={() => void playTestSound()} className="rounded-lg text-muted-foreground">
                Test
              </Button>
              <ToggleSwitch label="Notification sound" isSelected={soundEnabled} onChange={toggleSound} />
            </SettingsRow>
          </li>
          <li className="py-3">
            <SettingsRow
              label="Push alerts"
              hint={
                pushStatus ? (
                  <span className={pushStatus.tone === "danger" ? "text-destructive" : undefined}>{pushStatus.text}</span>
                ) : undefined
              }
            >
              {browserAlertsEnabled && (
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => void sendTestPush()}
                  isPending={sendingTest}
                  isDisabled={togglingAlerts}
                  className="rounded-lg text-muted-foreground"
                >
                  Test
                </Button>
              )}
              <ToggleSwitch
                label="Push alerts on this device"
                isSelected={browserAlertsEnabled}
                isDisabled={togglingAlerts || (!pushSupported && !iosNeedsInstall)}
                onChange={() => void toggleBrowserAlerts()}
              />
            </SettingsRow>
          </li>
        </ul>
      </SettingsGroup>

      <SettingsGroup title="Alert me about" className="gap-0 py-2 sm:py-2">
        <ul className="divide-y divide-border/60">
          {EVENT_TYPES.map((event) => (
            <li key={event.key} className="py-3">
              <SettingsRow label={event.label}>
                <ToggleSwitch
                  label={`${event.label} alerts`}
                  isSelected={eventPrefs[event.key] ?? true}
                  isDisabled={savingEvents.has(event.key)}
                  onChange={() => toggleEvent(event.key)}
                />
              </SettingsRow>
            </li>
          ))}
        </ul>
      </SettingsGroup>
    </div>
  );
}

function ToggleSwitch({
  label,
  isSelected,
  isDisabled,
  onChange,
}: {
  label: string;
  isSelected: boolean;
  isDisabled?: boolean;
  onChange: () => void;
}) {
  return (
    <Switch aria-label={label} isSelected={isSelected} isDisabled={isDisabled} onChange={onChange}>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
    </Switch>
  );
}
