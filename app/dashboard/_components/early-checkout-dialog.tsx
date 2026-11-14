"use client";

import * as React from "react";
import { AlertDialog, Button, Radio, RadioGroup, Skeleton } from "@heroui/react";
import { CalendarClock } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { previewEarlyCheckout } from "@/app/dashboard/actions";
import type { CheckOutOptions, EarlyDeparturePolicy, EarlyDeparturePreview } from "@/lib/bookings/early-departure";
import { formatCurrency, formatDate } from "@/lib/format";

export interface EarlyCheckoutTarget {
  /** One booking, or every room of a group being checked out together. */
  bookingIds: string[];
  guestName: string;
  checkOut: string;
}

export const earlyCheckoutPreviewKey = (bookingId: string) => ["early-checkout-preview", bookingId] as const;

/** Loads one preview; `null` when the stay is not (or no longer) leaving early. */
export async function loadEarlyCheckoutPreview(bookingId: string): Promise<EarlyDeparturePreview | null> {
  const result = await previewEarlyCheckout(bookingId);
  if (!result.success) throw new Error(result.error);
  return result.preview;
}

/** Sums the early stays among `previews` (one guest or a whole group). */
function summarize(previews: EarlyDeparturePreview[]) {
  const sum = (pick: (p: EarlyDeparturePreview) => number) =>
    Math.round(previews.reduce((s, p) => s + pick(p), 0) * 100) / 100;
  const first = previews[0];
  return {
    policy: first.policy,
    currency: first.charge.currency,
    checkOutAfter: first.charge.checkOutAfter,
    rooms: previews.length,
    nights: previews.reduce((s, p) => s + p.charge.nightsReleased, 0),
    chargeTotal: sum((p) => p.charge.totalAfter),
    chargeFee: sum((p) => p.charge.earlyDepartureFee),
    chargeOwed: sum((p) => Math.max(0, p.charge.totalAfter - p.charge.amountPaid)),
    releaseTotal: sum((p) => p.release.totalAfter),
    releaseRefund: sum((p) => p.release.overpaid),
    releaseOwed: sum((p) => Math.max(0, p.release.totalAfter - p.release.amountPaid)),
    sameDay: previews.some((p) => p.sameDay),
    heldNight: previews.find((p) => p.sameDay)?.heldNight ?? null,
    departureDate: first.departureDate,
    canHold: previews.some((p) => p.sameDay && p.canHoldRoom),
    cannotHold: previews.filter((p) => p.sameDay && !p.canHoldRoom).length,
  };
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
  /**
   * `unusedNights` undefined applies the hotel's setting (used when the
   * amounts didn't load). `holdRoom` is set only for a same-day departure.
   */
  onConfirm: (unusedNights: EarlyDeparturePolicy | undefined, holdRoom: boolean | undefined) => void;
}) {
  const ids = React.useMemo(() => target?.bookingIds ?? [], [target]);
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: earlyCheckoutPreviewKey(id),
      staleTime: 15_000,
      gcTime: 60_000,
      retry: false,
      queryFn: () => loadEarlyCheckoutPreview(id),
    })),
  });

  const isLoading = queries.some((q) => q.isPending);
  const isError = !isLoading && queries.some((q) => q.isError);
  const previews = isLoading || isError ? [] : queries.flatMap((q) => (q.data ? [q.data] : []));
  const summary = previews.length > 0 ? summarize(previews) : null;
  const notEarly = !isLoading && !isError && previews.length === 0;

  // The staff member's pick for this check-out; the hotel setting until they pick.
  const targetKey = ids.join(",");
  const [picked, setPicked] = React.useState<{ key: string; choice: EarlyDeparturePolicy } | null>(null);
  const choice: EarlyDeparturePolicy | null =
    picked && picked.key === targetKey ? picked.choice : summary ? summary.policy : null;
  // Same-day departure: no default. Staff must decide what happens tonight.
  const [roomPick, setRoomPick] = React.useState<{ key: string; hold: boolean } | null>(null);
  const hold = roomPick && roomPick.key === targetKey ? roomPick.hold : null;
  const needsRoomChoice = !!summary?.canHold;
  // Usually tonight; after an early check-in it is the booked arrival night.
  const nightLabel =
    summary?.heldNight && summary.heldNight !== summary.departureDate
      ? `on ${formatDate(summary.heldNight, "EEE, d MMM")}`
      : "tonight";

  const group = ids.length > 1;
  const currency = summary?.currency;
  const owed = summary ? (choice === "release" ? summary.releaseOwed : summary.chargeOwed) : 0;

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
            <AlertDialog.Heading className="text-lg font-semibold text-foreground">
              {notEarly ? "Check out now?" : group ? `Check out ${ids.length} rooms early?` : "Check out early?"}
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body className="space-y-4">
            <p className="text-center text-sm leading-relaxed text-muted-foreground">
              {target?.guestName} is booked until{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {target ? formatDate(target.checkOut, "EEE, d MMM") : ""}
              </span>
              .{" "}
              {summary ? (
                <>
                  The stay now ends{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatDate(summary.checkOutAfter, "EEE, d MMM")}
                  </span>{" "}
                  and {summary.nights} unused {summary.nights === 1 ? "night goes" : "nights go"} back on sale
                  {group && summary.rooms !== ids.length ? ` (${summary.rooms} of ${ids.length} rooms leave early)` : ""}.
                </>
              ) : notEarly ? (
                "Nothing on the bill changes."
              ) : (
                "The stay ends today and the unused nights go back on sale."
              )}
            </p>

            {isLoading && (
              <div className="space-y-2" aria-busy="true" aria-label="Working out the bill">
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            )}

            {isError && (
              <div role="alert" className="flex flex-col gap-2 rounded-2xl bg-secondary/70 px-4 py-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  We couldn&apos;t work out the new bill. Try again to see the amounts. If you check out anyway,
                  the hotel&apos;s early check-out setting decides what happens to the unused nights.
                </p>
                <Button
                  variant="tertiary"
                  onPress={() => queries.forEach((q) => q.isError && void q.refetch())}
                  className="self-start rounded-xl max-md:h-11"
                >
                  Try again
                </Button>
              </div>
            )}

            {summary && choice && currency && (
              <RadioGroup
                aria-label="What happens to the unused nights"
                value={choice}
                onChange={(v) => setPicked({ key: targetKey, choice: v as EarlyDeparturePolicy })}
                className="gap-2"
              >
                <Option
                  value="charge"
                  label="Charge the unused nights"
                  isDefault={summary.policy === "charge"}
                  detail={
                    summary.chargeFee > 0
                      ? `The bill stays ${formatCurrency(summary.chargeTotal, currency)}; ${formatCurrency(
                          summary.chargeFee,
                          currency
                        )} shows as an early departure fee.`
                      : `The bill stays ${formatCurrency(summary.chargeTotal, currency)}.`
                  }
                />
                <Option
                  value="release"
                  label="Take them off the bill"
                  isDefault={summary.policy === "release"}
                  detail={
                    `The bill drops to ${formatCurrency(summary.releaseTotal, currency)}.` +
                    (summary.releaseRefund > 0
                      ? ` Refund ${formatCurrency(summary.releaseRefund, currency)} to the guest.`
                      : "")
                  }
                />
              </RadioGroup>
            )}

            {summary?.sameDay && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  {group ? "These rooms keep one night on the bill." : "The guest keeps one night on the bill."}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {nightLabel === "tonight"
                    ? "They're leaving on the day they arrived, so they're charged for tonight. What happens to the room tonight?"
                    : `They checked in before their booked arrival, so they're charged for one night, ${nightLabel.replace(/^on /, "")}. What happens to the room that night?`}
                </p>
                {needsRoomChoice ? (
                  <RadioGroup
                    aria-label="What happens to the room tonight"
                    value={hold === null ? "" : hold ? "hold" : "resell"}
                    onChange={(v) => setRoomPick({ key: targetKey, hold: v === "hold" })}
                    className="gap-2"
                  >
                    <Option
                      value="hold"
                      label={`Keep the room off sale ${nightLabel}`}
                      detail={`Nobody else can book it ${nightLabel}. Each night is counted once, so occupancy stays accurate.`}
                    />
                    <Option
                      value="resell"
                      label={`Put the room back on sale ${nightLabel}`}
                      detail={`You can sell it again ${nightLabel}. If you do, both guests count for that night and occupancy can go over 100%. Industry reports (STR) allow this.`}
                    />
                  </RadioGroup>
                ) : (
                  <p role="note" className="rounded-2xl bg-secondary/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                    The room goes back on sale {nightLabel}. It can&apos;t be held: another booking already has it
                    that night, or no room is assigned.
                  </p>
                )}
                {needsRoomChoice && summary.cannotHold > 0 && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {summary.cannotHold} {summary.cannotHold === 1 ? "room" : "rooms"} can&apos;t be held and will go
                    back on sale.
                  </p>
                )}
              </div>
            )}

            {summary && currency && owed > 0 && (
              <p role="note" className="rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-900">
                The guest still owes {formatCurrency(owed, currency)}. Take the payment before you check them
                out. It can&apos;t be recorded afterwards.
              </p>
            )}
          </AlertDialog.Body>
          <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row">
            <Button slot="close" variant="tertiary" fullWidth onPress={onCancel} className="rounded-xl max-md:h-11">
              Cancel
            </Button>
            <Button
              fullWidth
              variant={isError ? "secondary" : "primary"}
              isDisabled={isLoading || (needsRoomChoice && hold === null)}
              onPress={() =>
                onConfirm(summary && choice ? choice : undefined, needsRoomChoice ? hold ?? undefined : summary?.sameDay ? false : undefined)
              }
              className="rounded-xl font-semibold max-md:h-11"
            >
              {notEarly ? "Check out" : isError ? "Check out anyway" : "Check out early"}
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
  isDefault = false,
}: {
  value: string;
  label: string;
  detail: string;
  isDefault?: boolean;
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

/**
 * Gate for any check-out button: asks the server whether the stays are
 * leaving early and, if so, shows the dialog before anything is written.
 * With `alwaysConfirm` it also asks for a departure before the booked date
 * that drops no nights. Resolves `{ ok: false }` when staff cancel;
 * `optionsFor(id)` gives the choices to send for each booking.
 */
export function useEarlyCheckoutGate() {
  type Result = { ok: boolean; optionsFor: (bookingId: string) => CheckOutOptions };
  const [pending, setPending] = React.useState<{
    target: EarlyCheckoutTarget;
    resolve: (choice: { ok: boolean; unusedNights?: EarlyDeparturePolicy; holdRoom?: boolean }) => void;
  } | null>(null);

  const confirm = React.useCallback(
    async (target: EarlyCheckoutTarget, opts: { alwaysConfirm?: boolean } = {}): Promise<Result> => {
      const results = await Promise.allSettled(target.bookingIds.map((id) => loadEarlyCheckoutPreview(id)));
      const previews = new Map<string, EarlyDeparturePreview | null>();
      results.forEach((r, i) => previews.set(target.bookingIds[i], r.status === "fulfilled" ? r.value : null));
      const needsDialog =
        opts.alwaysConfirm || results.some((r) => r.status === "rejected" || r.value !== null);
      if (!needsDialog) return { ok: true, optionsFor: () => ({}) };
      const choice = await new Promise<{ ok: boolean; unusedNights?: EarlyDeparturePolicy; holdRoom?: boolean }>(
        (resolve) => setPending({ target, resolve })
      );
      return {
        ok: choice.ok,
        optionsFor: (id) => {
          const preview = previews.get(id);
          const options: CheckOutOptions = {};
          if (choice.unusedNights) options.unusedNights = choice.unusedNights;
          // A room that can't be held goes back on sale, whatever was picked.
          if (preview?.sameDay) options.holdRoom = choice.holdRoom === true && preview.canHoldRoom;
          return options;
        },
      };
    },
    []
  );

  const finish = (r: { ok: boolean; unusedNights?: EarlyDeparturePolicy; holdRoom?: boolean }) => {
    pending?.resolve(r);
    setPending(null);
  };

  const dialog = pending ? (
    <EarlyCheckoutDialog
      target={pending.target}
      onCancel={() => finish({ ok: false })}
      onConfirm={(unusedNights, holdRoom) => finish({ ok: true, unusedNights, holdRoom })}
    />
  ) : null;

  return { confirm, dialog };
}
