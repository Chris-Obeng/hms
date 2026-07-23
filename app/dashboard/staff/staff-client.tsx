"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { format, parseISO } from "date-fns";
import {
  Search,
  Shield,
  ShieldCheck,
  ShieldHalf,
  Eye,
  ShieldOff,
  UserCheck,
  UserX,
  Users,
  Copy,
  Share2,
  Plus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  isSuperAdmin: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ROLE_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
> = {
  super_admin: {
    label: "Super Admin",
    icon: ShieldCheck,
    color: "text-amber-600",
    bg: "bg-amber-500/10",
  },
  manager: {
    label: "Manager",
    icon: ShieldHalf,
    color: "text-blue-600",
    bg: "bg-blue-500/10",
  },
  front_desk: {
    label: "Front Desk",
    icon: Shield,
    color: "text-emerald-600",
    bg: "bg-emerald-500/10",
  },
  read_only: {
    label: "Read Only",
    icon: Eye,
    color: "text-slate-600",
    bg: "bg-slate-500/10",
  },
  pending: {
    label: "Pending",
    icon: ShieldOff,
    color: "text-amber-600",
    bg: "bg-amber-500/10",
  },
};

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "manager", label: "Manager" },
  { value: "front_desk", label: "Front Desk" },
  { value: "read_only", label: "Read Only" },
];

// ── Component ──────────────────────────────────────────────────────

