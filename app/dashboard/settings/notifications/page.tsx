"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, BellRing, Speaker, Volume2, ArrowLeft, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getNotificationPrefs, updateNotificationPrefs } from "@/app/actions/settings";

// ── Event Types ────────────────────────────────────────────────────

const EVENT_TYPES = [
  { key: "new_booking", label: "New Booking", description: "When a new reservation is confirmed" },
  { key: "payment_received", label: "Payment Received", description: "When a payment is successfully processed" },
  { key: "booking_cancelled", label: "Booking Cancelled", description: "When a reservation is cancelled" },
  { key: "ota_conflict", label: "OTA Sync Conflict", description: "When a Booking.com booking conflicts with a direct one" },
  { key: "check_in_reminder", label: "Check-In Reminder", description: "Day-before arrival reminder" },
  { key: "check_out_reminder", label: "Check-Out Reminder", description: "Morning-of departure reminder" },
  { key: "staff_access_request", label: "Staff Access Request", description: "When a staff member requests access" },
] as const;

// ── Toggle Switch ──────────────────────────────────────────────────

function Toggle({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        enabled ? "bg-foreground" : "bg-muted"
      )}
      aria-label={label}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-5 rounded-full bg-background shadow ring-0 transition-transform",
          enabled ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────

export default function NotificationSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const [eventPrefs, setEventPrefs] = React.useState<Record<string, boolean>>({});

  // Load preferences
  React.useEffect(() => {
    async function loadPrefs() {
      try {
        const result = await getNotificationPrefs();
        if (result.success) {
          const prefs = result.data;
          setEventPrefs(prefs);
        }
      } catch {
        // Default to all enabled
        const defaults: Record<string, boolean> = {};
        EVENT_TYPES.forEach((evt) => {
          defaults[evt.key] = true;
        });
        setEventPrefs(defaults);
      } finally {
        setLoading(false);
      }
    }
    loadPrefs();

    // Load sound preference from localStorage
    const sound = localStorage.getItem("hotelos_sound_enabled");
    if (sound !== null) {
      setSoundEnabled(sound === "true");
    }
  }, []);

  // Toggle event preference
  const toggleEvent = (key: string) => {
    setEventPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Toggle sound
  const toggleSound = () => {
    const newVal = !soundEnabled;
    setSoundEnabled(newVal);
    localStorage.setItem("hotelos_sound_enabled", String(newVal));
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
      toast.error("Could not play test sound");
    }
  };

  // Save all preferences
  const handleSave = async () => {
    setSaving(true);
    const result = await updateNotificationPrefs(eventPrefs);
    setSaving(false);
    if (result.success) {
      toast.success("Notification preferences saved");
    } else {
      toast.error(result.error || "Failed to save preferences");
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
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
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
            <Toggle enabled={soundEnabled} onChange={toggleSound} label="Toggle notification sound" />
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
                <Toggle
                  enabled={eventPrefs[event.key] ?? true}
                  onChange={() => toggleEvent(event.key)}
                  label={`Toggle ${event.label}`}
                />
              </div>
              {index < EVENT_TYPES.length - 1 && <Separator className="opacity-30" />}
            </React.Fragment>
          ))}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center justify-end pb-8">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90"
        >
          {saving ? "Saving..." : "Save Preferences"}
        </Button>
      </div>
    </div>
  );
}
