"use client";

import * as React from "react";
import {
  CalendarDays,
  CalendarX2,
  CreditCard,
  Globe,
  Mail,
  Phone,
  Plus,
  StickyNote,
  Tag,
  X,
} from "lucide-react";
import { Drawer, Skeleton, Tabs, toast } from "@heroui/react";
import { useRouter } from "next/navigation";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, getInitials, getNights } from "@/lib/format";
import {
  getStatusLabel,
  getPaymentLabel,
  PAYMENT_STATUS_TONE,
} from "@/lib/booking-status";
import {
  updateGuestNotes,
  updateGuestTags,
  updateGuestContact,
  type GuestBookingSummary,
} from "@/app/actions/customers";
import { guestBookingsCache } from "@/lib/cache/guest-bookings-cache";
import { takeGuestBookings } from "@/lib/detail-prefetch";
import type { GuestRow } from "@/components/customers/customers-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const SUGGESTED_TAGS = ["vip", "regular", "flagged", "corporate", "new", "returning"];

/** Only "flagged" carries a hue; "vip" gets the accent; every other tag stays neutral. */
function tagClasses(tag: string) {
  const t = tag.toLowerCase();
  if (t === "flagged") return "bg-[var(--danger)]/10 text-[var(--danger)]";
  if (t === "vip") return "bg-[#0485F714] text-[var(--pen-accent)]";
  return "bg-secondary text-muted-foreground";
}

