"use client";

import * as React from "react";
import { AlertDialog, Button, Radio, RadioGroup, Skeleton } from "@heroui/react";
import { CalendarClock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { previewEarlyCheckout } from "@/app/dashboard/actions";
import type { EarlyDeparturePolicy } from "@/lib/bookings/early-departure";
import { formatCurrency, formatDate } from "@/lib/format";

export interface EarlyCheckoutTarget {
  id: string;
  guestName: string;
  checkOut: string;
}

/**
 * Confirms an early check-out and asks what happens to the nights the guest
 * didn't use. The stay always ends today; the choice is only about the bill.
 * The hotel's setting is preselected (Settings › Hotel › Early check-out).
 */
export function EarlyCheckoutDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: EarlyCheckoutTarget | null;
  onCancel: () => void;
  /** `undefined` applies the hotel's setting (used when the amounts didn't load). */
  onConfirm: (unusedNights: EarlyDeparturePolicy | undefined) => void;
}) {
  const targetId = target?.id ?? null;
  const query = useQuery({
    queryKey: ["early-checkout-preview", targetId],
    enabled: targetId !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const result = await previewEarlyCheckout(targetId as string);
      if (!result.success) throw new Error(result.error);
      if (!result.preview) throw new Error("This guest is no longer leaving early.");
      return result.preview;
    },
  });
  // The staff member's pick for this guest; the hotel setting until they pick.
  const [picked, setPicked] = React.useState<{ id: string; choice: EarlyDeparturePolicy } | null>(null);

  const state =
    query.isPending
      ? ({ status: "loading" } as const)
      : query.isError
        ? ({ status: "error", message: query.error instanceof Error ? query.error.message : "Couldn't load the amounts." } as const)
        : ({ status: "ready", preview: query.data } as const);
  const choice: EarlyDeparturePolicy | null =
    picked && picked.id === targetId ? picked.choice : state.status === "ready" ? state.preview.policy : null;

  const preview = state.status === "ready" ? state.preview : null;
  const nights = preview?.charge.nightsReleased ?? 0;
  const currency = preview?.charge.currency;

  return (
    <AlertDialog.Backdrop
      isOpen={target !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <AlertDialog.Container placement="center" size="sm">
        <AlertDialog.Dialog className="rounded-3xl sm:max-w-[440px]">
          <AlertDialog.Header className="items-center text-center">
            <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-amber-500/12 text-amber-700">
              <CalendarClock className="size-5" />
            </span>
            <AlertDialog.Heading className="text-lg font-semibold text-foreground">Check out early?</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body className="space-y-4">
            <p className="text-center text-sm leading-relaxed text-muted-foreground">
              {target?.guestName} is booked until{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {target ? formatDate(target.checkOut, "EEE, d MMM") : ""}
              </span>
              .{" "}
              {preview ? (
                <>
                  The stay now ends{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatDate(preview.charge.checkOutAfter, "EEE, d MMM")}
                  </span>{" "}
                  and {nights} unused {nights === 1 ? "night goes" : "nights go"} back on sale.
                </>
              ) : (
                "The stay ends today and the unused nights go back on sale."
              )}
            </p>

            {state.status === "loading" && (
              <div className="space-y-2" aria-busy="true" aria-label="Working out the bill">
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            )}

            {state.status === "error" && (
              <p role="note" className="rounded-2xl bg-secondary/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                {state.message} The hotel&apos;s early check-out setting will apply.
              </p>
            )}

            {preview && choice && currency && (
              <RadioGroup
                aria-label="What happens to the unused nights"
                value={choice}
                onChange={(v) => targetId && setPicked({ id: targetId, choice: v as EarlyDeparturePolicy })}
                className="gap-2"
              >
                <Option
                  value="charge"
                  label="Charge the unused nights"
                  isDefault={preview.policy === "charge"}
                  detail={`The bill stays ${formatCurrency(preview.charge.totalAfter, currency)}; ${formatCurrency(
                    preview.charge.releasedAmount,
                    currency
                  )} shows as an early departure fee.`}
                />
                <Option
                  value="release"
                  label="Take them off the bill"
                  isDefault={preview.policy === "release"}
                  detail={
                    `The bill drops to ${formatCurrency(preview.release.totalAfter, currency)}.` +
                    (preview.release.overpaid > 0
                      ? ` Refund ${formatCurrency(preview.release.overpaid, currency)} to the guest.`
                      : "")
                  }
                />
              </RadioGroup>
            )}
          </AlertDialog.Body>
          <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row">
            <Button slot="close" variant="tertiary" fullWidth onPress={onCancel} className="rounded-xl">
              Cancel
            </Button>
            <Button
              fullWidth
              variant="primary"
              isDisabled={state.status === "loading"}
              onPress={() => onConfirm(state.status === "ready" && choice ? choice : undefined)}
              className="rounded-xl font-semibold"
            >
              Check out early
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

function Option({
  value,
  label,
  detail,
  isDefault,
}: {
  value: EarlyDeparturePolicy;
  label: string;
  detail: string;
  isDefault: boolean;
}) {
  return (
    <Radio value={value} className="mt-0">
      <Radio.Content className="group flex w-full items-start gap-3 rounded-2xl border border-border p-4 transition-colors duration-150 ease-[ease] data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-ring data-[selected=true]:border-primary/50 data-[selected=true]:bg-primary/[0.04]">
        <Radio.Control className="mt-px size-5 shrink-0 rounded-full border border-border bg-card shadow-none group-data-[selected=true]:border-transparent group-data-[selected=true]:bg-primary">
          <Radio.Indicator className="before:rounded-full before:bg-card group-data-[selected=true]:before:scale-[0.4]" />
        </Radio.Control>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            {label}
            {isDefault && (
              <span className="inline-grid h-5 place-items-center rounded-full bg-secondary px-2 text-2xs font-semibold text-muted-foreground">
                Hotel setting
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs leading-relaxed tabular-nums text-muted-foreground">{detail}</span>
        </span>
      </Radio.Content>
    </Radio>
  );
}
