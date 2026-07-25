"use client";

import * as React from "react";
import {
  Moon,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  BedDouble,
  ShieldCheck,
  CalendarDays,
  FileSpreadsheet,
} from "lucide-react";
import { Button, Card, Chip, Modal } from "@heroui/react";
import { toast } from "@heroui/react";
import { NightAuditSummary, executeNightAudit } from "./actions";
import { formatCurrencyCompact } from "@/lib/format";

interface NightAuditClientProps {
  initialSummary: NightAuditSummary;
}

export function NightAuditClient({ initialSummary }: NightAuditClientProps) {
  const [summary, setSummary] = React.useState<NightAuditSummary>(initialSummary);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = React.useState(false);
  const [auditNotes, setAuditNotes] = React.useState("");

  const handleRunAudit = async () => {
    try {
      setIsExecuting(true);
      const res = await executeNightAudit(summary.auditDate, auditNotes);
      if (res.success) {
        toast.success(res.message);
        setSummary((prev) => ({ ...prev, isClosed: true }));
        setConfirmModalOpen(false);
      }
    } catch (err: any) {
      toast.danger(err.message || "Failed to complete Night Audit");
    } finally {
      setIsExecuting(false);
    }
  };

  const hasUnresolved = summary.unresolvedBookings.length > 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center ring-1 ring-indigo-500/20">
              <Moon className="size-5" />
            </div>
            <div>
              <h1 className="text-page-title text-foreground">Night Audit & Daily Close</h1>
              <p className="text-body text-muted-foreground mt-0.5">
                Financial reconciliation, room charges, and daily close-out for{" "}
                <span className="font-semibold text-foreground">{summary.auditDate}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {summary.isClosed ? (
            <Chip color="success" variant="soft" className="gap-1.5 px-3 py-1 text-sm font-medium">
              <CheckCircle2 className="size-4" />
              Day Closed ({summary.auditDate})
            </Chip>
          ) : (
            <Button
              variant="primary"
              size="md"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md gap-2"
              onPress={() => setConfirmModalOpen(true)}
            >
              <ShieldCheck className="size-4" />
              Run Night Audit & Close Day
            </Button>
          )}
        </div>
      </div>

      {/* Warning banner if unresolved arrivals/departures */}
      {hasUnresolved && !summary.isClosed && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-600 dark:text-amber-400 flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Unresolved Same-Day Operations ({summary.unresolvedBookings.length})</p>
            <p className="mt-0.5 text-amber-600/90 dark:text-amber-400/90">
              There are pending arrivals or departures scheduled for today. It is recommended to resolve these (check-in, check-out, or mark no-show) before performing the official Close Day audit.
            </p>
          </div>
        </div>
      )}

      {/* Key Metrics Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Room Revenue */}
        <Card className="p-4 border-border/60 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Est. Room Revenue</span>
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <DollarSign className="size-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">
            {formatCurrencyCompact(summary.estimatedRoomRevenue, summary.currency)}
          </p>
          <p className="text-caption text-muted-foreground mt-1">Calculated from in-house stays</p>
        </Card>

        {/* Total Payments Collected */}
        <Card className="p-4 border-border/60 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Collected Today</span>
            <div className="size-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <TrendingUp className="size-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">
            {formatCurrencyCompact(summary.totalPaymentsToday, summary.currency)}
          </p>
          <p className="text-caption text-muted-foreground mt-1">Processed payments total</p>
        </Card>

        {/* Occupancy Rate */}
        <Card className="p-4 border-border/60 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Occupancy</span>
            <div className="size-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <BedDouble className="size-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">
            {summary.occupancyRate}%
          </p>
          <p className="text-caption text-muted-foreground mt-1">
            {summary.occupiedRooms} / {summary.totalRooms} rooms occupied
          </p>
        </Card>

        {/* ADR & RevPAR */}
        <Card className="p-4 border-border/60 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">ADR / RevPAR</span>
            <div className="size-8 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center">
              <FileSpreadsheet className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-xl font-bold text-foreground tabular-nums">{formatCurrencyCompact(summary.adrToday, summary.currency)}</span>
            <span className="text-caption text-muted-foreground">/</span>
            <span className="text-sm font-semibold text-muted-foreground tabular-nums">{formatCurrencyCompact(summary.revparToday, summary.currency)}</span>
          </div>
          <p className="text-caption text-muted-foreground mt-1">Avg Daily Rate / RevPAR</p>
        </Card>
      </div>

      {/* Unresolved Bookings Table */}
      {hasUnresolved && (
        <Card className="p-5 border-border/60 bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-section text-foreground font-semibold">
              Action Required: Same-Day Bookings ({summary.unresolvedBookings.length})
            </h2>
          </div>

          <div className="divide-y divide-border/40 rounded-xl border border-border/60 overflow-hidden bg-background">
            {summary.unresolvedBookings.map((item) => (
              <div key={item.id} className="p-3.5 flex items-center justify-between hover:bg-accent/5 transition-colors">
                <div className="flex items-center gap-3">
                  <Chip
                    size="sm"
                    color={item.type === "pending_arrival" ? "warning" : "danger"}
                    variant="soft"
                  >
                    {item.type === "pending_arrival" ? "Pending Check-in" : "Pending Check-out"}
                  </Chip>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.guestName}</p>
                    <p className="text-caption text-muted-foreground">Ref: {item.reference} • Room: {item.roomNumber || "Unassigned"}</p>
                  </div>
                </div>

                <a
                  href={`/dashboard/bookings?search=${item.reference}`}
                  className="text-xs font-medium text-indigo-500 hover:underline"
                >
                  Manage →
                </a>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Confirmation HeroUI Modal */}
      <Modal isOpen={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog className="max-w-lg p-6 rounded-2xl bg-card border border-border">
            <Modal.Header className="flex items-center gap-3 pb-3 border-b border-border/40">
              <div className="size-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <Modal.Heading className="text-lg font-bold text-foreground">Confirm Night Audit</Modal.Heading>
                <p className="text-caption text-muted-foreground">Closing day {summary.auditDate}</p>
              </div>
            </Modal.Header>

            <Modal.Body className="py-4 space-y-4 text-sm text-foreground">
              <p>
                Running Night Audit will record daily room revenue of{" "}
                <span className="font-bold text-foreground">{formatCurrencyCompact(summary.estimatedRoomRevenue, summary.currency)}</span> and total collected payments of{" "}
                <span className="font-bold text-foreground">{formatCurrencyCompact(summary.totalPaymentsToday, summary.currency)}</span> to the immutable audit log.
              </p>

              <div>
                <label className="block text-label text-muted-foreground mb-1 font-medium">
                  Audit Notes / Handover Comments
                </label>
                <textarea
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  placeholder="Optional audit notes for staff log..."
                  className="w-full h-20 rounded-xl border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </Modal.Body>

            <Modal.Footer className="pt-3 border-t border-border/40 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onPress={() => setConfirmModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isPending={isExecuting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                onPress={handleRunAudit}
              >
                Confirm & Close Day
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  );
}
