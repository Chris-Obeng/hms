"use client";

import * as React from "react";
import {
  Mail,
  Phone,
  Globe,
  MapPin,
  Tag,
  Plus,
  X,
  PenLine,
  StickyNote,
  Contact,
  CalendarX2,
  BedDouble,
} from "lucide-react";
import { Accordion, Button, Drawer, Input, Skeleton, Tabs, toast } from "@heroui/react";

import { useIsMobile } from "@/hooks/use-mobile";
import { AccordionSection } from "@/components/ui/accordion-section";
import { ContactEmpty, ContactLink, ContactStatic } from "@/components/ui/contact-row";
import { MiniStat } from "@/components/ui/mini-stat";
import { NotesEditor } from "@/components/ui/notes-editor";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, getInitials, getNights } from "@/lib/format";
import {
  STATUS_COLORS,
  getStatusLabel,
  getPaymentLabel,
  PAYMENT_STATUS_TONE,
} from "@/lib/booking-status";
import {
  getGuestBookings,
  updateGuestNotes,
  updateGuestTags,
  updateGuestContact,
  type GuestBookingSummary,
} from "@/app/actions/customers";
import type { GuestRow } from "@/components/customers/customers-table";

const SUGGESTED_TAGS = ["vip", "regular", "flagged", "corporate", "new", "returning"];

