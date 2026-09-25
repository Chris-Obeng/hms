"use client";

import * as React from "react";
import { Button, toast } from "@heroui/react";
import { PenLine, StickyNote } from "lucide-react";

import { AccordionSection } from "@/components/ui/accordion-section";
import { NotesEditor } from "@/components/ui/notes-editor";
import { updateBookingNotes } from "@/app/actions/bookings-detail";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingNotesPanelProps {
  booking: FullBookingDetail;
  onRefresh: () => void;
}

export function BookingNotesPanel({ booking, onRefresh }: BookingNotesPanelProps) {
  const [editingNotes, setEditingNotes] = React.useState(false);
  const [notesDraft, setNotesDraft] = React.useState(booking.internalNotes || "");
  const [savingNotes, setSavingNotes] = React.useState(false);
  // Prop-derived draft reset via the official "adjust state during render"
  // pattern — an effect + setState here cascades an extra render pass.
  const [syncedNotes, setSyncedNotes] = React.useState(booking.internalNotes || "");
  if ((booking.internalNotes || "") !== syncedNotes) {
    setSyncedNotes(booking.internalNotes || "");
    // Don't clobber an in-progress edit; draft resyncs once editing ends.
    if (!editingNotes) setNotesDraft(booking.internalNotes || "");
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
    <AccordionSection
      id="notes"
      icon={<StickyNote className="size-4 shrink-0 text-muted-foreground" />}
      title="Notes & requests"
      bodyClassName="space-y-4"
    >
      {/* Guest requests — read-only */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Guest requests</p>
        {booking.specialRequests ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
            {booking.specialRequests}
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground/50">None</p>
        )}
        {booking.estimatedArrival && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Estimated arrival{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {booking.estimatedArrival.slice(0, 5)}
            </span>
          </p>
        )}
      </div>

      {/* Internal notes — editable */}
      <div className="border-t border-border/50 pt-3.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-muted-foreground">Internal notes</p>
          {!editingNotes && (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                setNotesDraft(booking.internalNotes || "");
                setEditingNotes(true);
              }}
              className="h-7 rounded-lg px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <PenLine className="size-3" />
              {booking.internalNotes ? "Edit" : "Add"}
            </Button>
          )}
        </div>

        {editingNotes ? (
          <NotesEditor
            value={notesDraft}
            onChange={setNotesDraft}
            onCancel={() => {
              setEditingNotes(false);
              setNotesDraft(booking.internalNotes || "");
            }}
            onSave={handleSaveNotes}
            saving={savingNotes}
            label="Internal notes"
            placeholder="Staff-only notes (preferences, special needs, issues)…"
          />
        ) : (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
            {booking.internalNotes || (
              <span className="text-muted-foreground/50">Visible to staff only</span>
            )}
          </p>
        )}
      </div>
    </AccordionSection>
  );
}
