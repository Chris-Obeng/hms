"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Chip } from "@heroui/react";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { Input } from "@/components/ui/input";

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

type ChipColor = "success" | "danger" | "warning" | "accent" | "default";

/** Semantic color by action outcome — dark-mode safe via HeroUI soft variants. */
function actionColor(action: string): ChipColor {
  if (/(cancelled|deactivated|refunded|rejected)/.test(action)) return "danger";
  if (/(created|approved|reactivated|confirmed)/.test(action)) return "success";
  if (/(role_changed|block_created|settings_updated|configured|completed)/.test(action)) return "warning";
  if (/(checked_in|checked_out|recorded|notes_updated|status_changed|move|room_type_change)/.test(action)) return "accent";
  return "default";
}

function ActionBadge({ action }: { action: string }) {
  const label = action.replace(".", " · ").replace(/_/g, " ");
  return (
    <Chip size="sm" variant="soft" color={actionColor(action)} className="whitespace-nowrap">
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}

function stateSnippet(state: unknown): string {
  if (!state || typeof state !== "object" || Array.isArray(state)) return "";
  const entries = Object.entries(state as Record<string, unknown>).slice(0, 3);
  return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ");
}

export function AuditLogClient({ logs }: { logs: AuditEntry[] }) {
  const [search, setSearch] = React.useState("");
  // Relative time differs between server render and hydration near minute
  // boundaries — only compute it after mount; absolute time is SSR-stable.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(t);
  }, []);

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

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actions, staff, entity…"
          className="pl-9 h-10 w-full rounded-xl"
          aria-label="Search audit log"
        />
      </div>

      {/* Table */}
      <div className="card-default overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">When</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Staff</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Entity</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                    {search ? "No matching entries" : "No audit log entries yet"}
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/20 transition-colors align-top">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="block text-foreground font-medium tabular-nums">
                        {mounted ? formatRelativeTime(log.created_at) : "\u00A0"}
                      </span>
                      <span className="block text-[11px] text-muted-foreground tabular-nums mt-0.5">
                        {formatDate(log.created_at, "dd MMM yyyy, HH:mm")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3 text-foreground font-medium whitespace-nowrap max-w-[140px] truncate">
                      {log.staff_name ?? <span className="text-muted-foreground">System</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {log.entity_type && (
                        <span className="font-mono text-[11px] bg-muted/40 px-1.5 py-0.5 rounded">
                          {log.entity_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate hidden lg:table-cell font-mono text-[11px]">
                      {stateSnippet(log.after_state)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-caption text-muted-foreground/70">
        Showing {filtered.length} of {logs.length} entries. Audit logs are append-only and cannot be modified.
      </p>
    </div>
  );
}