export function StaffClient({ data, currentUserId, isSuperAdmin }: StaffClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [localData, setLocalData] = React.useState(data);

  // ── Invite Link States ──────────────────────────────────────────
  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [inviteRole, setInviteRole] = React.useState<"super_admin" | "manager" | "front_desk" | "read_only">("front_desk");
  const [inviteLink, setInviteLink] = React.useState("");
  const [isGenerating, setIsGenerating] = React.useState(false);

  React.useEffect(() => {
    setLocalData(data);
  }, [data]);

  const filtered = React.useMemo(() => {
    if (!searchQuery.trim()) return localData;
    const q = searchQuery.toLowerCase();
    return localData.filter(
      (s) =>
        (s.fullName || "").toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q)
    );
  }, [localData, searchQuery]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleToggleActive = async (staffId: string, currentActive: boolean) => {
    const result = await toggleStaffActive(staffId, !currentActive);
    if (result.success) {
      setLocalData((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, isActive: !currentActive } : s))
      );
      toast.success(!currentActive ? "Staff member activated" : "Staff member deactivated");
    } else {
      toast.danger(result.error || "Failed to update");
    }
  };

  const handleRoleChange = async (staffId: string, role: string) => {
    const result = await changeStaffRole(
      staffId,
      role as "super_admin" | "manager" | "front_desk" | "read_only"
    );
    if (result.success) {
      setLocalData((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, role } : s))
      );
      toast.success("Role updated");
    } else {
      toast.danger(result.error || "Failed to update role");
    }
  };

  const handleGenerateInvite = async () => {
    setIsGenerating(true);
    setInviteLink("");
    const res = await createShareableInvite(inviteRole);
    setIsGenerating(false);
    if (res.success) {
      setInviteLink(res.url);
      toast.success("Invitation link generated!");
    } else {
      toast.danger(res.error || "Failed to generate link");
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success("Link copied to clipboard!");
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Join our hotel team on HotelOS Pro! Sign up using this link: ${inviteLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Search & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
          <Input
            placeholder="Search staff by name, email, role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 text-sm rounded-xl border-border/60"
          />
        </div>

        {isSuperAdmin && (
          <Dialog open={isInviteOpen} onOpenChange={(open) => {
            setIsInviteOpen(open);
            if (!open) {
              setInviteLink("");
              setInviteRole("front_desk");
            }
          }}>
            <DialogTrigger render={
              <Button className="h-9 text-sm rounded-xl">
                <Plus className="size-4 mr-1.5" />
                Invite Staff Member
              </Button>
            } />

            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Invite Staff Member</DialogTitle>
                <DialogDescription>
                  Generate a shareable signup link. Anyone with this link can sign up and join your hotel organization.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Assign Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "super_admin" | "manager" | "front_desk" | "read_only")}
                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="front_desk">Front Desk</option>
                    <option value="manager">Manager</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="read_only">Read Only</option>
                  </select>
                </div>

                {!inviteLink ? (
                  <Button
                    onClick={handleGenerateInvite}
                    disabled={isGenerating}
                    className="w-full rounded-xl"
                  >
                    {isGenerating ? "Generating..." : "Generate Invite Link"}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={inviteLink}
                        className="h-9 text-sm rounded-xl border-border/60 bg-muted/30"
                      />
                      <Button
                        size="icon-sm"
                        onClick={handleCopyLink}
                        className="rounded-xl shrink-0 h-9 w-9"
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>

                    <Button
                      variant="outline"
                      onClick={handleShareWhatsApp}
                      className="w-full rounded-xl flex items-center justify-center gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      <Share2 className="size-4" />
                      Share via WhatsApp
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Staff Table */}
      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Granted</TableHead>
                <TableHead>Last Login</TableHead>
                {isSuperAdmin && <TableHead className="w-12">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length > 0 ? (
                filtered.map((staff) => {
                  const config = ROLE_CONFIG[staff.role] || ROLE_CONFIG.pending;
                  const isCurrentUser = staff.clerkUserId === currentUserId;
                  const RoleIcon = config.icon;

                  return (
                    <TableRow key={staff.id} className="group">
                      {/* Staff Member */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8 rounded-lg">
                            <AvatarImage src={staff.avatarUrl || undefined} alt={staff.fullName || ""} />
                            <AvatarFallback className="text-xs font-medium rounded-lg bg-muted">
                              {getInitials(staff.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
                                {staff.fullName || "Unnamed"}
                              </span>
                              {isCurrentUser && (
                                <Badge
                                  variant="outline"
                                  className="text-caption px-1 py-0 h-5 text-muted-foreground"
                                >
                                  You
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {staff.email}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Role */}
                      <TableCell>
                        {isSuperAdmin ? (
                          <select
                            value={staff.role}
                            onChange={(e) => handleRoleChange(staff.id, e.target.value)}
                            disabled={isCurrentUser}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md border-0 px-2 py-1 text-xs font-medium outline-none cursor-pointer transition-colors",
                              config.bg,
                              config.color,
                              isCurrentUser && "opacity-60 cursor-not-allowed"
                            )}
                          >
                            {ROLE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value} className="bg-background text-foreground">
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                              config.bg,
                              config.color
                            )}
                          >
                            <RoleIcon className="size-3" />
                            {config.label}
                          </div>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {staff.role === "pending" ? (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                              Pending
                            </Badge>
                          ) : (
                            <button
                              onClick={() => {
                                if (isSuperAdmin && !isCurrentUser) {
                                  handleToggleActive(staff.id, staff.isActive);
                                }
                              }}
                              disabled={!isSuperAdmin || isCurrentUser}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                                staff.isActive
                                  ? "text-emerald-600 bg-emerald-500/10"
                                  : "text-muted-foreground bg-muted",
                                isSuperAdmin && !isCurrentUser && "cursor-pointer hover:opacity-80",
                                (!isSuperAdmin || isCurrentUser) && "cursor-default"
                              )}
                            >
                              {staff.isActive ? (
                                <UserCheck className="size-3" />
                              ) : (
                                <UserX className="size-3" />
                              )}
                              {staff.isActive ? "Active" : "Inactive"}
                            </button>
                          )}
                        </div>
                      </TableCell>

                      {/* Granted */}
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {staff.grantedAt ? formatDate(staff.grantedAt) : "—"}
                        </span>
                      </TableCell>

                      {/* Last Login */}
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {staff.lastLoginAt ? formatDate(staff.lastLoginAt) : "—"}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      {isSuperAdmin && (
                        <TableCell>
                          {!isCurrentUser && (
                            <DropdownMenu>
                              <DropdownMenuTrigger className="inline-flex items-center justify-center size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                                <span className="sr-only">Actions</span>
                                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
                                </svg>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onClick={() => handleToggleActive(staff.id, staff.isActive)}
                                >
                                  {staff.isActive ? (
                                    <>
                                      <UserX className="size-3.5 mr-2" />
                                      Deactivate
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="size-3.5 mr-2" />
                                      Activate
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {ROLE_OPTIONS.filter((opt) => opt.value !== staff.role).map((opt) => (
                                  <DropdownMenuItem
                                    key={opt.value}
                                    onClick={() => handleRoleChange(staff.id, opt.value)}
                                  >
                                    <Shield className="size-3.5 mr-2" />
                                    Make {opt.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={isSuperAdmin ? 6 : 5}
                    className="h-48 text-center"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <Users className="size-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">
                        {searchQuery
                          ? "No staff members match your search"
                          : "No team members yet"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
