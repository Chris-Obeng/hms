"use client";

import * as React from "react";
import {
  CalendarDays,
  Mail,
  Phone,
  Globe,
  CreditCard,
  Tag,
  Edit3,
  Check,
  X,
  Plus,
  MapPin,
  Clock,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import { toast } from "@heroui/react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, getInitials } from "@/lib/format";
import { getPaymentVariant, getStatusLabel, getStatusVariant } from "@/lib/booking-status";
import {
  getGuestBookings,
  updateGuestNotes,
  updateGuestTags,
  updateGuestContact,
  type GuestBookingSummary,
} from "@/app/actions/customers";
import type { GuestRow } from "@/components/customers/customers-table";

const TAG_STYLES: Record<string, { color: string; bg: string }> = {
  vip: { color: "text-amber-600", bg: "bg-amber-500/10" },
  regular: { color: "text-blue-600", bg: "bg-blue-500/10" },
  flagged: { color: "text-red-600", bg: "bg-red-500/10" },
  corporate: { color: "text-purple-600", bg: "bg-purple-500/10" },
  new: { color: "text-emerald-600", bg: "bg-emerald-500/10" },
  returning: { color: "text-teal-600", bg: "bg-teal-500/10" },
};

function getTagStyle(tag: string) {
  const lower = tag.toLowerCase();
  return TAG_STYLES[lower] || { color: "text-muted-foreground", bg: "bg-muted" };
}

const SUGGESTED_TAGS = ["vip", "regular", "flagged", "corporate", "new", "returning"];

// ── Props ──────────────────────────────────────────────────────────

interface GuestDetailSheetProps {
  guest: GuestRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  /** Notifies the parent list of successful edits so rows never go stale. */
  onGuestUpdated?: (guestId: string, patch: Partial<GuestRow>) => void;
}

// ── Stat Card ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  highlighted = false,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  highlighted?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2.5 rounded-xl border p-3",
      highlighted ? "border-foreground/20 bg-foreground/5" : "border-border/50 bg-muted/10"
    )}>
      <div className="size-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span className={cn(
          "text-sm font-semibold tabular-nums truncate",
          highlighted ? "text-foreground" : "text-foreground/90"
        )}>
          {value}
        </span>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────