interface GuestDetailSheetProps {
  guest: GuestRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  /** Notifies the parent list of successful edits so rows never go stale. */
  onGuestUpdated?: (guestId: string, patch: Partial<GuestRow>) => void;
}
export function GuestDetailSheet({
  guest: initialGuest,
  open,
  onOpenChange,
  currency,
  onGuestUpdated,
}: GuestDetailSheetProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [guest, setGuest] = React.useState(initialGuest);
  const [tab, setTab] = React.useState<"overview" | "history">("overview");

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

  const [editingTags, setEditingTags] = React.useState(false);
  const [newTagInput, setNewTagInput] = React.useState("");
  const [savingTags, setSavingTags] = React.useState(false);
  const queryClient = useQueryClient();

  // TanStack as source — hydrates instantly from SSR warm (cap 12). Fallback skeleton only for un-prefetched rows.
  // Seed legacy hover Map into cache once per open (migration).
  const seededGuestRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open || seededGuestRef.current === guest.id) return;
    seededGuestRef.current = guest.id;
    const warmed = takeGuestBookings(guest.id);
    if (warmed) {
      void warmed
        .then((r) => {
          if (r.success) queryClient.setQueryData(guestBookingsCache.key(guest.id), r.data);
        })
        .catch(() => {});
    }
  }, [open, guest.id, queryClient]);

  const bookingsQuery = useQuery({
    ...guestBookingsCache.options(guest.id),
    enabled: open,
  });
  const bookings: GuestBookingSummary[] | null = (bookingsQuery.data as GuestBookingSummary[] | undefined) ?? null;
  const bookingsErrorMsg = bookingsQuery.error instanceof Error ? bookingsQuery.error.message : null;
  React.useEffect(() => {
    if (open && bookingsQuery.isError && bookingsErrorMsg) toast.danger(bookingsErrorMsg);
  }, [open, bookingsQuery.isError, bookingsErrorMsg]);

  // Reset when the sheet opens for a different guest (or reopens).
  const resetKey = `${initialGuest.id}:${open}`;
  const [prevResetKey, setPrevResetKey] = React.useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setGuest(initialGuest);
    // Don't clear TanStack cache — different guest has different key; just reset local UI
    setTab("overview");
    setEditingNotes(false);
    setEditingContact(false);
    setEditingTags(false);
    setNotesDraft(initialGuest.notes || "");
    setContactDraft({
      email: initialGuest.email || "",
      phone: initialGuest.phone || "",
      nationality: initialGuest.nationality || "",
    });
    setNewTagInput("");
    setSavingNotes(false);
    setSavingContact(false);
    setSavingTags(false);
  }

  // ── Handlers ──────────────────────────────────────────────────

  async function handleSaveNotes() {
    const targetId = guest.id;
    setSavingNotes(true);
    try {
      const result = await updateGuestNotes(targetId, { notes: notesDraft });
      if (result.success) {
        setGuest((prev) => (prev.id === targetId ? { ...prev, notes: notesDraft } : prev));
        onGuestUpdated?.(targetId, { notes: notesDraft });
        setEditingNotes(false);
        toast.success("Notes updated");
      } else {
        toast.danger(result.error || "Failed to update notes");
      }
    } catch {
      toast.danger("Failed to update notes — check your connection and retry");
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleSaveContact() {
    const targetId = guest.id;
    setSavingContact(true);
    try {
      const result = await updateGuestContact(targetId, contactDraft);
      if (result.success) {
        const patch: Partial<GuestRow> = {
          email: contactDraft.email || null,
          phone: contactDraft.phone || null,
          nationality: contactDraft.nationality || null,
        };
        setGuest((prev) => (prev.id === targetId ? { ...prev, ...patch } : prev));
        onGuestUpdated?.(targetId, patch);
        setEditingContact(false);
        toast.success("Contact updated");
      } else {
        toast.danger(result.error || "Failed to update contact");
      }
    } catch {
      toast.danger("Failed to update contact — check your connection and retry");
    } finally {
      setSavingContact(false);
    }
  }

  async function handleAddTag(tag: string) {
    if (savingTags) return;
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || guest.tags.includes(trimmed)) return;

    const targetId = guest.id;
    const newTags = [...guest.tags, trimmed];
    setSavingTags(true);
    try {
      const result = await updateGuestTags(targetId, { tags: newTags });
      if (result.success) {
        setGuest((prev) => (prev.id === targetId ? { ...prev, tags: newTags } : prev));
        onGuestUpdated?.(targetId, { tags: newTags });
        setNewTagInput("");
        toast.success(`Tag "${trimmed}" added`);
      } else {
        toast.danger(result.error || "Failed to add tag");
      }
    } catch {
      toast.danger("Failed to add tag — check your connection and retry");
    } finally {
      setSavingTags(false);
    }
  }

  async function handleRemoveTag(tag: string) {
    if (savingTags) return;
    const targetId = guest.id;
    const newTags = guest.tags.filter((t) => t !== tag);
    setSavingTags(true);
    try {
      const result = await updateGuestTags(targetId, { tags: newTags });
      if (result.success) {
        setGuest((prev) => (prev.id === targetId ? { ...prev, tags: newTags } : prev));
        onGuestUpdated?.(targetId, { tags: newTags });
        toast.success(`Tag "${tag}" removed`);
      } else {
        toast.danger(result.error || "Failed to remove tag");
      }
    } catch {
      toast.danger("Failed to remove tag — check your connection and retry");
    } finally {
      setSavingTags(false);
    }
  }

  function handleClose(next: boolean) {
    if (!next) {
      setEditingNotes(false);
      setEditingContact(false);
      setEditingTags(false);
    }
    onOpenChange(next);
  }

  const totalSpend = guest.totalSpend;
  const stayCount = bookings?.length ?? guest.totalStays;
  const roomNights = bookings
    ? bookings.reduce((sum, b) => sum + getNights(b.checkIn, b.checkOut), 0)
    : null;

  return (
    <Drawer.Backdrop
      isOpen={open}
      onOpenChange={(isOpen) => handleClose(isOpen)}
      variant="opaque"
      className="bg-black/40"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          className="
            flex w-full flex-col overflow-hidden rounded-t-3xl bg-card p-0 shadow-[0_-24px_80px_rgb(0_0_0/0.35)]
            h-[min(94dvh,56rem)] max-h-[94dvh]
            md:h-dvh md:max-h-dvh md:w-[min(30rem,100vw)]
            md:rounded-l-3xl md:rounded-r-none
            md:border-l md:border-border/70 md:shadow-[-32px_0_90px_rgb(0_0_0/0.16)]
          "
        >
          {isMobile && <Drawer.Handle className="mt-2.5 shrink-0" />}

          <Drawer.CloseTrigger
            className="absolute right-4 top-4 z-30 grid size-7 place-items-center rounded-full bg-muted/70 text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:top-6"
          />

          {/* ═══ Header ═══ */}
          <Drawer.Header className="shrink-0 flex-col items-start gap-2 border-b border-border/60 bg-card px-6 pb-3.5 pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-[max(1.25rem,4.5rem)]">
            <div className="flex w-full items-center gap-3 pr-8">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#0485F714]">
                <span className="text-sm font-semibold text-[var(--pen-accent)]">
                  {getInitials(guest.fullName)}
                </span>
              </div>
              <Drawer.Heading className="min-w-0 flex-1 truncate text-xl font-semibold tracking-[-0.3px] text-foreground">
                {guest.fullName}
              </Drawer.Heading>
            </div>
            {guest.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pr-8">
                {guest.tags.map((tag) => (
                  <span key={tag}
                    className={cn("inline-flex h-5 items-center rounded-md px-2 text-[10px] font-semibold", tagClasses(tag))}>
                    {tag}
                  </span>
                ))}
                <button type="button" aria-label="Edit tags" onClick={() => setEditingTags((p) => !p)}
                  className="text-[10px] font-medium text-muted-foreground/60 underline-offset-2 hover:text-foreground hover:underline">
                  {editingTags ? "done" : "edit"}
                </button>
              </div>
            )}
            {guest.tags.length === 0 && (
              <button type="button" onClick={() => setEditingTags(true)}
                className="pr-8 text-[10px] font-medium text-muted-foreground/60 underline-offset-2 hover:text-foreground hover:underline">
                + add tags
              </button>
            )}
          </Drawer.Header>

          {/* Tag editor band */}
          {editingTags && (
            <div className="shrink-0 border-b border-border/60 bg-card px-6 py-3">
              <div className="flex flex-wrap gap-1.5">
                {guest.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} aria-label={`Remove tag ${tag}`} disabled={savingTags}
                      className="grid size-4 place-items-center rounded hover:opacity-60 disabled:opacity-40">
                      <X aria-hidden className="size-3" />
                    </button>
                  </span>
                ))}
                {guest.tags.length === 0 && <span className="text-xs text-muted-foreground">No tags assigned.</span>}
              </div>
              {SUGGESTED_TAGS.filter((t) => !guest.tags.includes(t)).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SUGGESTED_TAGS.filter((t) => !guest.tags.includes(t)).map((tag) => (
                    <button key={tag} type="button" onClick={() => handleAddTag(tag)} disabled={savingTags}
                      className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border/70 px-1.5 py-0.5 text-[11px] capitalize text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-40">
                      <Plus aria-hidden className="size-3" />
                      {tag}
                    </button>
                  ))}
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); handleAddTag(newTagInput); }} className="mt-2 flex items-center gap-1.5">
                <input value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} placeholder="Add custom tag…"
                  aria-label="Add custom tag" disabled={savingTags}
                  className="h-9 min-w-0 flex-1 rounded-[10px] border border-border/70 bg-card px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20" />
                <button type="submit" disabled={!newTagInput.trim() || savingTags}
                  className="h-9 shrink-0 rounded-full bg-secondary px-3.5 text-xs font-semibold text-foreground disabled:opacity-40">
                  Add
                </button>
              </form>
            </div>
          )}

          {/* ═══ Underline tabs ═══ */}
          <Tabs
            key={resetKey}
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key as typeof tab)}
            className="guest-tabs flex min-h-0 w-full flex-1 flex-col overflow-hidden"
          >
            <div className="shrink-0 border-b border-border/60 bg-card px-6">
              <Tabs.ListContainer>
                <Tabs.List aria-label="Guest sections" className="flex gap-[22px]">
                  <Tabs.Tab id="overview" className="guest-tabs-tab">
                    Overview<Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="history" className="guest-tabs-tab">
                    History{bookings && bookings.length > 0 ? ` (${bookings.length})` : ""}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {/* ── Overview ── */}
              <Tabs.Panel id="overview" className="flex min-h-full flex-col">
                {/* Stats band */}
                <section aria-label="Guest stats" className="flex items-center gap-[18px] border-b border-border/60 px-6 py-[18px]">
                  <StatCell value={stayCount.toLocaleString("en")} label="stays" />
                  <span className="h-[30px] w-px bg-border/60" aria-hidden="true" />
                  <StatCell value={roomNights === null ? "—" : roomNights.toLocaleString("en")} label="room nights" />
                  <span className="h-[30px] w-px bg-border/60" aria-hidden="true" />
                  <StatCell value={formatCurrency(totalSpend, currency)} label="lifetime spend" />
                </section>

                {/* Contact band */}
                <section aria-label="Guest contact" className="border-b border-border/60 px-6 py-1.5">
                  {editingContact ? (
                    <div className="flex flex-col gap-3 py-2">
                      <ContactField label="Email" value={contactDraft.email} type="email" autoFocus
                        onChange={(v) => setContactDraft((p) => ({ ...p, email: v }))} placeholder="guest@example.com" />
                      <ContactField label="Phone" value={contactDraft.phone} type="tel"
                        onChange={(v) => setContactDraft((p) => ({ ...p, phone: v }))} placeholder="+233 XX XXX XXXX" />
                      <ContactField label="Nationality" value={contactDraft.nationality}
                        onChange={(v) => setContactDraft((p) => ({ ...p, nationality: v }))} placeholder="e.g. Ghanaian" />
                      <div className="flex items-center justify-end gap-2 pb-1">
                        <button type="button" onClick={() => { setEditingContact(false); setContactDraft({ email: guest.email || "", phone: guest.phone || "", nationality: guest.nationality || "" }); }}
                          className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                          Cancel
                        </button>
                        <button type="button" disabled={savingContact} onClick={() => void handleSaveContact()}
                          className="h-8 rounded-full bg-[var(--pen-accent)] px-4 text-xs font-semibold text-white disabled:opacity-60">
                          {savingContact ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ContactRow icon={<Phone aria-hidden className="size-3.5" />}>
                        {guest.phone ? (
                          <a href={`tel:${guest.phone}`} className="text-foreground hover:underline">{guest.phone}</a>
                        ) : <span className="text-muted-foreground/70">No phone on file</span>}
                      </ContactRow>
                      <ContactRow icon={<Mail aria-hidden className="size-3.5" />}>
                        {guest.email ? (
                          <a href={`mailto:${guest.email}`} className="text-foreground hover:underline">{guest.email}</a>
                        ) : <span className="text-muted-foreground/70">No email on file</span>}
                      </ContactRow>
                      <ContactRow icon={<Globe aria-hidden className="size-3.5" />}>
                        {guest.nationality || <span className="text-muted-foreground/70">No nationality set</span>}
                      </ContactRow>
                      {guest.nationalId && (
                        <ContactRow icon={<CreditCard aria-hidden className="size-3.5" />}>
                          ID · {guest.nationalId}
                        </ContactRow>
                      )}
                      <ContactRow icon={<CalendarDays aria-hidden className="size-3.5" />}>
                        Guest since {formatDate(guest.createdAt, "MMM yyyy")}
                      </ContactRow>
                      <button type="button"
                        onClick={() => {
                          setContactDraft({ email: guest.email || "", phone: guest.phone || "", nationality: guest.nationality || "" });
                          setEditingContact(true);
                        }}
                        className="flex items-center gap-2.5 py-2 text-[13px] font-medium text-[var(--pen-accent)]">
                        Edit contact
                      </button>
                    </>
                  )}
                </section>

                {/* Notes band fills the rest */}
                <section aria-label="Guest notes" className="flex flex-1 flex-col gap-2.5 px-6 pb-5 pt-4">
                  <div className="flex items-center gap-2.5">
                    <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                      Notes
                      {guest.notes && <span aria-hidden className="size-1.5 rounded-full bg-[var(--warning)]" />}
                    </h3>
                    <span className="min-w-0 flex-1" aria-hidden="true" />
                    <button type="button" aria-label={editingNotes ? "Close notes editor" : "Edit notes"}
                      onClick={() => { setNotesDraft(guest.notes || ""); setEditingNotes((p) => !p); }}
                      className={cn("grid size-6 place-items-center rounded-md transition-colors hover:bg-muted hover:text-foreground",
                        editingNotes ? "text-foreground" : "text-muted-foreground/60")}>
                      <StickyNote className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  {editingNotes ? (
                    <div className="flex flex-col gap-2">
                      <textarea rows={5} value={notesDraft} maxLength={2000} autoFocus
                        onChange={(event) => setNotesDraft(event.target.value)}
                        placeholder="Internal notes about this guest (preferences, special needs, incidents)…"
                        className="w-full resize-none rounded-xl border border-border/60 bg-card px-3 py-2.5 text-xs leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20" />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setEditingNotes(false); setNotesDraft(guest.notes || ""); }}
                          className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                          Cancel
                        </button>
                        <button type="button" disabled={savingNotes} onClick={() => void handleSaveNotes()}
                          className="h-8 rounded-full bg-[var(--pen-accent)] px-4 text-xs font-semibold text-white disabled:opacity-60">
                          {savingNotes ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                      {guest.notes || <span className="text-muted-foreground/70">No notes recorded for this guest.</span>}
                    </p>
                  )}
                </section>
              </Tabs.Panel>

              {/* ── History ── */}
              <Tabs.Panel id="history" className="px-6 py-2">
                <BookingHistory open={open} bookings={bookings} currency={currency} />
              </Tabs.Panel>
            </div>
          </Tabs>

          {/* Footer CTA */}
          <div className="shrink-0 border-t border-border/60 bg-card px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5">
            <button type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("roomline:new-booking"));
                if (router) router.push("/dashboard");
              }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[var(--pen-accent)] text-[13px] font-semibold text-white transition-transform active:scale-[0.99]">
              New booking
            </button>
          </div>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return <div className="flex min-w-0 flex-col gap-1">
    <span className="font-mono text-base font-semibold tabular-nums text-foreground">{value}</span>
    <span className="text-[11px] text-muted-foreground">{label}</span>
  </div>;
}

function ContactRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5 py-2 text-[13px] text-foreground">
    <span className="text-muted-foreground/60">{icon}</span>
    <span className="min-w-0 flex-1 truncate">{children}</span>
  </div>;
}

function ContactField({ label, value, onChange, placeholder, type, autoFocus }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  const id = React.useId();
  return <div>
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
    <input id={id} type={type} value={value} placeholder={placeholder} autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-[10px] border border-border/70 bg-card px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20" />
  </div>;
}

// ── Booking history tab ────────────────────────────────────────────

/** One display reservation = one group (siblings folded) or a lone booking.
 *  All of a guest's rows are fetched, so every sibling is present to fold. */
interface HistoryReservation {
  key: string;
  reference: string;
  status: string;
  paymentStatus: string;
  checkIn: string;
  checkOut: string;
  nights: number | null;
  totalAmount: number;
  roomsTotal: number;
  roomTypeName: string | null;
  roomNumber: string | null;
}

/** Fold sibling rows into one reservation each, preserving created_at-desc order
 *  (input is already sorted, and Map keeps first-seen insertion order). */
function foldReservations(bookings: GuestBookingSummary[]): HistoryReservation[] {
  const groups = new Map<string, GuestBookingSummary[]>();
  for (const b of bookings) {
    const key = b.groupId ?? b.id;
    const bucket = groups.get(key);
    if (bucket) bucket.push(b);
    else groups.set(key, [b]);
  }

  const out: HistoryReservation[] = [];
  for (const [key, lines] of groups) {
    // Anchor = the row whose own id is the shared group id (guest-facing ref).
    const anchor = lines.find((l) => l.id === key) ?? lines[0];
    const roomsTotal = lines.reduce((s, l) => s + Math.max(1, l.roomsCount), 0);
    const totalAmount = lines.reduce((s, l) => s + l.totalAmount, 0);
    const checkIn = lines.reduce((m, l) => (l.checkIn < m ? l.checkIn : m), anchor.checkIn);
    const checkOut = lines.reduce((m, l) => (l.checkOut > m ? l.checkOut : m), anchor.checkOut);
    out.push({
      key,
      reference: anchor.reference,
      status: anchor.status,
      paymentStatus: anchor.paymentStatus,
      checkIn,
      checkOut,
      nights: getNights(checkIn, checkOut),
      totalAmount,
      roomsTotal,
      roomTypeName: anchor.roomTypeName,
      roomNumber: anchor.roomNumber,
    });
  }
  return out;
}

