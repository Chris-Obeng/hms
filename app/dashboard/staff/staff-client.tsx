"use client";

import * as React from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { Users, Copy, Share2, Plus } from "lucide-react";
import { AlertDialog, Avatar, Button, Chip, Modal, Table, toast } from "@heroui/react";

import { formatDate, getInitials } from "@/lib/format";
import { HeroSelectField } from "@/components/ui/hero-select";
import { HeroTablePagination } from "@/components/ui/hero-table-pagination";
import { EmptyStatePanel, PageHeader } from "@/components/ui/page-header";
import { TableSearchField } from "@/components/ui/table-search-field";
import {
  can,
  canAdministerStaff,
  canAssignRole,
  ROLE_LEVEL,
  type StaffRole,
} from "@/lib/roles";
import { toggleStaffActive, changeStaffRole } from "@/app/actions/staff";
import { createShareableInvite } from "@/app/actions/invitations";

// ── Types ──────────────────────────────────────────────────────────

export interface StaffRow {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  grantedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
}

interface StaffClientProps {
  data: StaffRow[];
  pendingCount?: number;
  currentUserId: string;
  currentUserRole: StaffRole;
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  front_desk: "Front Desk",
  read_only: "Read Only",
  pending: "Pending",
};

const ROLE_CHIP: Record<string, "warning" | "accent" | "success" | "default"> = {
  super_admin: "warning",
  manager: "accent",
  front_desk: "success",
  read_only: "default",
  pending: "warning",
};

// Roles that can actually be granted (never "pending") — matches the
// server action signatures for changeStaffRole / createShareableInvite.
type AssignableRole = Exclude<StaffRole, "pending">;

const ALL_ROLE_OPTIONS: { value: AssignableRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "manager", label: "Manager" },
  { value: "front_desk", label: "Front Desk" },
  { value: "read_only", label: "Read Only" },
];

function roleRank(role: string) {
  return ROLE_LEVEL[role as StaffRole] ?? 0;
}

// ── Component ──────────────────────────────────────────────────────

