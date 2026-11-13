"use client";

import * as React from "react";
import { ArrowRight, ArrowUpRight, Mail, Pencil, Phone } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatDateTime, formatRoomLabel, getNights } from "@/lib/format";
import { occupancyText } from "@/lib/bookings/cart";
import { canTransitionBooking, getSourceLabel, getStatusLabel } from "@/lib/booking-status";
import type { FullBookingDetail } from "./booking-detail-types";
import { toast } from "@heroui/react";

interface BookingOverviewPanelProps {
  booking: FullBookingDetail;
  actionLoading?: string | null;
  /** Per-room lifecycle actions ("Check in Room 204"), including single-room ones. */
  onBulkAction?: (
    ids: string[],
    targetStatus: string,
    kind: "check_in" | "check_out"
  ) => void;
  /** Persist the internal note; the drawer owns the server action so this panel stays render-pure. */
  onSaveNotes?: (notes: string) => Promise<{ success: boolean; error?: string }>;
}

const LINE_DOTS: Record<string, string> = {
  confirmed: "bg-[var(--pen-accent)]",
  checked_in: "bg-[var(--success)]",
  checked_out: "bg-muted-foreground/40",
  cancelled: "bg-[var(--danger)]",
  no_show: "bg-[var(--danger)]",
  pending: "bg-[var(--warning)]",
};

/**
 * Overview bands per the design: one surface, full-bleed hairline bands,
 * every fact said exactly once, no stroked cards inside.
 */
export function BookingOverviewPanel({ booking, actionLoading, onBulkAction, onSaveNotes }: BookingOverviewPanelProps) {
  const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
  const guestsLabel = occupancyText(booking.adults ?? 1, booking.children ?? 0);
  const group = booking.group;
  const currency = booking.currency ?? "GHS";

  const roomValue = booking.room?.roomNumber
    ? `${formatRoomLabel(booking.room.roomNumber)}${booking.room.floor ? ` · Floor ${booking.room.floor}` : ""}`
    : null;

  return (
    <div className="flex min-h-full flex-col">
      {/* Stay band */}
      <section aria-label="Stay" className="border-b border-border/60 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="text-[17px] font-semibold tracking-[-0.3px] text-foreground">{formatDate(booking.checkIn, "MMM d")}</span>
          <ArrowRight className="size-4 text-muted-foreground/60" aria-hidden="true" />
          <span className="text-[17px] font-semibold tracking-[-0.3px] text-foreground">{formatDate(booking.checkOut, "MMM d")}</span>
        </div>
        <p className="mt-1 max-md:text-xs text-xs text-muted-foreground">
          {nights} {nights === 1 ? "night" : "nights"}
          {booking.checkInAt && <span> · Checked in {formatDateTime(booking.checkInAt)}</span>}
          {booking.checkOutAt && <span> · Checked out {formatDateTime(booking.checkOutAt)}</span>}
          {booking.status === "cancelled" && booking.cancelledAt && (
            <span className="text-[var(--danger)]"> · Cancelled {formatDateTime(booking.cancelledAt)}{booking.cancellationReason ? ` — ${booking.cancellationReason}` : ""}</span>
          )}
        </p>
      </section>

      {/* Rooms band */}
      <section aria-label="Rooms" className="border-b border-border/60 px-6 py-2">
        {group ? (
          group.lines.map((l, index) => {
            const canIn = canTransitionBooking(l.status ?? "", "checked_in");
            const canOut = canTransitionBooking(l.status ?? "", "checked_out");
            return <div key={l.id}>
              {index > 0 && <div className="h-px bg-border/50" aria-hidden="true" />}
              <div className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-[13px] font-semibold text-foreground">
                    <span className={cn("size-[8px] shrink-0 rounded-full", LINE_DOTS[l.status ?? ""] ?? "bg-muted-foreground/40")} aria-hidden="true" />
                    {l.roomTypeName ?? "Room"}
                    {l.roomNumber ? <span className="font-normal text-muted-foreground"> · {formatRoomLabel(l.roomNumber)}</span> : <span className="font-normal text-[var(--warning)]"> · Unassigned</span>}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {getStatusLabel(l.status ?? "")} · {occupancyText(l.adults ?? 1, l.children ?? 0)}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-xs font-semibold tabular-nums text-foreground">{formatCurrency(l.totalAmount, currency)}</span>
                  {canIn && onBulkAction && (
                    <button type="button" disabled={actionLoading === "bulk:check_in"}
                      onClick={() => onBulkAction([l.id], "checked_in", "check_in")}
                      className="mt-2 h-[28px] rounded-lg bg-[var(--pen-accent)] px-3 text-[11px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60">
                      Check in
                    </button>
                  )}
                  {canOut && onBulkAction && (
                    <button type="button" disabled={actionLoading === "bulk:check_out"}
                      onClick={() => onBulkAction([l.id], "checked_out", "check_out")}
                      className="mt-2 block h-[28px] rounded-lg border border-border/70 bg-card px-3 text-[11px] font-semibold text-foreground transition-transform active:scale-[0.98] disabled:opacity-60">
                      Check out
                    </button>
                  )}
                </span>
              </div>
            </div>;
          })
        ) : (
          <div className="py-2">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <span className={cn("size-[8px] shrink-0 rounded-full", LINE_DOTS[booking.status ?? ""] ?? "bg-muted-foreground/40")} aria-hidden="true" />
              {booking.roomType?.name ?? "Room"}
              {roomValue ? <span className="font-normal text-muted-foreground"> · {roomValue}</span> : <span className="font-normal text-[var(--warning)]"> · Not assigned</span>}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{getStatusLabel(booking.status ?? "")} · {guestsLabel}</p>
          </div>
        )}
      </section>

      {/* Details band */}
      <section aria-label="Reservation details" className="border-b border-border/60 px-6 py-2">
        <dl>
          {!group && <Fact label="Room">{roomValue ?? <span className="text-[var(--warning)]">Not assigned</span>}</Fact>}
          {!group && <Fact label="Room type">{booking.roomType?.name ?? "—"}</Fact>}
          {!group && (booking.roomsCount ?? 0) > 1 && <Fact label="Rooms">×{booking.roomsCount}</Fact>}
          {!group && <Fact label="Guests">{guestsLabel}</Fact>}
          <Fact label="Source" className="capitalize">{getSourceLabel(booking.source)}</Fact>
          <Fact label="Payment">{booking.paymentPreference === "pay_now" ? "Pay now" : "Pay at check-in"}</Fact>
        </dl>
      </section>

      {/* Guest band */}
      <section aria-label="Guest contact" className="border-b border-border/60 px-6 py-2">
        {booking.guest?.phone && (
          <a href={`tel:${booking.guest.phone}`} className="flex items-center gap-3 py-2 text-[13px] text-foreground">
            <Phone className="size-4 text-muted-foreground/60" aria-hidden="true" /> {booking.guest.phone}
          </a>
        )}
        {booking.guest?.email && (
          <a href={`mailto:${booking.guest.email}`} className="flex items-center gap-3 py-2 text-[13px] text-foreground">
            <Mail className="size-4 text-muted-foreground/60" aria-hidden="true" /> {booking.guest.email}
          </a>
        )}
        {booking.guest?.id && (
          <Link href={`/dashboard/customers?guestId=${booking.guest.id}`}
            className="flex items-center gap-3 py-2 text-[13px] font-medium text-[var(--pen-accent)]">
            View full profile
            <span className="min-w-0 flex-1" aria-hidden="true" />
            <ArrowUpRight className="size-3 text-muted-foreground/60" aria-hidden="true" />
          </Link>
        )}
      </section>

      {/* Notes band fills the remaining height */}
      <NotesBand booking={booking} onSaveNotes={onSaveNotes} />
    </div>
  );
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right text-xs font-medium text-foreground", className)}>
        {children}
      </dd>
    </div>
  );
}

