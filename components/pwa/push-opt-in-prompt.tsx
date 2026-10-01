"use client";

import * as React from "react";
import { Button, Modal, toast } from "@heroui/react";
import { BellRing } from "lucide-react";
import { useFirstInteraction } from "@/hooks/use-first-interaction";
import { enableWebPush } from "@/lib/push";

const DISMISS_KEY = "RoomLine_push_prompt_dismissed_at";
const COOLDOWN_DAYS = 7;

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - new Date(raw).getTime() < COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

/**
 * The push opt-in, as an alert-style modal — deliberately the same anatomy as the
 * install ask so the two read as one system: one soft icon, one title, one
 * sentence of purpose, two actions (HIG › Alerts › Content).
 *
 * Staff never find the settings toggle on their own and no push can arrive
 * without a subscription, so the ask exists — but Apple asks that access be
 * requested only when it is clearly needed and after interest is shown (HIG ›
 * Privacy › Requesting permission), and that two modal asks never share the
 * screen (HIG › Modality › Best practices). Hence: first interaction, and
 * `paused` while the install prompt is open.
 *
 * Actions are 44 px tall, the minimum comfortable touch target (HIG ›
 * Accessibility › Platform considerations).
 */
export function PushOptInPrompt({
  claimTurn,
  releaseTurn,
}: {
  claimTurn: () => boolean;
  releaseTurn: () => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Same turn as the install ask above: request, support and cooldown decide
  // eligibility, but only the shared turn decides who opens — so a late
  // install signal still takes its place first instead of stacking.
  // Returning `false` declines without consuming the hook, so push waits for
  // the next interaction rather than missing its turn.
  useFirstInteraction(true, () => {
    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported || Notification.permission !== "default" || recentlyDismissed()) return;
    if (!claimTurn()) return false;
    setIsOpen(true);
  });

  const handleOpenChange = React.useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      releaseTurn();
      try {
        localStorage.setItem(DISMISS_KEY, new Date().toISOString());
      } catch {
        // Storage unavailable — the prompt simply reappears next visit.
      }
    }
  }, [releaseTurn]);

  // A successful enable must hand the turn back: `setIsOpen(false)` alone does
  // not run the shared close path above, so the partner prompt would otherwise
  // sit declined forever. Permission is no longer "default" afterwards, so
  // this prompt never asks again anyway — but it must not wedge the other one.
  // (HeroUI closes through `onOpenChange`, which does release the turn; this
  // is only the programmatic-dismiss path.)
  const releaseTurnRef = React.useRef(releaseTurn);
  React.useEffect(() => {
    releaseTurnRef.current = releaseTurn;
  }, [releaseTurn]);

  const enable = React.useCallback(async () => {
    setBusy(true);
    try {
      await enableWebPush();
      // Granted (or subscribed): the permission is no longer "default", so this
      // never asks again and no cooldown is needed.
      setIsOpen(false);
      releaseTurnRef.current();
      toast.success("Notifications on");
    } catch (error) {
      // Left open on purpose: a retry is legitimate, and the toast carries the
      // reason rather than burying it in the modal.
      toast.danger(error instanceof Error ? error.message : "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={handleOpenChange} variant="opaque">
      <Modal.Container placement="auto" size="sm">
        <Modal.Dialog className="sm:max-w-[22rem]">
          <Modal.Header>
            <Modal.Icon className="bg-primary/[0.08] text-primary ring-1 ring-primary/15">
              <BellRing className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Turn On Notifications</Modal.Heading>
          </Modal.Header>

          <Modal.Body>
            <p className="text-base leading-relaxed text-muted-foreground">
              Booking and payment alerts on this device, even when RoomLine is closed.
            </p>
          </Modal.Body>

          <Modal.Footer>
            <Button
              slot="close"
              variant="tertiary"
              className="min-h-11 h-auto flex-1 rounded-xl text-base font-medium"
            >
              Not Now
            </Button>
            <Button
              isPending={busy}
              onPress={enable}
              className="min-h-11 h-auto flex-1 rounded-xl text-base font-semibold"
            >
              Enable
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
