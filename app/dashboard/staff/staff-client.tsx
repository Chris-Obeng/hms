"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Copy, Plus, Share2, Users } from "lucide-react";
import {
  AlertDialog,
  Avatar,
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Modal,
  SearchField,
  Select,
  Switch,
  TextField,
  toast,
} from "@heroui/react";

import { formatRelativeTime, getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  can,
  canAdministerStaff,
  canAssignRole,
  ROLE_LEVEL,
  type StaffRole,
} from "@/lib/roles";
import { toggleStaffActive, changeStaffRole } from "@/app/actions/staff";
import { createShareableInvite } from "@/app/actions/invitations";

const PAGE_SIZE = 15;

/** Desktop column template shared by the header band and every row. */
const ROW_GRID = "md:grid md:grid-cols-[minmax(0,1.6fr)_10rem_minmax(0,1fr)_4rem] md:items-center md:gap-4";

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
  super_admin: "Super admin",
  manager: "Manager",
  front_desk: "Front desk",
  read_only: "Read only",
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
  { value: "super_admin", label: "Super admin" },
  { value: "manager", label: "Manager" },
  { value: "front_desk", label: "Front desk" },
  { value: "read_only", label: "Read only" },
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
  // Latest rows for the async role handler's rollback (synced after each commit).
  React.useLayoutEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

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
    toast.success("Link copied");
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Join our hotel team on RoomLine! Sign up using this link: ${inviteLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  // ── Per-row permissions ─────────────────────────────────────────
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

  // ── Search + paging ─────────────────────────────────────────────
  const [page, setPage] = React.useState(1);
  const query = globalFilter.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      query
        ? sortedData.filter(
            (s) =>
              (s.fullName || "").toLowerCase().includes(query) ||
              s.email.toLowerCase().includes(query) ||
              (ROLE_LABEL[s.role] ?? s.role).toLowerCase().includes(query)
          )
        : sortedData,
    [sortedData, query]
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalCount = data.length;

  function renderRole(row: StaffRow) {
    const { canEditRole } = rowCaps(row);
    if (!canEditRole) {
      return (
        <Chip size="sm" variant="soft" color={ROLE_CHIP[row.role] ?? "default"}>
          {ROLE_LABEL[row.role] ?? row.role}
        </Chip>
      );
    }
    return (
      <Select
        aria-label={`Role for ${row.fullName ?? "staff member"}`}
        value={row.role}
        isDisabled={mutatingIds.has(row.id)}
        onChange={(v) => v && void handleRoleChange(row.id, String(v) as AssignableRole)}
        className="w-full md:w-40"
      >
        <Select.Trigger className="min-h-11 rounded-xl sm:min-h-10">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {assignableRoleOptions.map((o) => (
              <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
                {o.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  function renderStatus(row: StaffRow) {
    const { isPending, canEditStatus } = rowCaps(row);
    if (isPending) {
      return (
        <Chip size="sm" variant="soft" color="warning">
          Pending
        </Chip>
      );
    }
    if (!canEditStatus) {
      return (
        <Chip size="sm" variant="soft" color={row.isActive ? "success" : "default"}>
          {row.isActive ? "Active" : "Inactive"}
        </Chip>
      );
    }
    return (
      <Switch
        aria-label={`${row.fullName ?? "Staff member"} has access`}
        isSelected={row.isActive}
        isDisabled={mutatingIds.has(row.id)}
        onChange={() => handleStatusClick(row)}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    );
  }

  function lastSeen(row: StaffRow) {
    return row.lastLoginAt ? formatRelativeTime(row.lastLoginAt) : "Never signed in";
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Staff</h1>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {totalCount} {totalCount === 1 ? "member" : "members"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Link
              href="/dashboard/staff/pending"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-500/10 px-3 text-sm font-semibold text-amber-800 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-amber-500/15"
            >
              <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
              {pendingCount} to approve
            </Link>
          )}
          {canInvite && (
            <Button variant="primary" onPress={() => setIsInviteOpen(true)} className="rounded-xl font-semibold">
              <Plus className="size-4" aria-hidden="true" />
              Invite
            </Button>
          )}
        </div>
      </header>

      <Card className="gap-0 overflow-hidden rounded-3xl border border-border/60 p-0 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
        <div className="px-4 py-4 sm:px-6">
          <SearchField
            aria-label="Search staff"
            value={globalFilter}
            onChange={(v) => {
              setGlobalFilter(v);
              setPage(1);
            }}
            className="w-full sm:max-w-80"
          >
            <SearchField.Group className="rounded-xl">
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search name, email or role" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </div>

        <div
          aria-hidden="true"
          className={cn(ROW_GRID, "hidden border-y border-border/50 bg-secondary/40 px-6 py-2 text-2xs font-medium text-muted-foreground")}
        >
          <span>Member</span>
          <span>Role</span>
          <span>Last seen</span>
          <span className="text-right">Access</span>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 border-t border-border/50 px-6 py-16 text-center md:border-t-0">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
              <Users className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-foreground">
              {query ? `No one matches “${globalFilter.trim()}”` : "No team members yet"}
            </p>
            {query && (
              <Button size="sm" variant="secondary" className="rounded-xl" onPress={() => setGlobalFilter("")}>
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/50 border-t border-border/50 md:border-t-0">
            {rows.map((row) => {
              const { isSelf } = rowCaps(row);
              return (
                <li key={row.id} className={cn(ROW_GRID, "flex flex-col gap-3 px-4 py-4 sm:px-6 md:py-3", !row.isActive && row.role !== "pending" && "opacity-70")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar size="sm" className="shrink-0">
                      {row.avatarUrl ? <Avatar.Image src={row.avatarUrl} alt="" /> : null}
                      <Avatar.Fallback className="font-semibold">{getInitials(row.fullName)}</Avatar.Fallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="truncate">{row.fullName || "Unnamed"}</span>
                        {isSelf && (
                          <Chip size="sm" variant="secondary" className="shrink-0">
                            You
                          </Chip>
                        )}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{row.email}</p>
                    </div>
                    {/* Phones: access control sits beside the name */}
                    <div className="shrink-0 md:hidden">{renderStatus(row)}</div>
                  </div>

                  <div className="flex items-center gap-3 md:block">
                    <div className="min-w-0 flex-1">{renderRole(row)}</div>
                    <span className="shrink-0 text-xs text-muted-foreground md:hidden">{lastSeen(row)}</span>
                  </div>
                  <span className="hidden text-sm text-muted-foreground md:block">{lastSeen(row)}</span>
                  <div className="hidden justify-end md:flex">{renderStatus(row)}</div>
                </li>
              );
            })}
          </ul>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border/50 px-4 py-3 sm:px-6">
            <span className="text-xs tabular-nums text-muted-foreground">
              Page {currentPage} of {pageCount}
            </span>
            <div className="flex gap-2">
              <Button isIconOnly variant="secondary" aria-label="Previous page" className="rounded-xl" isDisabled={currentPage <= 1} onPress={() => setPage(currentPage - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button isIconOnly variant="secondary" aria-label="Next page" className="rounded-xl" isDisabled={currentPage >= pageCount} onPress={() => setPage(currentPage + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Invite modal */}
      <Modal.Backdrop isOpen={isInviteOpen} onOpenChange={handleInviteOpenChange}>
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog className="rounded-3xl sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="text-lg font-semibold text-foreground">Invite staff</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <Select
                fullWidth
                value={inviteRole}
                onChange={(v) => {
                  if (!v) return;
                  setInviteRole(String(v) as AssignableRole);
                  setInviteLink("");
                }}
              >
                <Label>Role</Label>
                <Select.Trigger className="min-h-11 rounded-xl sm:min-h-10">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {assignableRoleOptions.map((o) => (
                      <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
                        {o.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              {inviteLink ? (
                <>
                  <TextField fullWidth isReadOnly value={inviteLink}>
                    <Label>Invite link</Label>
                    <Input className="bg-secondary/60 font-mono text-sm" />
                  </TextField>
                  <p className="text-xs text-muted-foreground">
                    Anyone with this link joins as {ROLE_LABEL[inviteRole]}.
                  </p>
                </>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="flex-col-reverse gap-2 sm:flex-row">
              {inviteLink ? (
                <>
                  <Button variant="secondary" fullWidth onPress={handleShareWhatsApp} className="rounded-xl">
                    <Share2 className="size-4" />
                    WhatsApp
                  </Button>
                  <Button variant="primary" fullWidth onPress={handleCopyLink} className="rounded-xl font-semibold">
                    <Copy className="size-4" />
                    Copy link
                  </Button>
                </>
              ) : (
                <Button variant="primary" fullWidth onPress={handleGenerateInvite} isPending={isGenerating} className="rounded-xl font-semibold">
                  Create invite link
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Deactivate confirmation — deactivating force-signs-out the member */}
      <AlertDialog.Backdrop
        isOpen={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="rounded-3xl sm:max-w-sm">
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading className="text-lg font-semibold text-foreground">
                Remove {deactivateTarget?.fullName || "this person"}&apos;s access?
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-muted-foreground">They&apos;re signed out right away. You can turn access back on later.</p>
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row">
              <Button slot="close" variant="tertiary" className="rounded-xl" isDisabled={isDeactivating}>
                Cancel
              </Button>
              <Button variant="danger" className="rounded-xl font-semibold" onPress={confirmDeactivate} isPending={isDeactivating}>
                Remove access
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
