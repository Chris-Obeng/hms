"use client";

import * as React from "react";
import { Button, Modal } from "@heroui/react";
import { Plus, Share, Smartphone } from "lucide-react";
import { useFirstInteraction } from "@/hooks/use-first-interaction";
import { usePwaInstall } from "@/hooks/use-pwa-install";

const DISMISS_KEY = "RoomLine_pwa_install_dismissed";
const DISMISS_DAYS = 14;

function wasDismissedRecently(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * The install ask, as an alert-style modal.
 *
 * The anatomy is Apple's alert anatomy on purpose: "alerts display a title,
 * optional informative text, and up to three buttons" (HIG › Alerts › Content),
 * and a modal task should stay "simple, short, and streamlined" (HIG › Modality ›
 * Best practices). It opens on the first interaction rather than on a timer
 * (HIG › Alerts › Best practices) and yields to the notification prompt, because
 * you "never want to display more than one alert at the same time" (HIG ›
 * Modality › Best practices).
 *
 * Buttons are 44 px tall: the minimum comfortable touch target (HIG ›
 * Accessibility › Platform considerations).
 */
export function PwaInstallPrompt({
  claimTurn,
  releaseTurn,
}: {
  claimTurn: () => boolean;
  releaseTurn: () => void;
}) {
  const { isStandalone, isIos, canInstall, promptInstall } = usePwaInstall();
  const [isOpen, setIsOpen] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);

  // iOS Safari fires no install event: the same surface teaches the two taps
  // instead of offering a button that cannot work.
  const showIosSteps = isIos && !canInstall;
  const eligible = !isStandalone && (canInstall || isIos);

  // The browser can fire the event after the user's first interaction (it is
  // only guaranteed around load/navigation), so eligibility alone is not
  // enough: the ask must also wake and re-fire once the signal arrives.
  // Returning `false` declines the shared prompt turn without consuming the
  // hook, so the notification ask keeps its place in line instead of stacking.
  // The eligibility snapshot is recomputed at fire time rather than trusted
  // from render: the deferred prompt arrives through the store and this
  // callback intentionally runs with whatever values are current.
  const eligibleRef = React.useRef(eligible);
  React.useEffect(() => {
    eligibleRef.current = eligible;
  }, [eligible]);

  useFirstInteraction(eligible, () => {
    if (!eligibleRef.current || wasDismissedRecently()) return;
    if (!claimTurn()) return false;
    setIsOpen(true);
  });

  const remember = React.useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage unavailable — the prompt simply reappears, which is acceptable.
    }
  }, []);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {
        releaseTurn();
        remember();
      }
    },
    [releaseTurn, remember]
  );

  const handleInstall = React.useCallback(async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
      // The browser's own prompt is the decision: dismiss the modal either way and
      // start the quiet cooldown, so a refusal is not repeated on the next tap.
      handleOpenChange(false);
    }
  }, [handleOpenChange, promptInstall]);

  if (isStandalone) return null;

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={handleOpenChange} variant="opaque">
      <Modal.Container placement="auto" size="sm">
        <Modal.Dialog className="sm:max-w-[22rem]">
          <Modal.Header>
            <Modal.Icon className="bg-primary/[0.08] text-primary ring-1 ring-primary/15">
              <Smartphone className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Install RoomLine</Modal.Heading>
          </Modal.Header>

          <Modal.Body>
            {showIosSteps ? (
              <p className="text-base leading-relaxed text-muted-foreground">
                Tap <Share aria-hidden className="inline size-4 -mt-0.5" /> Share in Safari&apos;s
                toolbar, then <Plus aria-hidden className="inline size-4 -mt-0.5" /> Add to Home
                Screen.
              </p>
            ) : (
              <p className="text-base leading-relaxed text-muted-foreground">
                Full screen, launches faster, and keeps working offline.
              </p>
            )}
          </Modal.Body>

          <Modal.Footer>
            {showIosSteps ? (
              <Button slot="close" className="min-h-11 h-auto flex-1 rounded-xl text-base font-semibold">
                Got It
              </Button>
            ) : (
              <>
                <Button
                  slot="close"
                  variant="tertiary"
                  className="min-h-11 h-auto flex-1 rounded-xl text-base font-medium"
                >
                  Not Now
                </Button>
                <Button
                  isPending={installing}
                  onPress={handleInstall}
                  className="min-h-11 h-auto flex-1 rounded-xl text-base font-semibold"
                >
                  Install
                </Button>
              </>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