export function StaffClient({
  data,
  pendingCount = 0,
  currentUserId,
  currentUserRole,
}: StaffClientProps) {
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [localData, setLocalData] = React.useState(data);
  const [syncedData, setSyncedData] = React.useState(data);
  const [mutatingIds, setMutatingIds] = React.useState<Set<string>>(() => new Set());
  const mutatingRef = React.useRef(new Set<string>());
  const localDataRef = React.useRef(localData);

  // Re-sync on fresh server rows during render (no stale frame).
  if (data !== syncedData) {
    setSyncedData(data);
    setLocalData(data);
  }
  localDataRef.current = localData;

  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [inviteRole, setInviteRole] = React.useState<AssignableRole>("front_desk");
  const [inviteLink, setInviteLink] = React.useState("");
  const [isGenerating, setIsGenerating] = React.useState(false);

  // Staff row awaiting deactivation confirmation (null = dialog closed).
  const [deactivateTarget, setDeactivateTarget] = React.useState<StaffRow | null>(null);
  const [isDeactivating, setIsDeactivating] = React.useState(false);

  const canInvite = can(currentUserRole, "staff:invite");
  // Roles this actor may grant — drives both the invite picker and row selects.
  const assignableRoleOptions = React.useMemo(
    () => ALL_ROLE_OPTIONS.filter((o) => canAssignRole(currentUserRole, o.value)),
    [currentUserRole]
  );

  // Highest role first, active before inactive, then name.
  const sortedData = React.useMemo(
    () =>
      [...localData].sort(
        (a, b) =>
          roleRank(b.role) - roleRank(a.role) ||
          Number(b.isActive) - Number(a.isActive) ||
          (a.fullName || "").localeCompare(b.fullName || "")
      ),
    [localData]
  );

  // ── Optimistic Handlers ─────────────────────────────────────────
  const markMutating = React.useCallback((staffId: string, busy: boolean) => {
    if (busy) mutatingRef.current.add(staffId);
    else mutatingRef.current.delete(staffId);
    setMutatingIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(staffId);
      else next.delete(staffId);
      return next;
    });
  }, []);

  const handleToggleActive = React.useCallback(
    async (staffId: string, currentActive: boolean) => {
      if (mutatingRef.current.has(staffId)) return false;
      markMutating(staffId, true);
      const nextActive = !currentActive;
      setLocalData((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, isActive: nextActive } : s))
      );
      try {
        const result = await toggleStaffActive(staffId, nextActive);
        if (result.success) {
          toast.success(nextActive ? "Staff member activated" : "Staff member deactivated");
          return true;
        }
        setLocalData((prev) =>
          prev.map((s) => (s.id === staffId ? { ...s, isActive: currentActive } : s))
        );
        toast.danger(result.error || "Failed to update");
        return false;
      } catch {
        setLocalData((prev) =>
          prev.map((s) => (s.id === staffId ? { ...s, isActive: currentActive } : s))
        );
        toast.danger("Failed to update — check your connection and try again");
        return false;
      } finally {
        markMutating(staffId, false);
      }
    },
    [markMutating]
  );

  const handleStatusClick = React.useCallback(
    (row: StaffRow) => {
      if (mutatingRef.current.has(row.id)) return;
      if (row.isActive) setDeactivateTarget(row);
      else void handleToggleActive(row.id, false);
    },
    [handleToggleActive]
  );

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    const target = deactivateTarget;
    setDeactivateTarget(null);
    setIsDeactivating(true);
    await handleToggleActive(target.id, true);
    setIsDeactivating(false);
  };

  const handleRoleChange = React.useCallback(
    async (staffId: string, role: AssignableRole) => {
      if (mutatingRef.current.has(staffId)) return;
      const previousRole = localDataRef.current.find((s) => s.id === staffId)?.role;
      if (previousRole === role) return;
      markMutating(staffId, true);
      setLocalData((prev) => prev.map((s) => (s.id === staffId ? { ...s, role } : s)));
      try {
        const result = await changeStaffRole(staffId, role);
        if (result.success) {
          toast.success("Role updated");
        } else {
          if (previousRole) {
            setLocalData((prev) =>
              prev.map((s) => (s.id === staffId ? { ...s, role: previousRole } : s))
            );
          }
          toast.danger(result.error || "Failed to update role");
        }
      } catch {
        if (previousRole) {
          setLocalData((prev) =>
            prev.map((s) => (s.id === staffId ? { ...s, role: previousRole } : s))
          );
        }
        toast.danger("Failed to update role — check your connection and try again");
      } finally {
        markMutating(staffId, false);
      }
    },
    [markMutating]
  );

  const handleInviteOpenChange = (open: boolean) => {
    setIsInviteOpen(open);
    if (!open) {
      setInviteLink("");
      setInviteRole("front_desk");
    }
  };

  const handleGenerateInvite = async () => {
    setIsGenerating(true);
    setInviteLink("");
    const res = await createShareableInvite(inviteRole);
    setIsGenerating(false);
    if (res.success) {
      setInviteLink(res.url);
      toast.success("Invitation link generated");
    } else {
      toast.danger(res.error || "Failed to generate link");
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success("Link copied to clipboard");
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Join our hotel team on RoomLine! Sign up using this link: ${inviteLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  // ── Per-row controls (shared by desktop cells + mobile cards) ────
  // Mirrors the server guards: self never editable, pending is static,
  // manager can't touch a super_admin.
  const rowCaps = React.useCallback(
    (row: StaffRow) => {
      const isSelf = row.clerkUserId === currentUserId;
      const isPending = row.role === "pending";
      const manageable = !isSelf && !isPending && canAdministerStaff(currentUserRole, row.role);
      return {
        isSelf,
        isPending,
        canEditRole: manageable && can(currentUserRole, "staff:setRole"),
        canEditStatus: manageable && can(currentUserRole, "staff:setActive"),
      };
    },
    [currentUserId, currentUserRole]
  );

  const renderRoleControl = React.useCallback(
    (row: StaffRow) => {
      const { canEditRole } = rowCaps(row);
      if (canEditRole) {
        return (
          <HeroSelectField
            className="w-40"
            triggerClassName="min-h-11 sm:min-h-10"
            isDisabled={mutatingIds.has(row.id)}
            value={row.role}
            onValueChange={(v) => void handleRoleChange(row.id, v as AssignableRole)}
            options={assignableRoleOptions}
            ariaLabel={`Role for ${row.fullName ?? "staff member"}`}
          />
        );
      }
      return (
        <Chip size="sm" variant="soft" color={ROLE_CHIP[row.role] ?? "default"}>
          {ROLE_LABEL[row.role] ?? row.role}
        </Chip>
      );
    },
    [assignableRoleOptions, handleRoleChange, mutatingIds, rowCaps]
  );

  const renderStatusControl = React.useCallback(
    (row: StaffRow) => {
      const { isPending, canEditStatus } = rowCaps(row);
      if (isPending) {
        return (
          <Chip size="sm" variant="soft" color="warning">
            Pending
          </Chip>
        );
      }
      const chip = (
        <Chip size="sm" variant="soft" color={row.isActive ? "success" : "default"}>
          {row.isActive ? "Active" : "Inactive"}
        </Chip>
      );
      if (!canEditStatus) return chip;
      return (
        <button
          type="button"
          disabled={mutatingIds.has(row.id)}
          onClick={() => handleStatusClick(row)}
          aria-label={`${row.isActive ? "Deactivate" : "Activate"} ${row.fullName ?? "staff member"}`}
          className="ui-press inline-flex min-h-11 cursor-pointer items-center rounded-full px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:min-h-0 sm:px-0 [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-80"
        >
          {chip}
        </button>
      );
    },
    [handleStatusClick, mutatingIds, rowCaps]
  );

  // ── Columns ──────────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<StaffRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Staff Member",
        cell: ({ row }) => {
          const s = row.original;
          const isSelf = s.clerkUserId === currentUserId;
          return (
            <div className="flex items-center gap-3">
              <Avatar size="sm">
                {s.avatarUrl ? <Avatar.Image src={s.avatarUrl} alt={s.fullName || ""} /> : null}
                <Avatar.Fallback>{getInitials(s.fullName)}</Avatar.Fallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2">
                  <span className="max-w-[180px] truncate text-body font-medium text-foreground">
                    {s.fullName || "Unnamed"}
                  </span>
                  {isSelf && (
                    <span className="rounded-full bg-muted px-2 py-1 text-caption text-muted-foreground">
                      You
                    </span>
                  )}
                </span>
                <span className="max-w-[200px] truncate text-caption text-muted-foreground">
                  {s.email}
                </span>
              </div>
            </div>
          );
        },
      },
      { id: "role", header: "Role", cell: ({ row }) => renderRoleControl(row.original) },
      { id: "status", header: "Status", cell: ({ row }) => renderStatusControl(row.original) },
      {
        accessorKey: "grantedAt",
        header: "Granted",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-caption text-muted-foreground">
            {formatDate(row.original.grantedAt, "MMM d, yyyy")}
          </span>
        ),
      },
      {
        accessorKey: "lastLoginAt",
        header: "Last Login",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-caption text-muted-foreground">
            {row.original.lastLoginAt ? formatDate(row.original.lastLoginAt, "MMM d, yyyy") : "Never"}
          </span>
        ),
      },
    ],
    [currentUserId, renderRoleControl, renderStatusControl]
  );

  const table = useReactTable({
    data: sortedData,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _id, filterValue: string) => {
      const s = row.original;
      const q = filterValue.toLowerCase();
      return (
        (s.fullName || "").toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (ROLE_LABEL[s.role] ?? s.role).toLowerCase().includes(q)
      );
    },
    initialState: { pagination: { pageSize: 15 } },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const isFiltered = globalFilter.trim().length > 0;

  const emptyState = (
    <EmptyStatePanel
      icon={Users}
      title={isFiltered ? "No matching team members" : "No team members yet"}
      action={
        isFiltered ? (
          <Button
            variant="outline"
            size="sm"
            className="ui-press rounded-xl text-xs font-semibold"
            onPress={() => setGlobalFilter("")}
          >
            Clear search
          </Button>
        ) : undefined
      }
    />
  );

  const StaffCard = (row: StaffRow) => {
    const isSelf = row.clerkUserId === currentUserId;
    return (
      <div
        key={row.id}
        className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-[0_1px_3px_rgb(0_0_0/0.04)]"
      >
        <div className="flex items-center gap-3">
          <Avatar size="sm">
            {row.avatarUrl ? <Avatar.Image src={row.avatarUrl} alt={row.fullName || ""} /> : null}
            <Avatar.Fallback>{getInitials(row.fullName)}</Avatar.Fallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
              {row.fullName || "Unnamed"}
              {isSelf && (
                <span className="rounded-md bg-muted px-2 py-1 text-2xs font-medium text-muted-foreground">
                  You
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          {renderRoleControl(row)}
          {renderStatusControl(row)}
        </div>
        <div className="flex items-center justify-between border-t border-border/50 pt-3 text-2xs text-muted-foreground">
          <span>Granted {formatDate(row.grantedAt, "MMM d, yyyy")}</span>
          <span>
            Last login {row.lastLoginAt ? formatDate(row.lastLoginAt, "MMM d, yyyy") : "Never"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff"
        subtitle={
          isFiltered
            ? `${filteredCount} of ${totalCount} shown`
            : `${totalCount} ${totalCount === 1 ? "member" : "members"}`
        }
        actions={
          <>
            {pendingCount > 0 && (
              <Link
                href="/dashboard/staff/pending"
                className="ui-press inline-flex h-11 items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-3 text-xs font-semibold text-amber-800 sm:h-10"
              >
                <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
                {pendingCount} pending
              </Link>
            )}
            {canInvite && (
              <Button
                variant="primary"
                size="sm"
                className="ui-press h-11 shrink-0 gap-2 rounded-xl px-4 text-xs font-semibold shadow-2xs sm:h-10"
                onPress={() => setIsInviteOpen(true)}
              >
                <Plus className="size-4" aria-hidden="true" />
                Invite staff
              </Button>
            )}
          </>
        }
      />

      {/* Search toolbar */}
      <div className="flex items-center gap-3">
        <TableSearchField
          ariaLabel="Search staff"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Search name, email, role…"
        />
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_1px_3px_rgb(0_0_0/0.04)] md:block">
        <Table variant="secondary">
        <Table.ScrollContainer>
          <Table.Content aria-label="Staff members" className="min-w-[720px]">
            <Table.Header>
              {table.getHeaderGroups()[0]?.headers.map((header) => (
                <Table.Column key={header.id} id={header.id} isRowHeader={header.id === "fullName"}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body renderEmptyState={() => emptyState}>
              {rows.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <Table.Cell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        {pageCount > 1 && (
          <Table.Footer>
            <HeroTablePagination table={table} totalRows={totalCount} filteredRows={filteredCount} showSummary={false} />
          </Table.Footer>
        )}
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.length > 0 ? (
          <>
            {rows.map((row) => StaffCard(row.original))}
            {pageCount > 1 && (
              <HeroTablePagination table={table} totalRows={totalCount} filteredRows={filteredCount} showSummary={false} />
            )}
          </>
        ) : (
          <div className="rounded-3xl border border-border/60 bg-card">{emptyState}</div>
        )}
      </div>

      {/* Invite modal */}
      <Modal.Backdrop isOpen={isInviteOpen} onOpenChange={handleInviteOpenChange} variant="opaque">
        <Modal.Container placement="center" size="md" className="p-4">
          <Modal.Dialog className="w-full max-w-md rounded-2xl">
            <Modal.CloseTrigger className="ui-press absolute right-4 top-4 inline-flex size-11 items-center justify-center rounded-full border border-border/60 bg-muted/80 text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-10 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted" />
            <Modal.Header className="flex flex-col gap-1 px-6 pt-6 pr-14">
              <Modal.Heading className="text-base font-semibold text-foreground">Invite staff member</Modal.Heading>
              <p className="text-caption text-muted-foreground">
                Generate a shareable signup link. Anyone with the link can join this hotel with the role you pick.
              </p>
            </Modal.Header>
            <Modal.Body className="space-y-4 px-6 py-4">
              <HeroSelectField
                label="Assign role"
                triggerClassName="min-h-11 sm:min-h-10"
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as AssignableRole)}
                options={assignableRoleOptions}
                ariaLabel="Assign role"
              />
              {!inviteLink ? (
                <Button variant="primary" className="ui-press min-h-11 w-full rounded-xl sm:min-h-10" onPress={handleGenerateInvite} isPending={isGenerating}>
                  Generate invite link
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      readOnly
                      aria-label="Shareable invite link"
                      value={inviteLink}
                      className="h-11 flex-1 rounded-xl border border-border/60 bg-muted/30 px-3 text-base text-foreground outline-none sm:h-10 sm:text-sm"
                    />
                    <Button isIconOnly variant="outline" className="ui-press size-11 shrink-0 rounded-xl sm:size-10" onPress={handleCopyLink} aria-label="Copy link">
                      <Copy className="size-4" />
                    </Button>
                  </div>
                  <Button variant="outline" className="ui-press min-h-11 w-full rounded-xl sm:min-h-10" onPress={handleShareWhatsApp}>
                    <Share2 className="size-4" />
                    Share via WhatsApp
                  </Button>
                </div>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Deactivate confirmation — deactivating force-signs-out the member */}
      <AlertDialog.Backdrop
        isOpen={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        variant="blur"
      >
        <AlertDialog.Container placement="center">
          <AlertDialog.Dialog className="w-full max-w-sm rounded-2xl">
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading className="text-base font-semibold text-foreground">
                Deactivate {deactivateTarget?.fullName || "staff member"}?
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-caption text-muted-foreground">
                They will be signed out immediately and lose access to RoomLine until an admin
                reactivates them.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                variant="ghost"
                className="rounded-xl"
                onPress={() => setDeactivateTarget(null)}
                isDisabled={isDeactivating}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="rounded-xl"
                onPress={confirmDeactivate}
                isPending={isDeactivating}
              >
                Deactivate
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}