function NotesBand({ booking, onSaveNotes }: { booking: FullBookingDetail; onSaveNotes?: (notes: string) => Promise<{ success: boolean; error?: string }> }) {
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // Draft tracks the persisted note; a render-time reset follows a save or a
  // different booking without an effect.
  const notesKey = `${booking.id}|${booking.internalNotes ?? ""}`;
  const [draftState, setDraftState] = React.useState({ key: notesKey, value: booking.internalNotes ?? "" });
  if (draftState.key !== notesKey) setDraftState({ key: notesKey, value: booking.internalNotes ?? "" });
  const draft = draftState.value;
  const setDraft = (value: string) => setDraftState((prev) => ({ ...prev, value }));

  async function save() {
    if (!onSaveNotes) return;
    setSaving(true);
    const result = await onSaveNotes(draft.trim());
    setSaving(false);
    if (result.success) {
      toast.success("Notes saved");
      setEditing(false);
    } else {
      toast.danger(result.error || "Failed to save notes");
    }
  }

  const canEdit = typeof onSaveNotes === "function";

  return (
    <section aria-label="Notes" className="flex flex-1 flex-col gap-3 px-6 pb-5 pt-4">
      <div className="flex items-center gap-3">
        <h3 className="text-[13px] font-semibold text-foreground">Notes</h3>
        <span className="min-w-0 flex-1" aria-hidden="true" />
        {canEdit && <button type="button" aria-label={editing ? "Close notes editor" : "Edit notes"}
          onClick={() => setEditing((prev) => !prev)}
          className="grid size-6 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground">
          <Pencil className="size-4" aria-hidden="true" />
        </button>}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea rows={4} value={draft} maxLength={2000} autoFocus
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Housekeeping requests, arrival notes…"
            className="w-full resize-none rounded-xl border border-border/60 bg-card px-3 py-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 sm:text-xs" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setEditing(false); setDraft(booking.internalNotes ?? ""); }}
              className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              Cancel
            </button>
            <button type="button" disabled={saving} onClick={() => void save()}
              className="h-8 rounded-full bg-[var(--pen-accent)] px-4 text-xs font-semibold text-white disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-foreground">
          {booking.internalNotes || <span className="text-muted-foreground/70">No notes yet.</span>}
        </p>
      )}
    </section>
  );
}
