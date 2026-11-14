"use client";

import * as React from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  Alert,
  Button,
  Description,
  Drawer,
  Input,
  Label,
  RangeCalendar,
  Spinner,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";

import { useIsMobile } from "@/hooks/use-mobile";
import { toCalendarDate, fromCalendarDate } from "@/lib/date-convert";
import { formatRoomLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { createAvailabilityBlock, updateAvailabilityBlock } from "../actions";
import type { CalendarAvailabilityBlock } from "../actions";
import { BLOCK_REASONS, BLOCK_REASON_LABELS } from "./calendar-helpers";

interface BlockRoomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Array<{ id: string; roomNumber: string; roomTypeName: string }>;
  prefillRoomId?: string;
  prefillStartDate?: Date;
  prefillEndDate?: Date;
  editBlock?: CalendarAvailabilityBlock | null;
  minDate?: Date;
  /** Called after the server saved the block, with what was saved. */
  onSuccess?: (result: BlockSheetResult) => void;
}

export interface BlockSheetResult {
  mode: "create" | "update";
  /** The edited block's id; null for a new block (the server returns none). */
  blockId: string | null;
  roomId: string;
  /** First blocked night, yyyy-MM-dd. */
  startDate: string;
  /** Last blocked night (inclusive), yyyy-MM-dd. */
  lastNight: string;
  reason: string;
  notes: string | null;
}

/** Mirrors the availability_blocks_notes_length CHECK constraint. */
const NOTES_MAX = 2000;
/** The counter appears only near the limit; below it, it is noise. */
const NOTES_COUNTER_FROM = 1600;
/** Mirrors blockReasonParam and the availability_blocks_reason_length CHECK. */
const REASON_MAX = 50;
const REASON_COUNTER_FROM = 40;

const REASON_OPTIONS = BLOCK_REASONS.map(({ value, label }) => ({ value, label }));
const PRESET_REASONS: ReadonlySet<string> = new Set(BLOCK_REASONS.map(({ value }) => value));

/** Puts a stored reason back into the form: a preset selects itself, and
 *  anything else is a typed reason under "Other". */
function reasonFields(stored: string | null): { reason: string; customReason: string } {
  if (!stored) return { reason: "", customReason: "" };
  if (PRESET_REASONS.has(stored)) return { reason: stored, customReason: "" };
  if (stored === "cleaning") return { reason: "deep_cleaning", customReason: "" };
  return { reason: "other", customReason: BLOCK_REASON_LABELS[stored] ?? stored };
}

type FieldErrors = Partial<Record<"room" | "nights" | "reason", string>>;

const FIELD_LABEL = "text-sm font-medium text-foreground";
const FIELD_HINT = "text-xs text-muted-foreground";
const FIELD_ERROR = "text-xs font-medium text-destructive";

