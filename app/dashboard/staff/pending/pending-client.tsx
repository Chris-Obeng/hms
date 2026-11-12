"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { Check, X, Clock, Mail, Shield } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDate, getInitials } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { approveStaff, rejectStaff } from "@/app/actions/staff";

export interface PendingStaffRow {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string | null;
}

interface PendingStaffClientProps {
  data: PendingStaffRow[];
}

const ROLE_OPTIONS = [
  {
    value: "front_desk" as const,
    label: "Front desk",
    desc: "Manage bookings, check-in/out, and guest profiles",
  },
  {
    value: "manager" as const,
    label: "Manager",
    desc: "Full operational access including rooms and rates",
  },
  {
    value: "read_only" as const,
    label: "Read only",
    desc: "View bookings, guests, and reports only",
  },
];

export function PendingStaffClient({ data }: PendingStaffClientProps) {
  const router = useRouter();
  const [localData, setLocalData] = React.useState(data);
  const [syncedData, setSyncedData] = React.useState(data);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(() => new Set());
  const [approveRole, setApproveRole] = React.useState<"front_desk" | "manager" | "read_only">(
    "front_desk"
  );
  const [approveDialogOpen, setApproveDialogOpen] = React.useState(false);
  const [approveTarget, setApproveTarget] = React.useState<PendingStaffRow | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
  const [rejectTarget, setRejectTarget] = React.useState<PendingStaffRow | null>(null);
  const radioRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  // Re-sync when the server sends fresh rows after `router.refresh()`, preserving
  // any in-flight optimistic removals so concurrent actions never flicker back.
  if (data !== syncedData) {
    setSyncedData(data);
    setLocalData(data.filter((s) => !pendingIds.has(s.id)));
  }

  const restoreFailedRow = React.useCallback((row: PendingStaffRow) => {
    setLocalData((prev) => (prev.some((s) => s.id === row.id) ? prev : [...prev, row]));
  }, []);

  const handleApprove = async () => {
    if (!approveTarget || pendingIds.has(approveTarget.id)) return;
    const target = approveTarget;
    const chosenRole = approveRole;
    setApproveDialogOpen(false);
    setApproveTarget(null);
    setPendingIds((prev) => new Set(prev).add(target.id));
    setLocalData((prev) => prev.filter((s) => s.id !== target.id));

    try {
      const result = await approveStaff(target.id, chosenRole);
      if (result.success) {
        toast.success(
          `${target.fullName || "Staff member"} approved as ${chosenRole.replace(/_/g, " ")}`
        );
        router.refresh();
      } else {
        restoreFailedRow(target);
        toast.danger(result.error || "Failed to approve");
      }
    } catch {
      restoreFailedRow(target);
      toast.danger("Failed to approve — check your connection and try again");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || pendingIds.has(rejectTarget.id)) return;
    const target = rejectTarget;
    setRejectDialogOpen(false);
    setRejectTarget(null);
    setPendingIds((prev) => new Set(prev).add(target.id));
    setLocalData((prev) => prev.filter((s) => s.id !== target.id));

    try {
      const result = await rejectStaff(target.id);
      if (result.success) {
        toast.success(`${target.fullName || "Staff member"} rejected`);
        router.refresh();
      } else {
        restoreFailedRow(target);
        toast.danger(result.error || "Failed to reject");
      }
    } catch {
      restoreFailedRow(target);
      toast.danger("Failed to reject — check your connection and try again");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    }
  };

  const handleRoleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = ROLE_OPTIONS.findIndex((o) => o.value === approveRole);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % ROLE_OPTIONS.length;
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + ROLE_OPTIONS.length) % ROLE_OPTIONS.length;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      setApproveRole(ROLE_OPTIONS[nextIndex].value);
      radioRefs.current[nextIndex]?.focus();
    }
  };

  if (localData.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted/30">
          <Shield className="size-6 text-muted-foreground/30" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">No pending requests</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          All staff access requests have been reviewed.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {localData.map((staff) => {
          const busy = pendingIds.has(staff.id);
          return (
            <div
              key={staff.id}
              className="space-y-4 rounded-[20px] border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgb(0_0_0/0.04)]"
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <Avatar className="size-10 rounded-lg">
                  <AvatarImage src={staff.avatarUrl || undefined} alt={staff.fullName || ""} />
                  <AvatarFallback className="rounded-lg bg-muted text-sm font-medium">
                    {getInitials(staff.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {staff.fullName || "Unnamed"}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{staff.email}</span>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 border-amber-300 bg-amber-50 text-[11px] text-amber-700"
                >
                  <Clock className="mr-1 size-3" aria-hidden="true" />
                  Pending
                </Badge>
              </div>

              {/* Meta */}
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Registered {formatDate(staff.createdAt, "MMM d, yyyy 'at' h:mm a")}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="ui-press h-11 flex-1 rounded-xl bg-emerald-600 text-xs font-semibold text-white sm:h-9 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-emerald-700"
                  onClick={() => {
                    setApproveTarget(staff);
                    setApproveRole("front_desk");
                    setApproveDialogOpen(true);
                  }}
                  disabled={busy}
                >
                  <Check className="mr-1 size-3.5" aria-hidden="true" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="ui-press h-11 flex-1 rounded-xl border-destructive/30 text-xs font-semibold text-destructive sm:h-9 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-destructive/5"
                  onClick={() => {
                    setRejectTarget(staff);
                    setRejectDialogOpen(true);
                  }}
                  disabled={busy}
                >
                  <X className="mr-1 size-3.5" aria-hidden="true" />
                  Reject
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve staff access</DialogTitle>
            <DialogDescription>
              Grant <strong>{approveTarget?.fullName || "this person"}</strong> access to the hotel
              dashboard. Choose their role:
            </DialogDescription>
          </DialogHeader>
          <div
            role="radiogroup"
            aria-label="Staff role"
            onKeyDown={handleRoleKeyDown}
            className="space-y-2 py-2"
          >
            {ROLE_OPTIONS.map((opt, idx) => {
              const selected = approveRole === opt.value;
              return (
                <button
                  key={opt.value}
                  ref={(el) => {
                    radioRefs.current[idx] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setApproveRole(opt.value)}
                  className={cn(
                    "ui-press flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary bg-primary/[0.06] ring-1 ring-primary/20"
                      : "border-border/60 [@media(hover:hover)_and_(pointer:fine)]:hover:border-border"
                  )}
                >
                  <div
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                      selected ? "border-primary" : "border-muted-foreground/30"
                    )}
                  >
                    {selected && <div className="size-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="ui-press h-11 rounded-xl text-xs sm:h-10"
              onClick={() => setApproveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="ui-press h-11 rounded-xl bg-primary text-xs font-semibold text-primary-foreground sm:h-10 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-primary/90"
              onClick={() => void handleApprove()}
            >
              Grant access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject access request</DialogTitle>
            <DialogDescription>
              Reject <strong>{rejectTarget?.fullName || "this person"}</strong>? This permanently
              removes their access request.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="ui-press h-11 rounded-xl text-xs sm:h-10"
              onClick={() => setRejectDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="ui-press h-11 rounded-xl bg-destructive text-xs font-semibold text-destructive-foreground sm:h-10 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-destructive/90"
              onClick={() => void handleReject()}
            >
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
