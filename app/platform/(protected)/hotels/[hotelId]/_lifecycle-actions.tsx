"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button, toast } from "@heroui/react";
import { setHotelStatus, type LifecycleAction } from "../../_actions";

const ACTION_COPY: Record<
  LifecycleAction,
  { title: string; body: (name: string) => string; confirm: string; variant: "primary" | "danger" }
> = {
  approve: {
    title: "Approve hotel?",
    body: (n) =>
      `${n} will become active. Its booking page can immediately receive live reservations and payments. This action is recorded in the platform audit trail.`,
    confirm: "Approve hotel",
    variant: "primary",
  },
  suspend: {
    title: "Suspend hotel?",
    body: (n) =>
      `${n} will become suspended and can no longer take bookings until reactivated. Existing reservations are preserved. This action is recorded in the platform audit trail.`,
    confirm: "Suspend hotel",
    variant: "danger",
  },
  reactivate: {
    title: "Reactivate hotel?",
    body: (n) =>
      `${n} will become active again and resume taking bookings. This action is recorded in the platform audit trail.`,
    confirm: "Reactivate hotel",
    variant: "primary",
  },
};

function lifecycleFor(status: string | null): LifecycleAction | null {
  if (status === "pending") return "approve";
  if (status === "active") return "suspend";
  if (status === "suspended") return "reactivate";
  return null;
}

/** Gated status transition for one hotel, driven by its current status.
 *  Refreshes the server component on success so the page reflects the change. */
export function HotelLifecycleActions({
  hotelId,
  hotelName,
  status,
}: {
  hotelId: string;
  hotelName: string;
  status: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [acting, setActing] = React.useState(false);

  const action = lifecycleFor(status);
  if (!action) return null;
  const copy = ACTION_COPY[action];

  async function run() {
    setActing(true);
    try {
      const result = await setHotelStatus(hotelId, action!);
      if (result.success) {
        toast.success(
          action === "approve"
            ? "Hotel approved"
            : action === "suspend"
              ? "Hotel suspended"
              : "Hotel reactivated"
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.danger(result.error ?? "Action failed");
      }
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="shrink-0">
      <Button
        variant={copy.variant}
        onPress={() => setOpen(true)}
        isDisabled={acting}
        className="min-h-11"
      >
        {copy.confirm}
      </Button>
      <AlertDialog.Backdrop
        isOpen={open}
        onOpenChange={(o) => {
          if (!o) setOpen(false);
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog aria-labelledby="lifecycle-heading">
            <AlertDialog.Header>
              <AlertDialog.Icon status={copy.variant === "danger" ? "danger" : "success"} />
              <AlertDialog.Heading id="lifecycle-heading">{copy.title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{copy.body(hotelName)}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" className="min-h-11" isDisabled={acting}>
                Cancel
              </Button>
              <Button
                slot="close"
                variant={copy.variant}
                onPress={run}
                isPending={acting}
                className="min-h-11"
              >
                {copy.confirm}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