function BookingHistory({
  open,
  bookings,
  currency,
}: {
  open: boolean;
  bookings: GuestBookingSummary[] | null;
  currency: string;
}) {
  if (open && bookings === null) {
    return (
      <div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="py-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="h-3.5 w-16 rounded" />
            </div>
            <Skeleton className="mt-2 h-3 w-40 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!bookings || bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CalendarX2 aria-hidden className="mb-2 size-6 text-muted-foreground/30" />
        <p className="text-[13px] font-medium text-foreground">No booking history</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">This guest has no bookings yet.</p>
      </div>
    );
  }

  const reservations = foldReservations(bookings);

  return (
    <div>
      {reservations.map((r) => (
        <div key={r.key} className="border-b border-border/50 py-3 last:border-b-0">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-[13px] font-medium text-foreground">
                {r.reference}
              </span>
              {r.roomsTotal > 1 && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {r.roomsTotal} rooms
                </span>
              )}
            </span>
            <StatusChip status={r.status} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {formatDate(r.checkIn, "MMM d")} → {formatDate(r.checkOut, "MMM d")}
            {r.nights ? ` · ${r.nights} night${r.nights > 1 ? "s" : ""}` : ""}
            {r.roomsTotal > 1
              ? ""
              : r.roomTypeName
                ? ` · ${r.roomTypeName}`
                : ""}
            {r.roomsTotal > 1 ? "" : r.roomNumber ? ` · Rm ${r.roomNumber}` : ""}
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
              {formatCurrency(r.totalAmount, currency)}
            </span>
            <span className={cn("text-[11px] font-medium", PAYMENT_STATUS_TONE[r.paymentStatus] ?? "text-muted-foreground")}>
              {getPaymentLabel(r.paymentStatus)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Booking-status chip (monochrome label + status dot) ────────────

const HISTORY_DOTS: Record<string, string> = {
  confirmed: "bg-[var(--pen-accent)]",
  checked_in: "bg-[var(--success)]",
  checked_out: "bg-muted-foreground/40",
  cancelled: "bg-[var(--danger)]",
  no_show: "bg-[var(--danger)]",
  pending: "bg-[var(--warning)]",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", HISTORY_DOTS[status] ?? "bg-muted-foreground")} />
      {getStatusLabel(status)}
    </span>
  );
}
