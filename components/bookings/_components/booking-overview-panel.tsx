"use client";

import * as React from "react";
import { ArrowRight, Moon, BedDouble, LogIn, LogOut, XCircle, RotateCcw, BadgeCheck } from "lucide-react";
import { AlertDialog, Button } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDateFull, formatDateTime, getNights } from "@/lib/format";
import { canTransitionBooking, getSourceLabel, getStatusLabel } from "@/lib/booking-status";
import { checkInBooking, checkOutBooking } from "@/app/dashboard/actions";
import { updateBookingStatus } from "@/app/actions/bookings";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingOverviewPanelProps {
  booking: FullBookingDetail;
  actionLoading?: string | null;
  onLineAction?: (
    action: string,
    lineId: string,
    optimisticStatus: string,
    fn: () => Promise<{ success: boolean; error?: string }>
  ) => void;
  onBulkAction?: (
    ids: string[],
    targetStatus: string,
    kind: "check_in" | "check_out"
  ) => void;
}

/** "2 adults" / "2 adults, 1 child". */
function occupancyLabel(adults: number | null, children: number | null) {
  const a = adults || 1;
  const c = children || 0;
  const base = `${a} ${a === 1 ? "adult" : "adults"}`;
  return c > 0 ? `${base}, ${c} ${c === 1 ? "child" : "children"}` : base;
}

