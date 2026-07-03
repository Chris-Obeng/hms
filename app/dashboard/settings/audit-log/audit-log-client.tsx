"use client";

import * as React from "react";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  staff_name: string | null;
  before_state: unknown;
  after_state: unknown;
  created_at: string | null;
}

const ACTION_COLORS: Record<string, string> = {
  "booking.created":    "bg-blue-50 text-blue-700 border-blue-200",
  "booking.cancelled":  "bg-red-50 text-red-700 border-red-200",
  "booking.checked_in": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "booking.checked_out":"bg-teal-50 text-teal-700 border-teal-200",
  "booking.confirmed":  "bg-green-50 text-green-700 border-green-200",
  "payment.recorded":   "bg-violet-50 text-violet-700 border-violet-200",
  "payment.refunded":   "bg-orange-50 text-orange-700 border-orange-200",
  "staff.approved":     "bg-sky-50 text-sky-700 border-sky-200",
  "staff.deactivated":  "bg-red-50 text-red-600 border-red-200",
  "staff.reactivated":  "bg-green-50 text-green-700 border-green-200",
  "staff.role_changed": "bg-amber-50 text-amber-700 border-amber-200",
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLORS[action] ?? "bg-muted/40 text-muted-foreground border-border/50";
  const label = action.replace(".", " · ").replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function stateSnippet(state: unknown): string {
  if (!state || typeof state !== "object" || Array.isArray(state)) return "";
  const entries = Object.entries(state as Record<string, unknown>).slice(0, 3);
  return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ");
}

export function AuditLogClient({ logs }: { logs: AuditEntry[] }) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        (l.staff_name ?? "").toLowerCase().includes(q) ||
        (l.entity_type ?? "").toLowerCase().includes(q) ||
        JSON.stringify(l.after_state ?? {}).toLowerCase().includes(q)
    );
  }, [logs, search]);

  function exportCsv() {
    const headers = ["Timestamp", "Action", "Entity Type", "Entity ID", "Staff", "After State"];
    const rows = filtered.map((l) => [
      l.created_at ?? "",
      l.action,
      l.entity_type ?? "",
      l.entity_id ?? "",
      l.staff_name ?? "",
      JSON.stringify(l.after_state ?? {}),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions, staff, entity…"
            className="pl-8 h-8 rounded-lg text-xs"
          />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}
          className="h-8 rounded-lg text-xs gap-1.5">
          <Download className="size-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Timestamp</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Staff</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Entity</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">
                    {search ? "No matching entries" : "No audit log entries yet"}
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap font-mono text-[10px]">
                      {formatTime(log.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-2.5 text-foreground font-medium">
                      {log.staff_name ?? <span className="text-muted-foreground">System</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                      {log.entity_type && (
                        <span className="font-mono text-[10px] bg-muted/40 px-1.5 py-0.5 rounded">
                          {log.entity_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate hidden lg:table-cell">
                      {stateSnippet(log.after_state)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/60">
        Showing {filtered.length} of {logs.length} entries. Audit logs are append-only and cannot be modified.
      </p>
    </div>
  );
}
