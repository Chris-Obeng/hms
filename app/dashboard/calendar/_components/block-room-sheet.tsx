"use client";

import * as React from "react";
import { addDays, format, parseISO } from "date-fns";
import { Drawer, RangeCalendar, TextArea, Button, toast } from "@heroui/react";
import { CalendarIcon } from "lucide-react";

import { useIsCompactScreen } from "@/hooks/use-mobile";
import { toCalendarDate, fromCalendarDate } from "@/lib/date-convert";
import type { CalendarDate } from "@internationalized/date";
import { HeroSelectField } from "@/components/ui/hero-select";
import { createAvailabilityBlock, updateAvailabilityBlock } from "../actions";
import type { CalendarAvailabilityBlock } from "../actions";
import { BLOCK_REASONS } from "./calendar-helpers";

interface BlockRoomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Array<{ id: string; roomNumber: string; roomTypeName: string }>;
  prefillRoomId?: string;
  prefillStartDate?: Date;
  prefillEndDate?: Date;
  /** When set, the sheet edits this block instead of creating a new one. */
  editBlock?: CalendarAvailabilityBlock | null;
  /** Earliest bookable date (property business date) — the calendar blocks anything before it. */
  minDate?: Date;
  onSuccess?: () => void;
}

export function BlockRoomSheet({
  open,
  onOpenChange,
  rooms,
  prefillRoomId,
  prefillStartDate,
  prefillEndDate,
  editBlock,
  minDate,
  onSuccess,
}: BlockRoomSheetProps) {
  // Calendar spec: bottom sheet below the sm (640px) breakpoint.
  const isMobile = useIsCompactScreen();
  const isEditing = !!editBlock;
  const [selectedRoomId, setSelectedRoomId] = React.useState<string>("");
  const [dateRange, setDateRange] = React.useState<{ from?: Date; to?: Date } | undefined>(undefined);
  const [reason, setReason] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Initialize and apply pre-fill values when sheet opens or pre-fills change
  React.useEffect(() => {
    if (open) {
      // Deferred one tick: syncing state synchronously inside the effect body
      // forces a cascading second commit; the timeout lets the drawer's open
      // transition settle first.
      const timer = window.setTimeout(() => {
        if (editBlock) {
          // Stored range is half-open [start, end); the UI edits inclusive days.
          setSelectedRoomId(editBlock.roomId);
          setDateRange({ from: parseISO(editBlock.startDate), to: addDays(parseISO(editBlock.endDate), -1) });
          setReason(editBlock.reason ?? "");
          setNotes(editBlock.notes ?? "");
        } else {
          setSelectedRoomId(prefillRoomId || "");
          setDateRange(
            prefillStartDate || prefillEndDate
              ? { from: prefillStartDate, to: prefillEndDate ?? prefillStartDate }
              : undefined,
          );
          setReason("");
          setNotes("");
        }
        setErrors({});
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [open, prefillRoomId, prefillStartDate, prefillEndDate, editBlock]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!isEditing && !selectedRoomId) newErrors.roomId = "Room is required";
    if (!dateRange?.from || !dateRange?.to) {
      newErrors.dates = "Start and end dates are required";
    }
    if (!reason) newErrors.reason = "Reason is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    const startStr = format(dateRange!.from!, "yyyy-MM-dd");
    const endStr = format(dateRange!.to!, "yyyy-MM-dd");

    const result = isEditing
      ? await updateAvailabilityBlock(editBlock!.id, {
          startDate: startStr,
          endDate: endStr,
          reason,
          notes: notes.trim() || null,
        })
      : await createAvailabilityBlock(
          selectedRoomId,
          startStr,
          endStr,
          reason,
          notes.trim() || null
        );

    if (result.success) {
      toast.success(isEditing ? "Block updated" : "Room blocked successfully", {
        description: `Blocked from ${format(dateRange!.from!, "MMM dd")} to ${format(dateRange!.to!, "MMM dd, yyyy")}`,
      });
      setLoading(false);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } else {
      toast.danger(result.error || (isEditing ? "Failed to update block" : "Failed to block room"));
      setLoading(false);
    }
  };

  const calendarValue =
    dateRange?.from
      ? {
          start: toCalendarDate(dateRange.from),
          end: dateRange.to ? toCalendarDate(dateRange.to) : toCalendarDate(dateRange.from),
        }
      : null;

  return (
    <Drawer.Backdrop
      isOpen={open}
      onOpenChange={onOpenChange}
      variant="opaque"
      className="bg-black/40 dark:bg-black/60"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          aria-labelledby="block-room-title"
          className="flex h-[85dvh] max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-[0_-24px_80px_rgb(0_0_0/0.35)] md:h-dvh md:max-h-dvh md:w-[min(26rem,100vw)] md:rounded-none md:border-l md:border-border/70 md:shadow-[-24px_0_80px_rgb(0_0_0/0.18)]"
        >
          {isMobile && <Drawer.Handle className="mt-2.5 shrink-0" />}
          <Drawer.CloseTrigger className="absolute right-2 top-2 z-10 inline-flex size-11 items-center justify-center rounded-full bg-muted/70 text-muted-foreground shadow-xs backdrop-blur transition-all hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <Drawer.Header className="shrink-0 flex-col items-start gap-1.5 border-b border-border/50 px-5 pb-4 pr-14 pt-12">
              <Drawer.Heading id="block-room-title" className="text-section text-foreground">
                {isEditing ? "Edit Blocked Dates" : "Block Room Dates"}
              </Drawer.Heading>
              <p className="text-caption text-muted-foreground">
                {isEditing
                  ? "Adjust the dates, reason, or notes for this block."
                  : "Prevent reservations for maintenance, cleaning, or owner use."}
              </p>
            </Drawer.Header>

            <Drawer.Body className="min-h-0 flex-1 space-y-5 px-5 py-4">
              {/* Room Picker — read-only while editing: a block's room is part of
                  its identity; moving it means delete + recreate. */}
              <div>
                <p className="mb-1.5 text-label font-medium text-muted-foreground">Select Room</p>
                {isEditing ? (
                  <p className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm text-foreground">
                    Room {rooms.find((room) => room.id === editBlock!.roomId)?.roomNumber ?? "?"} ({rooms.find((room) => room.id === editBlock!.roomId)?.roomTypeName ?? ""})
                  </p>
                ) : (
                  <>
                    <HeroSelectField value={selectedRoomId} onValueChange={setSelectedRoomId} options={rooms.map((room) => ({value:room.id,label:`Room ${room.roomNumber} (${room.roomTypeName})`}))} placeholder="Choose room..." isInvalid={!!errors.roomId} ariaLabel="Room" />
                    {errors.roomId && (
                      <p className="mt-1 text-caption text-destructive">{errors.roomId}</p>
                    )}
                  </>
                )}
              </div>

              {/* Date Range */}
              <div>
                <p className="mb-1.5 text-label font-medium text-muted-foreground">Date Range</p>
                <div className="rounded-2xl border border-border/50 bg-background p-3">
                  <RangeCalendar
                    aria-label="Block date range"
                    firstDayOfWeek="mon"
                    minValue={toCalendarDate(minDate ?? new Date())}
                    value={calendarValue}
                    onChange={(range) => {
                      if (!range) {
                        setDateRange(undefined);
                        return;
                      }
                      const from = fromCalendarDate(range.start as CalendarDate);
                      const to = range.end ? fromCalendarDate(range.end as CalendarDate) : from;
                      setDateRange({ from, to });
                      setErrors((previous) => ({ ...previous, dates: "" }));
                    }}
                  >
                    <RangeCalendar.Header>
                      <RangeCalendar.NavButton slot="previous" />
                      <RangeCalendar.Heading />
                      <RangeCalendar.NavButton slot="next" />
                    </RangeCalendar.Header>
                    <RangeCalendar.Grid>
                      <RangeCalendar.GridHeader>
                        {(day) => (
                          <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>
                        )}
                      </RangeCalendar.GridHeader>
                      <RangeCalendar.GridBody>
                        {(date) => <RangeCalendar.Cell date={date} />}
                      </RangeCalendar.GridBody>
                    </RangeCalendar.Grid>
                  </RangeCalendar>
                </div>
                {dateRange?.from && dateRange?.to && (
                  <div className="mt-2 flex items-center gap-2 text-caption text-muted-foreground tabular-nums">
                    <CalendarIcon className="size-3" />
                    <span>
                      {format(dateRange.from, "MMM dd")} → {format(dateRange.to, "MMM dd, yyyy")}
                    </span>
                  </div>
                )}
                {errors.dates && (
                  <p className="mt-1 text-caption text-destructive">{errors.dates}</p>
                )}
              </div>

              {/* Reason */}
              <div>
                <p className="mb-1.5 text-label font-medium text-muted-foreground">Reason</p>
                <HeroSelectField value={reason} onValueChange={setReason} options={BLOCK_REASONS} placeholder="Choose reason..." isInvalid={!!errors.reason} ariaLabel="Block reason" />
                {errors.reason && (
                  <p className="mt-1 text-caption text-destructive">{errors.reason}</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="block-room-notes" className="mb-1.5 block text-label font-medium text-muted-foreground">
                  Internal Notes (Optional)
                </label>
                <TextArea
                  id="block-room-notes"
                  placeholder="Details about maintenance, service description, etc..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="min-h-20 resize-none rounded-xl border border-border/60 bg-background px-3 py-2 text-sm shadow-none"
                />
              </div>
            </Drawer.Body>

            <Drawer.Footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border/50 bg-muted/10 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5">
              <Button
                type="button"
                variant="outline"
                slot="close"
                onPress={() => onOpenChange(false)}
                isDisabled={loading}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isPending={loading}
                isDisabled={loading}
                className="rounded-xl px-5 font-semibold active:scale-[0.98]"
              >
                {loading ? "Saving…" : (isEditing ? "Save changes" : "Block dates")}
              </Button>
            </Drawer.Footer>
          </form>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
