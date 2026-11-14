"use client";

import * as React from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { Drawer, Button, AlertDialog, toast } from "@heroui/react";
import { CalendarOff, LockOpen, Pencil, UserRound } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { deleteAvailabilityBlock, type CalendarAvailabilityBlock } from "../actions";
import { formatDateFull, formatRoomLabel } from "@/lib/format";
import { BLOCK_REASON_LABELS } from "./calendar-helpers";

interface BlockDetailDrawerProps {
  block: CalendarAvailabilityBlock | null;
  roomNumber: string;
  roomTypeName?: string;
  open: boolean;
  onClose: () => void;
  canUnblock: boolean;
  canEditBlocks: boolean;
  onEdit: (block: CalendarAvailabilityBlock) => void;
  /** The block leaves the rack before the server answers (optimistic). */
  onUnblockStart: (blockId: string) => void;
  /** The server answered: keep it removed, or put it back. */
  onUnblockEnd: (blockId: string, removed: boolean) => void;
}

export function BlockDetailDrawer({
  block,
  roomNumber,
  roomTypeName,
  open,
  onClose,
  canUnblock,
  canEditBlocks,
  onEdit,
  onUnblockStart,
  onUnblockEnd,
}: BlockDetailDrawerProps) {
  const isMobile = useIsMobile();
  const [confirming, setConfirming] = React.useState(false);
  const [unblocking, setUnblocking] = React.useState(false);
  const displayRoom = formatRoomLabel(roomNumber) ?? `Room ${roomNumber}`;

  const handleUnblock = async () => {
    if (!block || unblocking) return;
    const targetId = block.id;
    setUnblocking(true);
    setConfirming(false);
    onClose();
    onUnblockStart(targetId);
    try {
      const result = await deleteAvailabilityBlock(targetId);
      onUnblockEnd(targetId, result.success);
      if (result.success) toast.success(`${displayRoom} is available again`);
      else toast.danger(result.error || "Failed to remove block");
    } catch {
      onUnblockEnd(targetId, false);
      toast.danger("Failed to remove block. Check your connection and try again.");
    } finally {
      setUnblocking(false);
    }
  };

  const reasonLabel = block?.reason
    ? BLOCK_REASON_LABELS[block.reason] ?? block.reason.replaceAll("_", " ")
    : "Blocked";
  // end_date is stored exclusive (the first night the room is free again);
  // staff picked the last blocked night, so that is what the drawer shows.
  const lastNight = block ? format(addDays(parseISO(block.endDate), -1), "yyyy-MM-dd") : null;
  const nights = block
    ? Math.max(1, differenceInCalendarDays(parseISO(block.endDate), parseISO(block.startDate)))
    : 0;

  return (
    <Drawer.Backdrop
      isOpen={open && !!block}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      variant="opaque"
      className="bg-black/40"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog className="flex h-auto max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-background p-0 shadow-2xl md:h-dvh md:max-h-dvh md:w-[min(23rem,100vw)] md:rounded-none md:border-l md:border-border/60">
          {isMobile && <Drawer.Handle className="mt-3 shrink-0" />}
          <Drawer.CloseTrigger className="ui-press absolute right-4 top-4 z-30 grid size-10 place-items-center rounded-xl bg-muted/70 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />

          {block ? (
            <>
              <div className="flex items-start gap-4 border-b border-border/50 px-6 pb-4 pr-14 pt-6">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-700"
                >
                  <CalendarOff className="size-5" />
                </span>
                <div className="min-w-0">
                  <Drawer.Heading className="text-lg font-semibold leading-tight text-foreground">
                    {displayRoom}
                  </Drawer.Heading>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {reasonLabel}
                    {roomTypeName ? ` · ${roomTypeName}` : ""}
                  </p>
                </div>
              </div>

              <Drawer.Body className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
                <section
                  aria-label="Blocked dates"
                  className="rounded-2xl border border-border/60 bg-card p-4"
                >
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Blocked nights</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatDateFull(block.startDate)}
                    {lastNight !== block.startDate && (
                      <>
                        <span className="mx-2 text-muted-foreground/50">–</span>
                        {formatDateFull(lastNight)}
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {nights} {nights === 1 ? "night" : "nights"} · free again{" "}
                    {formatDateFull(block.endDate)}
                  </p>
                </section>

                <section
                  aria-label="Recorded by"
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"
                  >
                    <UserRound className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {block.createdByName || "Staff"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {block.createdAt ? formatDateFull(block.createdAt) : "Recorded block"}
                    </p>
                  </div>
                </section>

                {block.notes && (
                  <section
                    aria-label="Notes"
                    className="rounded-2xl border border-border/60 bg-card p-4"
                  >
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Notes</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {block.notes}
                    </p>
                  </section>
                )}
              </Drawer.Body>

              <Drawer.Footer className="shrink-0 border-t border-border/50 bg-muted/10 px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {canEditBlocks || canUnblock ? (
                  <div className="flex w-full gap-2">
                    {canEditBlocks && (
                      <Button
                        variant="outline"
                        onPress={() => {
                          onClose();
                          onEdit(block);
                        }}
                        className="ui-press h-11 flex-1 rounded-xl text-xs font-semibold"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        Edit
                      </Button>
                    )}
                    {canUnblock && (
                      <Button
                        variant="danger"
                        onPress={() => setConfirming(true)}
                        className="ui-press h-11 flex-1 rounded-xl text-xs font-semibold"
                      >
                        <LockOpen className="size-4" aria-hidden="true" />
                        Unblock
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="w-full text-center text-xs text-muted-foreground">
                    Managers and admins can remove blocks
                  </p>
                )}
              </Drawer.Footer>

              <AlertDialog.Backdrop
                variant="blur"
                isOpen={confirming}
                onOpenChange={(isOpen) => setConfirming(isOpen)}
              >
                <AlertDialog.Container placement="center" size="sm">
                  <AlertDialog.Dialog className="rounded-3xl border border-border/70 bg-card p-6 shadow-2xl sm:max-w-[380px]">
                    <AlertDialog.Header>
                      <AlertDialog.Heading className="text-base font-semibold text-foreground">
                        Unblock {displayRoom}?
                      </AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body className="py-2 text-sm text-muted-foreground">
                      <p>This room returns to sellable inventory immediately for these dates.</p>
                    </AlertDialog.Body>
                    <AlertDialog.Footer className="flex justify-end gap-2 pt-3">
                      <Button
                        slot="close"
                        variant="tertiary"
                        className="ui-press h-10 rounded-xl border border-border/70 bg-background px-4 text-xs font-semibold"
                      >
                        Keep block
                      </Button>
                      <Button
                        variant="danger"
                        onPress={handleUnblock}
                        className="ui-press h-10 rounded-xl px-4 text-xs font-semibold"
                      >
                        Unblock room
                      </Button>
                    </AlertDialog.Footer>
                  </AlertDialog.Dialog>
                </AlertDialog.Container>
              </AlertDialog.Backdrop>
            </>
          ) : null}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