export function BookingOverviewPanel({ booking, actionLoading, onLineAction, onBulkAction }: BookingOverviewPanelProps) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const guestsLabel = occupancyLabel(booking.adults, booking.children);
  const group = booking.group;
  const currency = booking.currency ?? "GHS";

  const roomValue = booking.room?.roomNumber
    ? `Room ${booking.room.roomNumber}${booking.room.floor ? ` · Floor ${booking.room.floor}` : ""}`
    : null;

  return (
    <div className="space-y-5 px-4 py-4 sm:px-5">
      {/* ── Stay ─────────────────────────────────────────────────── */}
      <section aria-label="Stay" className="rounded-2xl bg-muted/40 p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">Check-in</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
              {formatDateFull(booking.checkIn)}
            </p>
          </div>

          <div className="flex flex-col items-center gap-1 px-1 text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground/80 shadow-xs">
              <Moon className="size-3" />
              {nights} {nights === 1 ? "night" : "nights"}
            </span>
            <ArrowRight className="size-3.5" />
          </div>

          <div className="min-w-0 text-right">
            <p className="text-[11px] font-medium text-muted-foreground">Check-out</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
              {formatDateFull(booking.checkOut)}
            </p>
          </div>
        </div>

        {(booking.checkInAt ||
          booking.checkOutAt ||
          (booking.status === "cancelled" && booking.cancelledAt)) && (
          <div className="mt-3.5 space-y-1 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
            {booking.checkInAt && (
              <p>Checked in · {formatDateTime(booking.checkInAt)}</p>
            )}
            {booking.checkOutAt && (
              <p>Checked out · {formatDateTime(booking.checkOutAt)}</p>
            )}
            {booking.status === "cancelled" && booking.cancelledAt && (
              <p className="text-red-600">
                Cancelled · {formatDateTime(booking.cancelledAt)}
                {booking.cancellationReason ? ` — ${booking.cancellationReason}` : ""}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Rooms ────────────────────────────────────────────────── */}
      {group ? (
        <section aria-label="Rooms">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Rooms
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
              <BedDouble className="size-3" />
              {group.totalRooms} {group.totalRooms === 1 ? "room" : "rooms"}
            </span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40">
            <div className="divide-y divide-border/40 px-3">
              {group.lines.map((l) => {
                const interactive = !!onLineAction;
                const canCheckIn = interactive && canTransitionBooking(l.status ?? "", "checked_in");
                const canCheckOut = interactive && canTransitionBooking(l.status ?? "", "checked_out");
                const canConfirmPending = interactive && l.status === "pending" && canTransitionBooking(l.status ?? "", "confirmed");
                const canReinstate = interactive && (l.status === "cancelled" || l.status === "no_show") && canTransitionBooking(l.status ?? "", "confirmed");
                const canCancel = interactive && canTransitionBooking(l.status ?? "", "cancelled");
                const canNoShow = interactive && canTransitionBooking(l.status ?? "", "no_show");
                const busy = actionLoading === `line:${l.id}:check_in` || actionLoading === `line:${l.id}:check_out` || actionLoading === `line:${l.id}:cancel` || actionLoading === `line:${l.id}:confirm` || actionLoading === `line:${l.id}:no_show`;
                return (
                  <GroupLineRow
                    key={l.id}
                    line={l}
                    currency={currency}
                    canCheckIn={canCheckIn}
                    canCheckOut={canCheckOut}
                    canConfirmPending={canConfirmPending}
                    canReinstate={canReinstate}
                    canCancel={canCancel}
                    canNoShow={canNoShow}
                    busy={busy}
                    actionLoading={actionLoading ?? null}
                    onAction={onLineAction}
                  />
                );
              })}
            </div>
          </div>
          <GroupBulkBar group={group} actionLoading={actionLoading ?? null} onBulkAction={onBulkAction} />
          <dl className="mt-1 divide-y divide-border/50">
            <Fact label="Source" className="capitalize">
              {getSourceLabel(booking.source)}
            </Fact>
            <Fact label="Payment">
              {booking.paymentPreference === "pay_now" ? "Pay now" : "Pay at check-in"}
            </Fact>
          </dl>
        </section>
      ) : (
        <dl className="divide-y divide-border/50">
          <Fact label="Room">
            {roomValue ? (
              <span className="font-medium text-foreground">{roomValue}</span>
            ) : (
              <span className="font-medium text-amber-600">Not assigned</span>
            )}
          </Fact>
          <Fact label="Room type">{booking.roomType?.name ?? "—"}</Fact>
          {(booking.roomsCount ?? 0) > 1 && (
            <Fact label="Rooms">×{booking.roomsCount}</Fact>
          )}
          <Fact label="Guests">{guestsLabel}</Fact>
          <Fact label="Source" className="capitalize">
            {getSourceLabel(booking.source)}
          </Fact>
          <Fact label="Payment">
            {booking.paymentPreference === "pay_now" ? "Pay now" : "Pay at check-in"}
          </Fact>
        </dl>
      )}

      {(booking.createdBy?.fullName || booking.createdAt) && (
        <p className="text-[11px] text-muted-foreground/70">
          Booked {formatDateTime(booking.createdAt)}
          {booking.createdBy?.fullName ? ` by ${booking.createdBy.fullName}` : ""}
        </p>
      )}
    </div>
  );
}

function GroupLineRow({
  line,
  currency,
  canCheckIn,
  canCheckOut,
  canConfirmPending,
  canReinstate,
  canCancel,
  canNoShow,
  busy,
  actionLoading,
  onAction,
}: {
  line: import("@/app/actions/bookings-detail").GroupLineItem;
  currency: string;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canConfirmPending: boolean;
  canReinstate: boolean;
  canCancel: boolean;
  canNoShow: boolean;
  busy: boolean;
  actionLoading: string | null;
  onAction: BookingOverviewPanelProps["onLineAction"];
}) {
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  if (!onAction) {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-foreground">
            {line.roomTypeName ?? "Room"}
            {line.roomNumber ? (
              <span className="font-normal text-muted-foreground"> · Room {line.roomNumber}</span>
            ) : (
              <span className="font-normal text-amber-600"> · Unassigned</span>
            )}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {getStatusLabel(line.status ?? "")} · {occupancyLabel(line.adults, line.children)}
          </p>
        </div>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
          {formatCurrency(line.totalAmount, currency)}
        </span>
      </div>
    );
  }
  const label = getStatusLabel(line.status ?? "");
  const dot: Record<string, string> = {
    confirmed: "bg-blue-500",
    checked_in: "bg-emerald-500",
    checked_out: "bg-muted-foreground/50",
    cancelled: "bg-red-500",
    no_show: "bg-rose-500",
    pending: "bg-amber-500",
  };
  return (
    <>
      <div className="flex items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">
            {line.roomTypeName ?? "Room"}
            {line.roomNumber ? (
              <span className="font-normal text-muted-foreground"> · Room {line.roomNumber}</span>
            ) : (
              <span className="font-normal text-amber-600"> · Unassigned</span>
            )}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <span className={cn("size-1.5 shrink-0 rounded-full", dot[line.status ?? ""] ?? "bg-muted-foreground/50")} />
            {label} · {occupancyLabel(line.adults, line.children)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="mr-1 text-[13px] font-semibold tabular-nums text-foreground">
            {formatCurrency(line.totalAmount, currency)}
          </span>
          {canConfirmPending && (
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={`Confirm ${line.roomTypeName ?? "room"}`}
              isPending={actionLoading === `line:${line.id}:confirm`}
              isDisabled={busy}
              onPress={() => onAction(`line:${line.id}:confirm`, line.id, "confirmed", () => updateBookingStatus(line.id, "confirmed"))}
              className="size-7 rounded-lg text-blue-600 hover:bg-blue-500/10"
            >
              <BadgeCheck className="size-3.5" />
            </Button>
          )}
          {canCheckIn && (
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={`Check in ${line.roomTypeName ?? "room"}`}
              isPending={actionLoading === `line:${line.id}:check_in`}
              isDisabled={busy}
              onPress={() => onAction(`line:${line.id}:check_in`, line.id, "checked_in", () => checkInBooking(line.id))}
              className="size-7 rounded-lg text-emerald-600 hover:bg-emerald-500/10"
            >
              <LogIn className="size-3.5" />
            </Button>
          )}
          {canCheckOut && (
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={`Check out ${line.roomTypeName ?? "room"}`}
              isPending={actionLoading === `line:${line.id}:check_out`}
              isDisabled={busy}
              onPress={() => onAction(`line:${line.id}:check_out`, line.id, "checked_out", () => checkOutBooking(line.id))}
              className="size-7 rounded-lg text-foreground hover:bg-muted"
            >
              <LogOut className="size-3.5" />
            </Button>
          )}
          {canReinstate && (
            <Button
              size="sm"
              variant="outline"
              isPending={actionLoading === `line:${line.id}:confirm`}
              isDisabled={busy}
              onPress={() => onAction(`line:${line.id}:confirm`, line.id, "confirmed", () => updateBookingStatus(line.id, "confirmed"))}
              className="h-7 rounded-lg px-2 text-[11px]"
            >
              <RotateCcw className="size-3" /> Reinstate
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={`Cancel ${line.roomTypeName ?? "room"}`}
              isDisabled={busy}
              onPress={() => setConfirmCancel(true)}
              className="size-7 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            >
              <XCircle className="size-3.5" />
            </Button>
          )}
          {canNoShow && (
            <Button
              size="sm"
              variant="ghost"
              isPending={actionLoading === `line:${line.id}:no_show`}
              isDisabled={busy}
              onPress={() => onAction(`line:${line.id}:no_show`, line.id, "no_show", () => updateBookingStatus(line.id, "no_show"))}
              className="h-7 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              No-show
            </Button>
          )}
        </div>
      </div>
      <AlertDialog.Backdrop isOpen={confirmCancel} onOpenChange={(o) => setConfirmCancel(o)} variant="opaque">
        <AlertDialog.Container placement="auto" size="sm">
          <AlertDialog.Dialog className="rounded-2xl border border-border/70 bg-card p-6 shadow-2xl">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Cancel this room?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                {line.roomTypeName ?? "This room"} {line.roomNumber ? `· Room ${line.roomNumber}` : ""} will be cancelled
                and released. Other rooms in the reservation are not affected.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">Keep</Button>
              <Button
                variant="danger"
                isPending={actionLoading === `line:${line.id}:cancel`}
                onPress={() => {
                  setConfirmCancel(false);
                  onAction(`line:${line.id}:cancel`, line.id, "cancelled", () => updateBookingStatus(line.id, "cancelled"));
                }}
              >
                Cancel room
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}

function GroupBulkBar({
  group,
  actionLoading,
  onBulkAction,
}: {
  group: import("@/app/actions/bookings-detail").BookingGroupSummary;
  actionLoading: string | null;
  onBulkAction: BookingOverviewPanelProps["onBulkAction"];
}) {
  if (!onBulkAction) return null;
  const checkInIds = group.lines.filter((l) => canTransitionBooking(l.status ?? "", "checked_in")).map((l) => l.id);
  const checkOutIds = group.lines.filter((l) => canTransitionBooking(l.status ?? "", "checked_out")).map((l) => l.id);
  const bulkBusy = actionLoading?.startsWith("bulk:") ?? false;
  if (checkInIds.length === 0 && checkOutIds.length === 0) return null;
  return (
    <div className="mt-2 flex gap-2">
      {checkInIds.length > 0 && (
        <Button
          variant="primary"
          size="sm"
          isPending={actionLoading === "bulk:check_in" || actionLoading?.startsWith("bulk:check_in") === true}
          isDisabled={bulkBusy}
          onPress={() => onBulkAction(checkInIds, "checked_in", "check_in")}
          className="h-8 rounded-xl px-3 text-xs font-semibold"
        >
          <LogIn className="size-3.5" /> Check in all ({checkInIds.length})
        </Button>
      )}
      {checkOutIds.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          isPending={actionLoading === "bulk:check_out" || actionLoading?.startsWith("bulk:check_out") === true}
          isDisabled={bulkBusy}
          onPress={() => onBulkAction(checkOutIds, "checked_out", "check_out")}
          className="h-8 rounded-xl px-3 text-xs font-semibold"
        >
          <LogOut className="size-3.5" /> Check out all ({checkOutIds.length})
        </Button>
      )}
    </div>
  );
}

function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right text-[13px] text-foreground", className)}>
        {children}
      </dd>
    </div>
  );
}