// Only "flagged" carries a hue; every other tag stays neutral.
function tagClasses(tag: string) {
  return tag.toLowerCase() === "flagged"
    ? "bg-red-500/10 text-red-600"
    : "bg-muted text-muted-foreground";
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
  const [guest, setGuest] = React.useState(initialGuest);
  const [bookings, setBookings] = React.useState<GuestBookingSummary[] | null>(null);

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

  // Fetch bookings when the sheet opens. Loading is derived (open && bookings === null).
  React.useEffect(() => {
    if (!open || bookings !== null) return;
    let cancelled = false;
    getGuestBookings(guest.id)
      .then((result) => {
        if (cancelled) return;
        setBookings(result.success ? result.data : []);
      })
      .catch(() => {
        if (!cancelled) setBookings([]);
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
    setEditingNotes(false);
    setEditingContact(false);
    setNotesDraft(initialGuest.notes || "");
    setContactDraft({
      email: initialGuest.email || "",
      phone: initialGuest.phone || "",
      nationality: initialGuest.nationality || "",
    });
    setNewTagInput("");
    // Stuck loading flags must clear on guest-switch/reopen too.
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
      setBookings(null);
      setEditingNotes(false);
      setEditingContact(false);
    }
    onOpenChange(next);
  }

  const totalRevenue = guest.totalSpend;
  const avgPerStay = guest.totalStays > 0 ? totalRevenue / guest.totalStays : 0;
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
            flex w-full flex-col overflow-hidden rounded-t-3xl bg-background p-0 shadow-[0_-24px_80px_rgb(0_0_0/0.35)]
            h-[min(94dvh,56rem)] max-h-[94dvh]
            md:h-dvh md:max-h-dvh md:w-[min(32rem,100vw)] md:rounded-none
            md:border-l md:border-border/60 md:shadow-[-32px_0_90px_rgb(0_0_0/0.16)]
          "
        >
          {isMobile && <Drawer.Handle className="mt-2.5 shrink-0" />}

          <Drawer.CloseTrigger
            className="
              absolute right-4 top-4 z-30 grid size-8 place-items-center rounded-full
              bg-muted/70 text-muted-foreground shadow-xs backdrop-blur transition-all
              hover:bg-muted hover:text-foreground active:scale-95
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
            "
          />

          {/* ═══ Header ═══ */}
          <Drawer.Header className="shrink-0 flex-col items-start gap-2.5 border-b border-border/50 bg-background px-4 pb-4 pr-14 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 md:pt-6">
            <div className="flex w-full items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-muted ring-1 ring-border/50">
                <span className="text-sm font-semibold text-foreground">
                  {getInitials(guest.fullName)}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <Drawer.Heading className="truncate text-lg font-bold tracking-tight text-foreground">
                  {guest.fullName}
                </Drawer.Heading>
                <p className="text-[11px] text-muted-foreground">
                  Guest since {formatDate(guest.createdAt)}
                </p>
              </div>
            </div>

            {guest.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {guest.tags.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium capitalize",
                      tagClasses(tag)
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </Drawer.Header>

          {/* ═══ Tabs + content ═══ */}
          <Tabs
            key={resetKey}
            defaultSelectedKey="overview"
            className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <Tabs.ListContainer className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-4 py-2 backdrop-blur-md sm:px-5">
                <Tabs.List aria-label="Guest sections" className="grid w-full grid-cols-2">
                  <SegmentedTab id="overview">Overview</SegmentedTab>
                  <SegmentedTab id="bookings">
                    History
                    {bookings && bookings.length > 0 && (
                      <span className="ml-1 font-normal text-muted-foreground/70">
                        {bookings.length}
                        <span className="sr-only"> bookings</span>
                      </span>
                    )}
                  </SegmentedTab>
                </Tabs.List>
              </Tabs.ListContainer>

              {/* ── Overview ── */}
              <Tabs.Panel id="overview" className="space-y-4 px-4 py-4 sm:px-5">
                {/* Lifetime value */}
                <section
                  aria-label="Lifetime value"
                  className="rounded-2xl border border-border/60 bg-card p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Lifetime value
                  </p>
                  <p className="mt-1 text-kpi tabular-nums text-foreground">
                    {formatCurrency(totalRevenue, currency)}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3">
                    <MiniStat label="Stays" value={guest.totalStays.toString()} strong />
                    <MiniStat label="Avg / stay" value={formatCurrency(avgPerStay, currency)} />
                    <MiniStat label="Last stay" value={formatDate(guest.lastStayDate)} />
                  </div>
                </section>
                {/* Contact · Tags · Notes */}
                <Accordion
                  variant="surface"
                  allowsMultipleExpanded
                  defaultExpandedKeys={["contact", "notes"]}
                  className="w-full"
                >
                {/* ── Contact ── */}
                <AccordionSection
                  id="contact"
                  icon={<Contact aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
                  title="Contact"
                  bodyClassName="space-y-3"
                >
                  {editingContact ? (
                    <>
                      <ContactField
                        label="Email"
                        icon={<Mail aria-hidden className="size-3.5" />}
                        value={contactDraft.email}
                        onChange={(v) => setContactDraft((p) => ({ ...p, email: v }))}
                        placeholder="guest@example.com"
                        type="email"
                        autoFocus
                      />
                      <ContactField
                        label="Phone"
                        icon={<Phone aria-hidden className="size-3.5" />}
                        value={contactDraft.phone}
                        onChange={(v) => setContactDraft((p) => ({ ...p, phone: v }))}
                        placeholder="+233 XX XXX XXXX"
                        type="tel"
                      />
                      <ContactField
                        label="Nationality"
                        icon={<Globe aria-hidden className="size-3.5" />}
                        value={contactDraft.nationality}
                        onChange={(v) => setContactDraft((p) => ({ ...p, nationality: v }))}
                        placeholder="e.g. Ghanaian"
                      />
                      <EditActions
                        saving={savingContact}
                        onSave={handleSaveContact}
                        onCancel={() => {
                          setEditingContact(false);
                          setContactDraft({
                            email: guest.email || "",
                            phone: guest.phone || "",
                            nationality: guest.nationality || "",
                          });
                        }}
                      />
                    </>
                  ) : (
                    <>
                      {guest.email ? (
                        <ContactLink href={`mailto:${guest.email}`} icon={<Mail aria-hidden className="size-4" />}>
                          {guest.email}
                        </ContactLink>
                      ) : (
                        <ContactEmpty icon={<Mail aria-hidden className="size-4" />} label="No email on file" />
                      )}
                      {guest.phone ? (
                        <ContactLink href={`tel:${guest.phone}`} icon={<Phone aria-hidden className="size-4" />}>
                          {guest.phone}
                        </ContactLink>
                      ) : (
                        <ContactEmpty icon={<Phone aria-hidden className="size-4" />} label="No phone on file" />
                      )}
                      {guest.nationality ? (
                        <ContactStatic icon={<Globe aria-hidden className="size-4" />}>
                          {guest.nationality}
                        </ContactStatic>
                      ) : (
                        <ContactEmpty icon={<Globe aria-hidden className="size-4" />} label="No nationality set" />
                      )}
                      {guest.nationalId && (
                        <ContactStatic icon={<MapPin aria-hidden className="size-4" />}>
                          ID · {guest.nationalId}
                        </ContactStatic>
                      )}
                      <div className="pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => {
                            setContactDraft({
                              email: guest.email || "",
                              phone: guest.phone || "",
                              nationality: guest.nationality || "",
                            });
                            setEditingContact(true);
                          }}
                          className="h-7 rounded-lg px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        >
                          <PenLine aria-hidden className="size-3" />
                          Edit contact
                        </Button>
                      </div>
                    </>
                  )}
                </AccordionSection>
                {/* ── Tags ── */}
                <AccordionSection
                  id="tags"
                  icon={<Tag aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
                  title="Tags"
                  bodyClassName="space-y-3"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {guest.tags.length === 0 ? (
                      <span className="text-[13px] text-muted-foreground">No tags assigned</span>
                    ) : (
                      guest.tags.map((tag) => (
                        <span
                          key={tag}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md py-0.5 pl-2 pr-1 text-[11px] font-medium capitalize",
                            tagClasses(tag)
                          )}
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            aria-label={`Remove tag ${tag}`}
                            disabled={savingTags}
                            className="grid size-4 place-items-center rounded transition-opacity hover:opacity-60 disabled:opacity-40"
                          >
                            <X aria-hidden className="size-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {SUGGESTED_TAGS.filter((t) => !guest.tags.includes(t)).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTED_TAGS.filter((t) => !guest.tags.includes(t)).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleAddTag(tag)}
                          disabled={savingTags}
                          className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border/70 px-1.5 py-0.5 text-[11px] capitalize text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-40"
                        >
                          <Plus aria-hidden className="size-3" />
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddTag(newTagInput);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <div className="relative flex-1">
                      <Tag aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                      <Input
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        placeholder="Add custom tag…"
                        aria-label="Add custom tag"
                        disabled={savingTags}
                        className="h-9 rounded-xl pl-8 text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => handleAddTag(newTagInput)}
                      isDisabled={!newTagInput.trim() || savingTags}
                      className="h-9 rounded-xl px-3.5 text-xs font-semibold"
                    >
                      Add
                    </Button>
                  </form>
                </AccordionSection>
                {/* ── Notes ── */}
                <AccordionSection
                  id="notes"
                  icon={<StickyNote aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
                  title="Notes"
                >
                  {editingNotes ? (
                    <NotesEditor
                      value={notesDraft}
                      onChange={setNotesDraft}
                      onCancel={() => {
                        setEditingNotes(false);
                        setNotesDraft(guest.notes || "");
                      }}
                      onSave={handleSaveNotes}
                      saving={savingNotes}
                      label="Guest notes"
                      placeholder="Internal notes about this guest (preferences, special needs, incidents)…"
                    />
                  ) : (
                    <div className="space-y-3">
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                        {guest.notes || (
                          <span className="text-muted-foreground">
                            No notes recorded for this guest.
                          </span>
                        )}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => {
                          setNotesDraft(guest.notes || "");
                          setEditingNotes(true);
                        }}
                        className="h-7 rounded-lg px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        <PenLine aria-hidden className="size-3" />
                        {guest.notes ? "Edit note" : "Add note"}
                      </Button>
                    </div>
                  )}
                </AccordionSection>
              </Accordion>
            </Tabs.Panel>

            {/* ── History ── */}
            <Tabs.Panel id="bookings" className="px-4 py-4 sm:px-5">
              <BookingHistory open={open} bookings={bookings} currency={currency} />
            </Tabs.Panel>
            </div>
          </Tabs>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
// ── Segmented-control style tab trigger ────────────────────────────

function SegmentedTab({
  id,
  children,
}: {
  id: "overview" | "bookings";
  children: React.ReactNode;
}) {
  return (
    <Tabs.Tab
      id={id}
      className="
        flex h-9 cursor-pointer items-center justify-center rounded-lg px-3 text-[13px]
        font-semibold text-muted-foreground outline-none transition-colors
        data-[hovered=true]:text-foreground
        data-[selected=true]:bg-background data-[selected=true]:text-foreground
        data-[selected=true]:shadow-sm data-[selected=true]:ring-1 data-[selected=true]:ring-border/70
        focus-visible:ring-2 focus-visible:ring-ring
      "
    >
      {children}
    </Tabs.Tab>
  );
}

// ── Contact edit field ─────────────────────────────────────────────

function ContactField({
  label,
  icon,
  value,
  onChange,
  placeholder,
  type,
  autoFocus,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  const id = React.useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] font-medium text-muted-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60">
          {icon}
        </span>
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="h-9 rounded-xl pl-8 text-sm"
        />
      </div>
    </div>
  );
}

// ── Save / Cancel row ──────────────────────────────────────────────

function EditActions({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5 pt-0.5">
      <Button size="sm" variant="tertiary" onPress={onCancel} className="h-8 rounded-lg text-xs">
        Cancel
      </Button>
      <Button
        size="sm"
        onPress={onSave}
        isPending={saving}
        className="h-8 rounded-lg bg-foreground text-xs font-semibold text-background hover:bg-foreground/90"
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

// ── Booking-status chip (monochrome label + status dot) ────────────

function StatusChip({ status }: { status: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", STATUS_COLORS[status] ?? "bg-muted-foreground")} />
      {getStatusLabel(status)}
    </span>
  );
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
  lineCount: number;
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
      lineCount: lines.length,
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
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40">
        <div className="divide-y divide-border/40">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-24 rounded" />
                <Skeleton className="h-3.5 w-16 rounded" />
              </div>
              <Skeleton className="mt-2 h-3 w-40 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!bookings || bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-12 text-center">
        <CalendarX2 aria-hidden className="mb-2 size-6 text-muted-foreground/30" />
        <p className="text-[13px] font-medium text-foreground">No booking history</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">This guest has no bookings yet.</p>
      </div>
    );
  }

  const reservations = foldReservations(bookings);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40">
      <div className="divide-y divide-border/40">
        {reservations.map((r) => (
          <div key={r.key} className="p-3 transition-colors hover:bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-[13px] font-medium text-foreground">
                  {r.reference}
                </span>
                {r.roomsTotal > 1 && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    <BedDouble aria-hidden className="size-3" />
                    {r.roomsTotal} rooms
                  </span>
                )}
              </span>
              <StatusChip status={r.status} />
            </div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {formatDate(r.checkIn)} – {formatDate(r.checkOut)}
              {r.nights ? ` · ${r.nights} night${r.nights > 1 ? "s" : ""}` : ""}
              {r.roomsTotal > 1
                ? ""
                : r.roomTypeName
                  ? ` · ${r.roomTypeName}`
                  : ""}
              {r.roomsTotal > 1 ? "" : r.roomNumber ? ` · Rm ${r.roomNumber}` : ""}
            </p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold tabular-nums text-foreground">
                {formatCurrency(r.totalAmount, currency)}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  PAYMENT_STATUS_TONE[r.paymentStatus] ?? "text-muted-foreground"
                )}
              >
                {getPaymentLabel(r.paymentStatus)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}






