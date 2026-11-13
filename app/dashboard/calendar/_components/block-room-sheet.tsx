"use client";

import * as React from "react";
import { addDays, format, parseISO } from "date-fns";
import { Drawer, RangeCalendar, TextArea, Button, toast } from "@heroui/react";
import { CalendarIcon } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { toCalendarDate, fromCalendarDate } from "@/lib/date-convert";
import { formatRoomLabel } from "@/lib/format";
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
  editBlock?: CalendarAvailabilityBlock | null;
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
  const isMobile = useIsMobile();
  const isEditing = !!editBlock;
  const [selectedRoomId, setSelectedRoomId] = React.useState<string>("");
  const [dateRange, setDateRange] = React.useState<{ from?: Date; to?: Date } | undefined>(
    undefined
  );
  const [reason, setReason] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        if (editBlock) {
          setSelectedRoomId(editBlock.roomId);
          setDateRange({
            from: parseISO(editBlock.startDate),
            to: addDays(parseISO(editBlock.endDate), -1),
          });
          setReason(editBlock.reason ?? "");
          setNotes(editBlock.notes ?? "");
        } else {
          setSelectedRoomId(prefillRoomId || "");
          setDateRange(
            prefillStartDate || prefillEndDate
              ? { from: prefillStartDate, to: prefillEndDate ?? prefillStartDate }
              : undefined
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
    if (!isEditing && !selectedRoomId) newErrors.roomId = "Select a room";
    if (!dateRange?.from || !dateRange?.to) {
      newErrors.dates = "Select start and end dates";
    }
    if (!reason) newErrors.reason = "Select a reason";

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
      toast.success(isEditing ? "Block updated" : "Room blocked", {
        description: `${format(dateRange!.from!, "MMM d")} – ${format(dateRange!.to!, "MMM d, yyyy")}`,
      });
      setLoading(false);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } else {
      toast.danger(result.error || (isEditing ? "Failed to update block" : "Failed to block room"));
      setLoading(false);
    }
  };

  const calendarValue = dateRange?.from
    ? {
        start: toCalendarDate(dateRange.from),
        end: dateRange.to ? toCalendarDate(dateRange.to) : toCalendarDate(dateRange.from),
      }
    : null;

  const editingRoom = isEditing ? rooms.find((room) => room.id === editBlock!.roomId) : null;

  return (
    <Drawer.Backdrop
      isOpen={open}
      onOpenChange={onOpenChange}
      variant="opaque"
      className="bg-black/40"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          aria-labelledby="block-room-title"
          className="flex h-[88dvh] max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl md:h-dvh md:max-h-dvh md:w-[min(25rem,100vw)] md:rounded-none md:border-l md:border-border/70"
        >
          {isMobile && <Drawer.Handle className="mt-3 shrink-0" />}
          <Drawer.CloseTrigger className="ui-press absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <Drawer.Header className="shrink-0 flex-row items-center justify-between border-b border-border/50 px-6 pb-4 pr-14 pt-6">
              <Drawer.Heading id="block-room-title" className="text-md font-semibold text-foreground">
                {isEditing ? "Edit room block" : "Block room dates"}
              </Drawer.Heading>
            </Drawer.Header>

            <Drawer.Body className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Room</p>
                {isEditing ? (
                  <p className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm font-medium text-foreground">
                    {formatRoomLabel(editingRoom?.roomNumber) ?? "Room"}
                    {editingRoom?.roomTypeName ? ` · ${editingRoom.roomTypeName}` : ""}
                  </p>
                ) : (
                  <>
                    <HeroSelectField
                      value={selectedRoomId}
                      onValueChange={setSelectedRoomId}
                      options={rooms.map((room) => ({
                        value: room.id,
                        label: `${formatRoomLabel(room.roomNumber) ?? room.roomNumber} · ${room.roomTypeName}`,
                      }))}
                      placeholder="Select room"
                      isInvalid={!!errors.roomId}
                      ariaLabel="Room"
                    />
                    {errors.roomId && (
                      <p className="mt-1 text-xs text-destructive">{errors.roomId}</p>
                    )}
                  </>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Dates</p>
                  {dateRange?.from && dateRange?.to && (
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-medium tabular-nums text-foreground">
                      <CalendarIcon className="size-3 text-muted-foreground" aria-hidden="true" />
                      {format(dateRange.from, "MMM d")} → {format(dateRange.to, "MMM d, yyyy")}
                    </span>
                  )}
                </div>
                <div className="flex justify-center rounded-2xl border border-border/60 bg-card p-3">
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
                        {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                      </RangeCalendar.GridHeader>
                      <RangeCalendar.GridBody>
                        {(date) => <RangeCalendar.Cell date={date} />}
                      </RangeCalendar.GridBody>
                    </RangeCalendar.Grid>
                  </RangeCalendar>
                </div>
                {errors.dates && <p className="mt-1 text-xs text-destructive">{errors.dates}</p>}
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Reason</p>
                <HeroSelectField
                  value={reason}
                  onValueChange={setReason}
                  options={BLOCK_REASONS}
                  placeholder="Select reason"
                  isInvalid={!!errors.reason}
                  ariaLabel="Block reason"
                />
                {errors.reason && <p className="mt-1 text-xs text-destructive">{errors.reason}</p>}
              </div>

              <div>
                <label
                  htmlFor="block-room-notes"
                  className="mb-2 block text-xs font-medium text-muted-foreground"
                >
                  Notes <span className="font-normal text-muted-foreground/70">(optional)</span>
                </label>
                <TextArea
                  id="block-room-notes"
                  placeholder="Maintenance or hold note…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="min-h-18 resize-none rounded-xl border border-border/60 bg-card px-3 py-2 text-base shadow-none sm:text-sm"
                />
              </div>
            </Drawer.Body>

            <Drawer.Footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border/50 bg-muted/10 px-6 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3">
              <Button
                type="button"
                variant="outline"
                slot="close"
                onPress={() => onOpenChange(false)}
                isDisabled={loading}
                className="ui-press h-10 rounded-xl text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isPending={loading}
                isDisabled={loading}
                className="ui-press h-10 rounded-xl px-4 text-xs font-semibold"
              >
                {loading ? "Saving…" : isEditing ? "Save changes" : "Block dates"}
              </Button>
            </Drawer.Footer>
          </form>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