export function GuestDetailSheet({
  guest: initialGuest,
  open,
  onOpenChange,
  currency,
  onGuestUpdated,
}: GuestDetailSheetProps) {
  // ── State ─────────────────────────────────────────────────────
  const [guest, setGuest] = React.useState(initialGuest);
  const [bookings, setBookings] = React.useState<GuestBookingSummary[] | null>(null);
  const [activeTab, setActiveTab] = React.useState<"overview" | "bookings">("overview");

  // Edit states
  const [editingNotes, setEditingNotes] = React.useState(false);
  const [notesDraft, setNotesDraft] = React.useState(guest.notes || "");
  const [savingNotes, setSavingNotes] = React.useState(false);

  const [editingContact, setEditingContact] = React.useState(false);
  const [contactDraft, setContactDraft] = React.useState({
    email: guest.email || "",
    phone: guest.phone || "",
    nationality: guest.nationality || "",
  });
  const [savingContact, setSavingContact] = React.useState(false);

  const [newTagInput, setNewTagInput] = React.useState("");
  const [savingTags, setSavingTags] = React.useState(false);

  // ── Fetch bookings when sheet opens ───────────────────────────
  // Loading is derived (open && bookings === null) — no sync setState here.
  React.useEffect(() => {
    if (!open || bookings !== null) return;
    let cancelled = false;
    getGuestBookings(guest.id).then((result) => {
      if (cancelled) return;
      setBookings(result.success ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, guest.id, bookings]);

  // Reset when the sheet opens for a different guest (or reopens). Adjusting
  // state during render is the documented alternative to a reset effect.
  const resetKey = `${initialGuest.id}:${open}`;
  const [prevResetKey, setPrevResetKey] = React.useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setGuest(initialGuest);
    setBookings(null);
    setActiveTab("overview");
    setEditingNotes(false);
    setEditingContact(false);
    setNotesDraft(initialGuest.notes || "");
    setContactDraft({
      email: initialGuest.email || "",
      phone: initialGuest.phone || "",
      nationality: initialGuest.nationality || "",
    });
    setNewTagInput("");
  }

  // ── Handlers ──────────────────────────────────────────────────

  async function handleSaveNotes() {
    setSavingNotes(true);
    const result = await updateGuestNotes(guest.id, { notes: notesDraft });
    setSavingNotes(false);
    if (result.success) {
      setGuest((prev) => ({ ...prev, notes: notesDraft }));
      onGuestUpdated?.(guest.id, { notes: notesDraft });
      setEditingNotes(false);
      toast.success("Notes updated");
    } else {
      toast.danger(result.error || "Failed to update notes");
    }
  }

  async function handleSaveContact() {
    setSavingContact(true);
    const result = await updateGuestContact(guest.id, contactDraft);
    setSavingContact(false);
    if (result.success) {
      const patch: Partial<GuestRow> = {
        email: contactDraft.email || null,
        phone: contactDraft.phone || null,
        nationality: contactDraft.nationality || null,
      };
      setGuest((prev) => ({ ...prev, ...patch }));
      onGuestUpdated?.(guest.id, patch);
      setEditingContact(false);
      toast.success("Contact updated");
    } else {
      toast.danger(result.error || "Failed to update contact");
    }
  }

  async function handleAddTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || guest.tags.includes(trimmed)) return;

    const newTags = [...guest.tags, trimmed];
    setSavingTags(true);
    const result = await updateGuestTags(guest.id, { tags: newTags });
    setSavingTags(false);

    if (result.success) {
      setGuest((prev) => ({ ...prev, tags: newTags }));
      onGuestUpdated?.(guest.id, { tags: newTags });
      setNewTagInput("");
      toast.success(`Tag "${trimmed}" added`);
    } else {
      toast.danger(result.error || "Failed to add tag");
    }
  }

  async function handleRemoveTag(tag: string) {
    const newTags = guest.tags.filter((t) => t !== tag);
    setSavingTags(true);
    const result = await updateGuestTags(guest.id, { tags: newTags });
    setSavingTags(false);

    if (result.success) {
      setGuest((prev) => ({ ...prev, tags: newTags }));
      onGuestUpdated?.(guest.id, { tags: newTags });
      toast.success(`Tag "${tag}" removed`);
    } else {
      toast.danger(result.error || "Failed to remove tag");
    }
  }

  function handleClose(open: boolean) {
    if (!open) {
      setBookings(null);
      setEditingNotes(false);
      setEditingContact(false);
    }
    onOpenChange(open);
  }

  // ── Compute lifetime stats ────────────────────────────────────
  const totalRevenue = guest.totalSpend;
  const avgPerStay = guest.totalStays > 0 ? totalRevenue / guest.totalStays : 0;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 gap-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0 ring-1 ring-border/40">
              <span className="text-sm font-semibold text-foreground">
                {getInitials(guest.fullName)}
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <SheetTitle className="text-lg truncate">
                {guest.fullName}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Guest since {formatDate(guest.createdAt)}
              </SheetDescription>
            </div>
          </div>

          {/* Tags row */}
          {guest.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {guest.tags.map((tag) => {
                const style = getTagStyle(tag);
                return (
                  <span
                    key={tag}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium capitalize",
                      style.bg,
                      style.color
                    )}
                  >
                            {tag}
                            <button
                              onClick={() => handleRemoveTag(tag)}
                              aria-label={`Remove tag ${tag}`}
                              className="hover:opacity-70 transition-opacity"
                              disabled={savingTags}
                            >
                              <X className="size-2.5" />
                            </button>
                  </span>
                );
              })}
            </div>
          )}
        </SheetHeader>

        {/* Tabs */}
        <div className="flex border-b border-border/20 px-5">
          <button
            onClick={() => setActiveTab("overview")}
            className={cn(
              "px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px",
              activeTab === "overview"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("bookings")}
            className={cn(
              "px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5",
              activeTab === "bookings"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Booking History
            {bookings && (
              <span className="text-[10px] text-muted-foreground/60">
                ({bookings.length})
              </span>
            )}
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* ════ TAB: Overview ════ */}
          {activeTab === "overview" && (
            <>
              {/* Lifetime Stats */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  label="Total Stays"
                  value={guest.totalStays.toString()}
                  icon={CalendarDays}
                />
                <StatCard
                  label="Total Spent"
                  value={formatCurrency(totalRevenue, currency)}
                  icon={CreditCard}
                  highlighted
                />
                <StatCard
                  label="Last Stay"
                  value={formatDate(guest.lastStayDate)}
                  icon={Clock}
                />
                <StatCard
                  label="Avg / Stay"
                  value={formatCurrency(avgPerStay, currency)}
                  icon={ArrowUpRight}
                />
              </div>

              <Separator className="opacity-40" />

              {/* Contact Information */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Contact Information
                  </h3>
                  {!editingContact ? (
                    <button
                      onClick={() => setEditingContact(true)}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <Edit3 className="size-3" />
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleSaveContact}
                        disabled={savingContact}
                        className="text-[10px] text-emerald-600 hover:text-emerald-500 transition-colors flex items-center gap-1"
                      >
                        <Check className="size-3" />
                        {savingContact ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingContact(false);
                          setContactDraft({
                            email: guest.email || "",
                            phone: guest.phone || "",
                            nationality: guest.nationality || "",
                          });
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      >
                        <X className="size-3" />
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {editingContact ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50 pointer-events-none" />
                        <Input
                          value={contactDraft.email}
                          onChange={(e) => setContactDraft((prev) => ({ ...prev, email: e.target.value }))}
                          placeholder="guest@example.com"
                          className="h-8 pl-8 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                        Phone
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50 pointer-events-none" />
                        <Input
                          value={contactDraft.phone}
                          onChange={(e) => setContactDraft((prev) => ({ ...prev, phone: e.target.value }))}
                          placeholder="+233 XX XXX XXXX"
                          className="h-8 pl-8 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                        Nationality
                      </label>
                      <div className="relative">
                        <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50 pointer-events-none" />
                        <Input
                          value={contactDraft.nationality}
                          onChange={(e) => setContactDraft((prev) => ({ ...prev, nationality: e.target.value }))}
                          placeholder="e.g. Ghanaian"
                          className="h-8 pl-8 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5 text-sm">
                      <Mail className="size-3.5 text-muted-foreground/60 shrink-0" />
                      <span className="text-foreground">
                        {guest.email || <span className="text-muted-foreground/50 italic">No email</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm">
                      <Phone className="size-3.5 text-muted-foreground/60 shrink-0" />
                      <span className="text-foreground">
                        {guest.phone || <span className="text-muted-foreground/50 italic">No phone</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm">
                      <Globe className="size-3.5 text-muted-foreground/60 shrink-0" />
                      <span className="text-foreground">
                        {guest.nationality || <span className="text-muted-foreground/50 italic">Not set</span>}
                      </span>
                    </div>
                    {guest.nationalId && (
                      <div className="flex items-center gap-2.5 text-sm">
                        <MapPin className="size-3.5 text-muted-foreground/60 shrink-0" />
                        <span className="text-foreground">ID: {guest.nationalId}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator className="opacity-40" />

              {/* Tags Management */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Tags
                  </h3>
                </div>
                <div className="space-y-2">
                  {/* Current tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {guest.tags.length === 0 ? (
                      <span className="text-xs text-muted-foreground/50 italic">
                        No tags assigned
                      </span>
                    ) : (
                      guest.tags.map((tag) => {
                        const style = getTagStyle(tag);
                        return (
                          <span
                            key={tag}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium capitalize",
                              style.bg,
                              style.color
                            )}
                          >
                            {tag}
                            <button
                              onClick={() => handleRemoveTag(tag)}
                              aria-label={`Remove tag ${tag}`}
                              className="hover:opacity-70 transition-opacity"
                              disabled={savingTags}
                            >
                              <X className="size-2.5" />
                            </button>
                          </span>
                        );
                      })
                    )}
                  </div>

                  {/* Suggested tags */}
                  <div className="flex flex-wrap gap-1">
                    {SUGGESTED_TAGS.filter((t) => !guest.tags.includes(t)).map(
                      (tag) => (
                        <button
                          key={tag}
                          onClick={() => handleAddTag(tag)}
                          disabled={savingTags}
                          className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors capitalize"
                        >
                          <Plus className="size-2.5" />
                          {tag}
                        </button>
                      )
                    )}
                  </div>

                  {/* Custom tag input */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddTag(newTagInput);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <div className="relative flex-1">
                      <Tag className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50 pointer-events-none" />
                      <Input
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        placeholder="Add custom tag..."
                        className="h-7 pl-7 rounded-lg text-[11px]"
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      disabled={!newTagInput.trim() || savingTags}
                      className="h-7 text-xs rounded-lg px-2"
                    >
                      Add
                    </Button>
                  </form>
                </div>
              </div>

              <Separator className="opacity-40" />

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Notes
                  </h3>
                  {!editingNotes && (
                    <button
                      onClick={() => {
                        setNotesDraft(guest.notes || "");
                        setEditingNotes(true);
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <Edit3 className="size-3" />
                      {guest.notes ? "Edit" : "Add"}
                    </button>
                  )}
                </div>

                {editingNotes ? (
                  <div className="space-y-2">
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Internal notes about this guest (preferences, special needs, incidents)..."
                      rows={4}
                      maxLength={2000}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground resize-none"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground/50">
                        {notesDraft.length}/2000
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingNotes(false);
                            setNotesDraft(guest.notes || "");
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveNotes}
                          disabled={savingNotes}
                          className="text-[10px] bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-lg px-3 py-1 font-medium"
                        >
                          {savingNotes ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {guest.notes || (
                      <span className="text-muted-foreground/50 italic">
                        No notes recorded for this guest.
                      </span>
                    )}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ════ TAB: Booking History ════ */}
          {activeTab === "bookings" && (
            <>
              {open && bookings === null ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border/30">
                      <Skeleton className="size-8 rounded-lg" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-md" />
                    </div>
                  ))}
                </div>
              ) : bookings && bookings.length > 0 ? (
                <div className="space-y-2">
                  {bookings.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-border/30 hover:border-border/60 transition-colors"
                    >
                      <div className="size-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
                        <CalendarDays className="size-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-foreground">
                            {b.reference}
                          </span>
                          <Badge variant={getStatusVariant(b.status)} className="text-[9px] px-1 py-0 h-4">
                            {getStatusLabel(b.status)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span>
                            {formatDate(b.checkIn)} → {formatDate(b.checkOut)}
                          </span>
                          {b.nights && (
                            <span>
                              · {b.nights} night{b.nights > 1 ? "s" : ""}
                            </span>
                          )}
                          {b.roomTypeName && <span>· {b.roomTypeName}</span>}
                          {b.roomNumber && <span>· Rm {b.roomNumber}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-medium text-foreground tabular-nums">
                            {formatCurrency(b.totalAmount, currency)}
                          </span>
                          <Badge variant={getPaymentVariant(b.paymentStatus)} className="text-[9px] px-1 py-0 h-4">
                            {b.paymentStatus === "paid"
                              ? "Paid"
                              : b.paymentStatus === "partial"
                              ? "Partial"
                              : b.paymentStatus === "unpaid"
                              ? "Unpaid"
                              : b.paymentStatus}
                          </Badge>
                        </div>
                      </div>
                      <ChevronRight className="size-3.5 text-muted-foreground/30 mt-1.5 shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <CalendarDays className="size-8 text-muted-foreground/20 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">
                    No booking history
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    This guest has no bookings yet.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
