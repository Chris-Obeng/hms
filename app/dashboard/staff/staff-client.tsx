"use client";

import * as React from "react";
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

export function StaffClient({ data, currentUserId, currentUserRole }: StaffClientProps) {
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [localData, setLocalData] = React.useState(data);
  const [syncedData, setSyncedData] = React.useState(data);

  // Re-sync on fresh server rows during render (no stale frame).
  if (data !== syncedData) {
    setSyncedData(data);
    setLocalData(data);
  }

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

  // ── Handlers ────────────────────────────────────────────────────
  const handleToggleActive = async (staffId: string, currentActive: boolean) => {
    const result = await toggleStaffActive(staffId, !currentActive);
    if (result.success) {
      setLocalData((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, isActive: !currentActive } : s))
      );
      toast.success(!currentActive ? "Staff member activated" : "Staff member deactivated");
      return true;
    }
    toast.danger(result.error || "Failed to update");
    return false;
  };

  // Deactivating signs the member out immediately, so confirm first.
  // Reactivating is low-risk and applies on click.
  const handleStatusClick = (row: StaffRow) => {
    if (row.isActive) setDeactivateTarget(row);
    else handleToggleActive(row.id, false);
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setIsDeactivating(true);
    const ok = await handleToggleActive(deactivateTarget.id, true);
    setIsDeactivating(false);
    if (ok) setDeactivateTarget(null);
  };

  const handleRoleChange = async (staffId: string, role: AssignableRole) => {
    const result = await changeStaffRole(staffId, role);
    if (result.success) {
      setLocalData((prev) => prev.map((s) => (s.id === staffId ? { ...s, role } : s)));
      toast.success("Role updated");
    } else {
      toast.danger(result.error || "Failed to update role");
    }
  };

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
  const rowCaps = (row: StaffRow) => {
    const isSelf = row.clerkUserId === currentUserId;
    const isPending = row.role === "pending";
    const manageable = !isSelf && !isPending && canAdministerStaff(currentUserRole, row.role);
    return {
      isSelf,
      isPending,
      canEditRole: manageable && can(currentUserRole, "staff:setRole"),
      canEditStatus: manageable && can(currentUserRole, "staff:setActive"),
    };
  };

  const renderRoleControl = (row: StaffRow) => {
    const { canEditRole } = rowCaps(row);
    if (canEditRole) {
      return (
        <HeroSelectField
          className="w-40"
          value={row.role}
          onValueChange={(v) => handleRoleChange(row.id, v as AssignableRole)}
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
  };

  const renderStatusControl = (row: StaffRow) => {
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
        onClick={() => handleStatusClick(row)}
        aria-label={`${row.isActive ? "Deactivate" : "Activate"} ${row.fullName ?? "staff member"}`}
        className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {chip}
      </button>
    );
  };

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
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-caption text-muted-foreground">
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
    // handlers/caps are stable within a render; role drives assignable set
    [currentUserId, currentUserRole, assignableRoleOptions]
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
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Users className="mb-3 size-10 text-muted-foreground/30" />
      <p className="text-body font-medium text-muted-foreground">
        {isFiltered ? "No staff members match your search" : "No team members yet"}
      </p>
      {isFiltered && (
        <Button variant="ghost" size="sm" className="mt-4 rounded-lg text-sm" onPress={() => setGlobalFilter("")}>
          Clear search
        </Button>
      )}
    </div>
  );

  // Reusable mobile card (name + role/status controls + meta footer).
  const StaffCard = (row: StaffRow) => {
    const isSelf = row.clerkUserId === currentUserId;
    return (
      <div key={row.id} className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar size="sm">
            {row.avatarUrl ? <Avatar.Image src={row.avatarUrl} alt={row.fullName || ""} /> : null}
            <Avatar.Fallback>{getInitials(row.fullName)}</Avatar.Fallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-body font-semibold text-foreground">
              {row.fullName || "Unnamed"}
              {isSelf && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-caption text-muted-foreground">You</span>
              )}
            </p>
            <p className="truncate text-caption text-muted-foreground">{row.email}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          {renderRoleControl(row)}
          {renderStatusControl(row)}
        </div>
        <div className="flex items-center justify-between border-t border-border/50 pt-3 text-caption text-muted-foreground">
          <span>Granted {formatDate(row.grantedAt, "MMM d, yyyy")}</span>
          <span>Last login {row.lastLoginAt ? formatDate(row.lastLoginAt, "MMM d, yyyy") : "Never"}</span>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <TableSearchField
          ariaLabel="Search staff"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Search name, email, role…"
          className="min-w-0 flex-1 max-w-xs"
        />
        {canInvite && (
          <Button variant="primary" className="shrink-0 rounded-xl" onPress={() => setIsInviteOpen(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Invite staff</span>
            <span className="sm:hidden">Invite</span>
          </Button>
        )}
      </div>

      {/* Desktop table */}
      <Table variant="secondary" className="hidden md:block">
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
          <div className="rounded-xl border border-dashed border-border/60 p-4">{emptyState}</div>
        )}
      </div>

      {/* Invite modal */}
      <Modal.Backdrop isOpen={isInviteOpen} onOpenChange={handleInviteOpenChange} variant="opaque">
        <Modal.Container placement="center" size="md" className="p-4">
          <Modal.Dialog className="w-full max-w-md rounded-2xl">
            <Modal.CloseTrigger className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-muted/80 text-foreground/80 transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <Modal.Header className="flex flex-col gap-1 px-6 pt-6 pr-12">
              <Modal.Heading className="text-base font-semibold text-foreground">Invite staff member</Modal.Heading>
              <p className="text-caption text-muted-foreground">
                Generate a shareable signup link. Anyone with the link can join this hotel with the role you pick.
              </p>
            </Modal.Header>
            <Modal.Body className="space-y-4 px-6 py-4">
              <HeroSelectField
                label="Assign role"
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as AssignableRole)}
                options={assignableRoleOptions}
                ariaLabel="Assign role"
              />
              {!inviteLink ? (
                <Button variant="primary" className="w-full rounded-xl" onPress={handleGenerateInvite} isPending={isGenerating}>
                  Generate invite link
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteLink}
                      className="h-10 flex-1 rounded-xl border border-border/60 bg-muted/30 px-3 text-sm text-foreground outline-none"
                    />
                    <Button isIconOnly variant="outline" className="size-10 shrink-0 rounded-xl" onPress={handleCopyLink} aria-label="Copy link">
                      <Copy className="size-4" />
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl" onPress={handleShareWhatsApp}>
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

