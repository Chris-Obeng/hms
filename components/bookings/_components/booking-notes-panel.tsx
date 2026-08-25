"use client";

import * as React from "react";
import { Button, TextArea, toast } from "@heroui/react";
import { Clock3, PenLine, Sparkles } from "lucide-react";

import { updateBookingNotes } from "@/app/actions/bookings-detail";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingNotesPanelProps {
  booking: FullBookingDetail;
  onRefresh: () => void;
}

export function BookingNotesPanel({
  booking,
  onRefresh,
}: BookingNotesPanelProps) {
  const [editingNotes, setEditingNotes] = React.useState(false);
  const [notesDraft, setNotesDraft] = React.useState(booking.internalNotes || "");
  const [savingNotes, setSavingNotes] = React.useState(false);
  // Prop-derived draft reset via the official "adjust state during render"
  // pattern — an effect + setState here cascades an extra render pass.
  const [syncedNotes, setSyncedNotes] = React.useState(booking.internalNotes || "");
  if ((booking.internalNotes || "") !== syncedNotes) {
    setSyncedNotes(booking.internalNotes || "");
    setNotesDraft(booking.internalNotes || "");
  }

  const handleSaveNotes = async () => {
    if (!booking.id) return;
    setSavingNotes(true);
    const result = await updateBookingNotes(booking.id, { notes: notesDraft });
    setSavingNotes(false);
    if (result.success) {
      setEditingNotes(false);
      toast.success("Notes updated");
      onRefresh();
    } else {
      toast.danger(result.error || "Failed to update notes");
    }
  };

  return (
    <section
      aria-labelledby="reservation-notes-heading"
      className="space-y-3 px-4 pb-6 pt-1 sm:px-5"
    >
      <h3 className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
        Notes
      </h3>

      {/* Special requests — read-only */}
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
          <Sparkles className="size-3 text-amber-500" />
          Special requests
        </p>
        {booking.specialRequests ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
            {booking.specialRequests}
          </p>
        ) : (
          <p className="text-[13px] italic text-muted-foreground/50">None</p>
        )}
        {booking.estimatedArrival && (
          <p className="mt-2 flex items-center gap-1.5 border-t border-border/40 pt-2 text-xs text-muted-foreground">
            <Clock3 className="size-3" />
            ETA{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {booking.estimatedArrival.slice(0, 5)}
            </span>
          </p>
        )}
      </div>

      {/* Internal notes — editable */}
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
            Internal notes
          </p>
          {!editingNotes && (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                setNotesDraft(booking.internalNotes || "");
                setEditingNotes(true);
              }}
              className="h-7 rounded-lg px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <PenLine className="size-3" />
              {booking.internalNotes ? "Edit" : "Add"}
            </Button>
          )}
        </div>

        {editingNotes ? (
          <div className="space-y-2">
            <TextArea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Staff-only notes (preferences, special needs, issues)…"
              rows={4}
              maxLength={2000}
              autoFocus
              className="w-full resize-none rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] tabular-nums text-muted-foreground/60">
                {notesDraft.length}/2000
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  onPress={() => {
                    setEditingNotes(false);
                    setNotesDraft(booking.internalNotes || "");
                  }}
                  size="sm"
                  variant="tertiary"
                  className="h-8 rounded-lg text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onPress={handleSaveNotes}
                  isPending={savingNotes}
                  size="sm"
                  className="h-8 rounded-lg text-xs font-semibold"
                >
                  {savingNotes ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
            {booking.internalNotes || (
              <span className="italic text-muted-foreground/50">
                Visible to staff only
              </span>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
