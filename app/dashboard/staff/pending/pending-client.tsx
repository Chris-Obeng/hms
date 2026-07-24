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

// ── Types ──────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────

export function PendingStaffClient({ data }: PendingStaffClientProps) {
  const router = useRouter();
  const [localData, setLocalData] = React.useState(data);
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [approveRole, setApproveRole] = React.useState<"front_desk" | "manager" | "read_only">("front_desk");
  const [approveDialogOpen, setApproveDialogOpen] = React.useState(false);
  const [approveTarget, setApproveTarget] = React.useState<PendingStaffRow | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
  const [rejectTarget, setRejectTarget] = React.useState<PendingStaffRow | null>(null);

  React.useEffect(() => {
    setLocalData(data);
  }, [data]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setLoadingId(approveTarget.id);
    const result = await approveStaff(approveTarget.id, approveRole);
    setLoadingId(null);
    setApproveDialogOpen(false);

    if (result.success) {
      setLocalData((prev) => prev.filter((s) => s.id !== approveTarget.id));
      toast.success(`${approveTarget.fullName || "Staff member"} approved as ${approveRole.replace(/_/g, " ")}`);
      router.refresh();
    } else {
      toast.danger(result.error || "Failed to approve");
    }
    setApproveTarget(null);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setLoadingId(rejectTarget.id);
    const result = await rejectStaff(rejectTarget.id);
    setLoadingId(null);
    setRejectDialogOpen(false);

    if (result.success) {
      setLocalData((prev) => prev.filter((s) => s.id !== rejectTarget.id));
      toast.success(`${rejectTarget.fullName || "Staff member"} rejected`);
      router.refresh();
    } else {
      toast.danger(result.error || "Failed to reject");
    }
    setRejectTarget(null);
  };

  if (localData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-6">
        <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
          <Shield className="size-6 text-muted-foreground/30" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">No pending requests</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          All staff access requests have been reviewed.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {localData.map((staff) => (
          <div
            key={staff.id}
            className="rounded-xl border border-border/60 bg-card p-5 space-y-4 shadow-sm"
          >
            {/* Header */}
            <div className="flex items-start gap-3">
              <Avatar className="size-10 rounded-lg">
                <AvatarImage src={staff.avatarUrl || undefined} alt={staff.fullName || ""} />
                <AvatarFallback className="text-sm font-medium rounded-lg bg-muted">
                  {getInitials(staff.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">
                  {staff.fullName || "Unnamed"}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  <Mail className="size-3" />
                  <span className="truncate">{staff.email}</span>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 shrink-0">
                <Clock className="size-2.5 mr-1" />
                Pending
              </Badge>
            </div>

            {/* Meta */}
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Registered: {formatDate(staff.createdAt, "MMM d, yyyy 'at' h:mm a")}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1 rounded-lg text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  setApproveTarget(staff);
                  setApproveRole("front_desk");
                  setApproveDialogOpen(true);
                }}
                disabled={loadingId === staff.id}
              >
                <Check className="size-3 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 rounded-lg text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => {
                  setRejectTarget(staff);
                  setRejectDialogOpen(true);
                }}
                disabled={loadingId === staff.id}
              >
                <X className="size-3 mr-1" />
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Staff Access</DialogTitle>
            <DialogDescription>
              Grant <strong>{approveTarget?.fullName || "this person"}</strong> access to the hotel dashboard.
              Choose their role:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {[
              { value: "front_desk", label: "Front Desk", desc: "Manage bookings, check-in/out, view guests" },
              { value: "manager", label: "Manager", desc: "Full operational access except staff & settings" },
              { value: "read_only", label: "Read Only", desc: "View bookings, guests, and reports only" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setApproveRole(opt.value as typeof approveRole)}
                className={cn(
                  "flex items-start gap-3 w-full rounded-lg border p-3 text-left transition-all",
                  approveRole === opt.value
                    ? "border-foreground bg-foreground/5"
                    : "border-border/60 hover:border-border"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 size-4 rounded-full border-2 flex items-center justify-center shrink-0",
                    approveRole === opt.value
                      ? "border-foreground"
                      : "border-muted-foreground/30"
                  )}
                >
                  {approveRole === opt.value && (
                    <div className="size-2 rounded-full bg-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs"
              onClick={() => setApproveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-lg text-xs bg-foreground text-background hover:bg-foreground/90"
              onClick={handleApprove}
            >
              Grant Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Access Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject{" "}
              <strong>{rejectTarget?.fullName || "this person"}</strong>?
              This will permanently remove their access request.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs"
              onClick={() => setRejectDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-lg text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReject}
            >
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
