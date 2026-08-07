"use client";

import * as React from "react";
import { Button, Separator, TextArea, toast } from "@heroui/react";
import { FileText, Edit3, Clock } from "lucide-react";

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

  React.useEffect(() => {
    setNotesDraft(booking.internalNotes || "");
  }, [booking.internalNotes]);

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
    <section className="space-y-5 border-t border-border/40 px-5 py-5" aria-labelledby="reservation-notes-heading">
      <h3 id="reservation-notes-heading" className="text-xs font-semibold text-foreground">
        Notes
      </h3>
      {/* Special Requests (read-only) */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <FileText className="size-3.5 text-muted-foreground/50" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Special Requests
          </p>
        </div>
        {booking.specialRequests ? (
          <div className="rounded-xl border border-amber-200/50 bg-amber-50/50 dark:border-amber-800/30 dark:bg-amber-950/10 p-3">
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {booking.specialRequests}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">
            No special requests from the guest.
          </p>
        )}
      </div>

      <Separator className="opacity-40" />

      {/* Internal Notes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <FileText className="size-3.5 text-muted-foreground/50" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Internal Notes
            </p>
          </div>
          {!editingNotes && (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                setNotesDraft(booking.internalNotes || "");
                setEditingNotes(true);
              }}
              className="h-7 px-2 text-[10px] text-muted-foreground"
            >
              <Edit3 className="size-3" />
              {booking.internalNotes ? "Edit" : "Add Note"}
            </Button>
          )}
        </div>

        {editingNotes ? (
          <div className="space-y-2">
            <TextArea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Staff-only notes about this booking (preferences, special needs, issues)..."
              rows={5}
              maxLength={2000}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/50">
                {notesDraft.length}/2000
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  onPress={() => {
                    setEditingNotes(false);
                    setNotesDraft(booking.internalNotes || "");
                  }}
                  size="sm"
                  variant="ghost"
                  className="text-[10px]"
                >
                  Cancel
                </Button>
                <Button
                  onPress={handleSaveNotes}
                  isPending={savingNotes}
                  size="sm"
                  className="text-[10px]"
                >
                  {savingNotes ? "Saving..." : "Save Notes"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
            {booking.internalNotes || (
              <span className="text-muted-foreground/50 italic">
                No internal notes recorded for this booking.
              </span>
            )}
          </p>
        )}
      </div>

      {/* ETA */}
      {booking.estimatedArrival && (
        <>
          <Separator className="opacity-40" />
          <div className="flex items-center gap-2.5 text-sm">
            <Clock className="size-3.5 text-muted-foreground/50 shrink-0" />
            <span className="text-muted-foreground">Estimated arrival:</span>
            <span className="font-medium text-foreground">
              {booking.estimatedArrival.slice(0, 5)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