/** "Nov 14", "Nov 14 – 16", "Nov 28 – Dec 2", "Dec 30 – Jan 2, 2027". */
function formatNights(from: Date, to: Date): string {
  if (from.getTime() === to.getTime()) return format(from, "EEE, MMM d");
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();
  if (!sameYear) return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;
  return `${format(from, "MMM d")} – ${format(to, sameMonth ? "d" : "MMM d")}`;
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
  const [dateRange, setDateRange] = React.useState<{ from: Date; to: Date } | null>(null);
  const [reason, setReason] = React.useState<string>("");
  const [customReason, setCustomReason] = React.useState<string>("");
  const customReasonRef = React.useRef<HTMLInputElement>(null);
  const [notes, setNotes] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    // Deferred one tick so the reset never runs inside the opening render.
    const timer = window.setTimeout(() => {
      if (editBlock) {
        setSelectedRoomId(editBlock.roomId);
        setDateRange({
          from: parseISO(editBlock.startDate),
          to: addDays(parseISO(editBlock.endDate), -1),
        });
        const fields = reasonFields(editBlock.reason);
        setReason(fields.reason);
        setCustomReason(fields.customReason);
        setNotes(editBlock.notes ?? "");
      } else {
        setSelectedRoomId(prefillRoomId || "");
        const from = prefillStartDate ?? prefillEndDate;
        const to = prefillEndDate ?? prefillStartDate;
        setDateRange(from && to ? { from, to } : null);
        setReason("");
        setCustomReason("");
        setNotes("");
      }
      setErrors({});
      setSubmitError(null);
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, prefillRoomId, prefillStartDate, prefillEndDate, editBlock]);

  const roomId = isEditing ? editBlock!.roomId : selectedRoomId;
  const room = rooms.find((item) => item.id === roomId);
  const roomLabel = room ? formatRoomLabel(room.roomNumber) ?? room.roomNumber : null;
  const nights = dateRange ? differenceInCalendarDays(dateRange.to, dateRange.from) + 1 : 0;

  // An ongoing block keeps its first night selectable while it is edited; the
  // server accepts past nights, only a new block starts no earlier than today.
  const earliest = React.useMemo(() => {
    const floor = minDate ?? new Date();
    if (!editBlock) return floor;
    const start = parseISO(editBlock.startDate);
    return start < floor ? start : floor;
  }, [editBlock, minDate]);

  /** Any edit clears the server's last answer and the error on that field. */
  const touch = (field?: keyof FieldErrors) => {
    setSubmitError(null);
    if (field) setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!roomId) next.room = "Choose a room";
    if (!dateRange) next.nights = "Pick the nights to block";
    if (!reason) next.reason = "Choose a reason";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !validate() || !dateRange) return;

    setLoading(true);
    setSubmitError(null);

    const startStr = format(dateRange.from, "yyyy-MM-dd");
    const endStr = format(dateRange.to, "yyyy-MM-dd");
    const trimmedNotes = notes.trim() || null;
    // Under "Other", the typed text is the reason the calendar shows. Left
    // empty, the block is saved as plain "Other".
    const storedReason = reason === "other" ? customReason.trim() || "other" : reason;

    let result: { success: boolean; error?: string };
    try {
      result = isEditing
        ? await updateAvailabilityBlock(editBlock!.id, {
            startDate: startStr,
            endDate: endStr,
            reason: storedReason,
            notes: trimmedNotes,
          })
        : await createAvailabilityBlock(roomId, startStr, endStr, storedReason, trimmedNotes);
    } catch {
      result = { success: false, error: "Couldn't reach the server. Check your connection and try again." };
    }

    setLoading(false);
    if (!result.success) {
      // Kept in the sheet, next to the fields that need changing, until the
      // next edit. A toast would vanish before the reason is read.
      setSubmitError(
        result.error || (isEditing ? "Couldn't save the block. Try again." : "Couldn't block the room. Try again.")
      );
      return;
    }

    const nightsText = `${nights} ${nights === 1 ? "night" : "nights"}`;
    toast.success(
      isEditing ? "Block updated" : `${roomLabel ?? "Room"} blocked`,
      { description: `${formatNights(dateRange.from, dateRange.to)} · ${nightsText}` }
    );
    onOpenChange(false);
    onSuccess?.({
      mode: isEditing ? "update" : "create",
      blockId: isEditing ? editBlock!.id : null,
      roomId,
      startDate: startStr,
      lastNight: endStr,
      reason: storedReason,
      notes: trimmedNotes,
    });
  };

  const calendarValue = dateRange
    ? { start: toCalendarDate(dateRange.from), end: toCalendarDate(dateRange.to) }
    : null;

  const submitLabel = loading
    ? isEditing
      ? "Saving…"
      : "Blocking…"
    : isEditing
      ? "Save changes"
      : nights > 0
        ? `Block ${nights} ${nights === 1 ? "night" : "nights"}`
        : "Block dates";

  return (
    <Drawer.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!loading) onOpenChange(next);
      }}
      variant="opaque"
      className="bg-black/40"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          aria-labelledby="block-room-title"
          className="flex h-[90dvh] max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-background p-0 shadow-2xl md:h-dvh md:max-h-dvh md:w-[min(26rem,100vw)] md:rounded-none md:border-l md:border-border/70"
        >
          {isMobile && <Drawer.Handle className="mt-3 shrink-0" />}
          <Drawer.CloseTrigger
            className="ui-press absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted"
          />

          <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            <Drawer.Header className="shrink-0 flex-col items-start gap-1 border-b border-border/60 px-6 pb-4 pr-16 pt-6">
              <Drawer.Heading id="block-room-title" className="text-lg font-semibold text-foreground">
                {isEditing ? "Edit block" : "Block dates"}
              </Drawer.Heading>
              <p className="text-sm text-muted-foreground">
                {isEditing && room
                  ? `${roomLabel} · ${room.roomTypeName}`
                  : "The room can't be booked on the nights you pick."}
              </p>
            </Drawer.Header>

            <Drawer.Body className="m-0 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-6">
              {!isEditing && (
                <section className="space-y-2">
                  <HeroSelectField
                    label={<span className={FIELD_LABEL}>Room</span>}
                    ariaLabel="Room"
                    value={selectedRoomId}
                    onValueChange={(value) => {
                      setSelectedRoomId(value);
                      touch("room");
                    }}
                    options={rooms.map((item) => ({
                      value: item.id,
                      label: `${formatRoomLabel(item.roomNumber) ?? item.roomNumber} · ${item.roomTypeName}`,
                    }))}
                    placeholder="Choose a room"
                    isInvalid={!!errors.room}
                    isDisabled={loading}
                    triggerClassName="max-md:min-h-11"
                  />
                  {errors.room && (
                    <p role="alert" className={FIELD_ERROR}>
                      {errors.room}
                    </p>
                  )}
                </section>
              )}

              <section className="space-y-2" aria-labelledby="block-nights-label">
                <div className="flex items-baseline justify-between gap-3">
                  <span id="block-nights-label" className={FIELD_LABEL}>
                    Nights
                  </span>
                  {dateRange && (
                    <span className="text-sm font-medium tabular-nums text-foreground">
                      {nights} {nights === 1 ? "night" : "nights"}
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "flex justify-center rounded-2xl border bg-card px-2 py-3 transition-colors duration-150",
                    errors.nights ? "border-destructive/50" : "border-border/60"
                  )}
                >
                  <RangeCalendar
                    aria-labelledby="block-nights-label"
                    firstDayOfWeek="mon"
                    minValue={toCalendarDate(earliest)}
                    value={calendarValue}
                    isDisabled={loading}
                    onChange={(range) => {
                      touch("nights");
                      if (!range) {
                        setDateRange(null);
                        return;
                      }
                      const from = fromCalendarDate(range.start as CalendarDate);
                      const to = range.end ? fromCalendarDate(range.end as CalendarDate) : from;
                      setDateRange({ from, to });
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
                        {(date) => <RangeCalendar.Cell date={date} className="data-[disabled=true]:no-underline" />}
                      </RangeCalendar.GridBody>
                    </RangeCalendar.Grid>
                  </RangeCalendar>
                </div>
                {errors.nights ? (
                  <p role="alert" className={FIELD_ERROR}>
                    {errors.nights}
                  </p>
                ) : dateRange ? (
                  <p className={cn(FIELD_HINT, "tabular-nums")}>
                    {formatNights(dateRange.from, dateRange.to)}
                    <span className="text-muted-foreground/70">
                      {" "}
                      · bookable again {format(addDays(dateRange.to, 1), "EEE, MMM d")}
                    </span>
                  </p>
                ) : (
                  <p className={FIELD_HINT}>Tap the first and last night. Tap one date twice for a single night.</p>
                )}
              </section>

              <section className="space-y-2">
                <HeroSelectField
                  label={<span className={FIELD_LABEL}>Reason</span>}
                  ariaLabel="Reason"
                  value={reason}
                  onValueChange={(value) => {
                    const openedOther = value === "other" && reason !== "other";
                    setReason(value);
                    touch("reason");
                    // Choosing Other means there is something to describe. On
                    // a phone the field sits in view; focusing it would throw
                    // the keyboard over the sheet uninvited.
                    if (openedOther && !isMobile) {
                      window.requestAnimationFrame(() => customReasonRef.current?.focus());
                    }
                  }}
                  options={REASON_OPTIONS}
                  placeholder="Choose a reason"
                  isInvalid={!!errors.reason}
                  isDisabled={loading}
                  triggerClassName="max-md:min-h-11"
                />
                {errors.reason && (
                  <p role="alert" className={FIELD_ERROR}>
                    {errors.reason}
                  </p>
                )}
                {reason === "other" && (
                  <TextField
                    value={customReason}
                    onChange={(value) => {
                      setCustomReason(value);
                      touch();
                    }}
                    isDisabled={loading}
                    className="w-full gap-2 duration-150 ease-out animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none"
                  >
                    <Label className="sr-only">Describe the reason</Label>
                    <Input
                      ref={customReasonRef}
                      maxLength={REASON_MAX}
                      placeholder="Describe it in a few words"
                      className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm shadow-none max-md:h-11 max-md:text-base"
                    />
                    <Description className={cn(FIELD_HINT, "flex justify-between gap-3")}>
                      <span>Optional. Shown on the calendar instead of “Other”.</span>
                      {customReason.length >= REASON_COUNTER_FROM && (
                        <span className="tabular-nums">
                          {customReason.length} / {REASON_MAX}
                        </span>
                      )}
                    </Description>
                  </TextField>
                )}
              </section>

              <TextField
                value={notes}
                onChange={(value) => {
                  setNotes(value);
                  touch();
                }}
                isDisabled={loading}
                className="w-full gap-2"
              >
                <Label className={cn(FIELD_LABEL, "flex items-baseline gap-2")}>
                  Notes
                  <span className="text-xs font-normal text-muted-foreground">Optional</span>
                </Label>
                <TextArea
                  rows={3}
                  maxLength={NOTES_MAX}
                  placeholder="What's being done, and anything the team should know"
                  className="w-full resize-none rounded-xl border border-border/60 bg-background text-sm leading-6 shadow-none max-md:text-base"
                />
                <Description className={cn(FIELD_HINT, "flex justify-between gap-3")}>
                  <span>Only staff see this.</span>
                  {notes.length >= NOTES_COUNTER_FROM && (
                    <span className="tabular-nums">
                      {notes.length.toLocaleString()} / {NOTES_MAX.toLocaleString()}
                    </span>
                  )}
                </Description>
              </TextField>
            </Drawer.Body>

            <Drawer.Footer className="m-0 flex shrink-0 flex-col items-stretch gap-3 border-t border-border/60 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              {/* The server's answer sits next to the button that asked, so it
                  is always in view; it clears on the next edit. */}
              {submitError && (
                <Alert
                  status="danger"
                  className="duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
                >
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{isEditing ? "Couldn't save the block" : "Couldn't block these nights"}</Alert.Title>
                    <Alert.Description>{submitError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="tertiary"
                  onPress={() => onOpenChange(false)}
                  isDisabled={loading}
                  className="max-md:h-11 max-md:flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isPending={loading}
                  className="min-w-32 font-semibold max-md:h-11 max-md:flex-1"
                >
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner size="sm" color="current" />}
                      {submitLabel}
                    </>
                  )}
                </Button>
              </div>
            </Drawer.Footer>
          </form>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
