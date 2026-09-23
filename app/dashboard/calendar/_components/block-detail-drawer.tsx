"use client";

import * as React from "react";
import { Drawer, Button, AlertDialog, toast } from "@heroui/react";
import {
  CalendarOff,
  Clock3,
  Hammer,
  KeyRound,
  LockOpen,
  NotebookPen,
  Pencil,
  UserRound,
} from "lucide-react";

import { useIsCompactScreen } from "@/hooks/use-mobile";
import { deleteAvailabilityBlock, type CalendarAvailabilityBlock } from "../actions";
import { formatDateFull } from "@/lib/format";
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
  onUnblocked: () => void;
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
  onUnblocked,
}: BlockDetailDrawerProps) {
  const isMobile = useIsCompactScreen();
  const [confirming, setConfirming] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  const handleUnblock = async () => {
    if (!block) return;
    setConfirming(false);
    setRemoving(true);
    const result = await deleteAvailabilityBlock(block.id);
    setRemoving(false);
    if (result.success) {
      toast.success(`Room ${roomNumber} is available again`);
      onUnblocked();
      onClose();
    } else {
      toast.danger(result.error || "Failed to remove block");
    }
  };

  const reasonLabel = block?.reason
    ? BLOCK_REASON_LABELS[block.reason] ?? block.reason.replaceAll("_", " ")
    : "Blocked";

  return (
    <Drawer.Backdrop
      isOpen={open && !!block}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      variant="opaque"
      className="bg-black/40 dark:bg-black/60"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          className={`
            flex w-full flex-col overflow-hidden rounded-t-3xl bg-background p-0 shadow-[0_-24px_80px_rgb(0_0_0/0.35)]
            h-auto max-h-[92dvh]
            md:h-dvh md:max-h-dvh md:w-[min(24rem,100vw)] md:rounded-none
            md:border-l md:border-border/60 md:shadow-[-32px_0_90px_rgb(0_0_0/0.16)]
          `}
        >
          {isMobile && <Drawer.Handle className="mt-2.5 shrink-0" />}
          <Drawer.CloseTrigger
            className="
              absolute right-3 top-3 z-30 grid size-11 place-items-center rounded-full
              bg-muted/70 text-muted-foreground shadow-xs backdrop-blur transition-all
              hover:bg-muted hover:text-foreground active:scale-95
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
            "
          />

          {block ? (
            <>
              {/* ═══ Hero ═══ */}
              <div className="px-5 pb-5 pt-12 md:pt-14">
                <span
                  aria-hidden
                  className="mb-3.5 grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400"
                >
                  <CalendarOff className="size-6" />
                </span>
                <Drawer.Heading className="text-xl font-bold tracking-tight text-foreground">
                  Room {roomNumber}
                  <span className="mt-1 block text-sm font-medium capitalize text-muted-foreground">
                    Blocked · {reasonLabel}
                    {roomTypeName ? ` · ${roomTypeName}` : ""}
                  </span>
                </Drawer.Heading>
              </div>

              <Drawer.Body className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                {/* ── Dates ─────────────────────────────────────── */}
                <section
                  aria-label="Blocked dates"
                  className="rounded-2xl border border-border/60 bg-card p-4"
                >
                  <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    <Clock3 className="size-3" />
                    Dates out of inventory
                  </p>
                  <p className="tabular-nums text-sm font-semibold text-foreground">
                    {formatDateFull(block.startDate)}
                    <span className="mx-2 text-muted-foreground/40">→</span>
                    {formatDateFull(block.endDate)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Guests cannot be booked into this room for these nights.
                  </p>
                </section>

                {/* ── Blocked by ────────────────────────────────── */}
                <section
                  aria-label="Blocked by"
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4"
                >
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-primary ring-1 ring-primary/15"
                  >
                    <UserRound className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {block.createdByName || "Unknown staff"}
                    </p>
                    <p className="text-[11px] capitalize text-muted-foreground">
                      Blocked by{block.createdAt ? ` · ${formatDateFull(block.createdAt)}` : ""}
                    </p>
                  </div>
                  <KeyRound aria-hidden className="size-4 shrink-0 text-muted-foreground/40" />
                </section>

                {/* ── Reason + notes ────────────────────────────── */}
                {(block.reason || block.notes) && (
                  <section aria-label="Details" className="space-y-2.5">
                    {block.notes && (
                      <div className="rounded-2xl border border-border/60 bg-card p-4">
                        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                          <NotebookPen className="size-3" />
                          Notes
                        </p>
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                          {block.notes}
                        </p>
                      </div>
                    )}
                    {block.reason && !BLOCK_REASON_LABELS[block.reason] && (
                      <div className="flex items-center gap-2 px-1 text-[11px] capitalize text-muted-foreground">
                        <Hammer className="size-3" />
                        Category: {block.reason.replaceAll("_", " ")}
                      </div>
                    )}
                  </section>
                )}
              </Drawer.Body>

              {/* ═══ Footer action ═══ */}
              <Drawer.Footer className="shrink-0 border-t border-border/50 bg-muted/[0.15] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
                {canEditBlocks || canUnblock ? (
                  <div className="flex w-full gap-2">
                    {canEditBlocks && (
                      <Button
                        variant="outline"
                        onPress={() => {
                          if (block) {
                            onClose();
                            onEdit(block);
                          }
                        }}
                        isDisabled={removing}
                        className="h-11 flex-1 rounded-xl text-[13px] font-semibold"
                      >
                        <Pencil className="size-4" />
                        Edit block
                      </Button>
                    )}
                    {canUnblock && (
                      <Button
                        onPress={() => setConfirming(true)}
                        isDisabled={removing}
                        className="h-11 flex-1 rounded-xl bg-red-600 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 active:scale-[0.99]"
                      >
                        <LockOpen className="size-4" />
                        Unblock room
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="w-full text-center text-[11px] text-muted-foreground">
                    Only managers and super admins can remove blocks.
                  </p>
                )}
              </Drawer.Footer>

              {/* Confirm dialog */}
              <AlertDialog.Backdrop
                isOpen={confirming}
                onOpenChange={(isOpen) => setConfirming(isOpen)}
                variant="opaque"
              >
                <AlertDialog.Container placement="auto" size="sm">
                  <AlertDialog.Dialog className="rounded-2xl border border-border/70 bg-card p-6 shadow-2xl">
                    <AlertDialog.Header>
                      <AlertDialog.Icon status="danger" />
                      <AlertDialog.Heading>Unblock Room {roomNumber}?</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                      <p>
                        The room returns to sellable inventory immediately and can accept new
                        reservations for these dates.
                      </p>
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                      <Button slot="close" variant="tertiary" isDisabled={removing}>
                        Keep block
                      </Button>
                      <Button variant="danger" isPending={removing} onPress={handleUnblock}>
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
