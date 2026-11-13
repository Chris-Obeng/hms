"use client";

import * as React from "react";
import { CalendarX2, Mail, Pencil, Phone, Plus, X } from "lucide-react";
import {
  Avatar,
  Button,
  Chip,
  Disclosure,
  Drawer,
  Input,
  Label,
  Skeleton,
  Tabs,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, getInitials, getNights } from "@/lib/format";
import { getPaymentLabel, PAYMENT_STATUS_TONE } from "@/lib/booking-status";
import {
  updateGuestNotes,
  updateGuestTags,
  updateGuestContact,
  type GuestBookingSummary,
} from "@/app/actions/customers";
import { guestBookingsCache } from "@/lib/cache/guest-bookings-cache";
import { takeGuestBookings } from "@/lib/detail-prefetch";
import { getTagColor, tagLabel, type GuestRow } from "@/components/customers/customers-table";
import { BookingStatusPill } from "@/components/bookings/_components/booking-status-pill";
import { SegmentedTab } from "@/components/ui/segmented-tab";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const SUGGESTED_TAGS = ["vip", "regular", "flagged", "corporate", "new", "returning"];

/** Enter motion for panels and inline editors (see emil-design-eng). */
const ENTER = "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-[var(--ease-out-ui)] motion-reduce:animate-none";

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
  const [tab, setTab] = React.useState<"overview" | "history">("overview");

  const [editingNotes, setEditingNotes] = React.useState(false);
  const [notesDraft, setNotesDraft] = React.useState(guest.notes || "");
  const [savingNotes, setSavingNotes] = React.useState(false);
  const notesSeqRef = React.useRef(0);

  const [editingContact, setEditingContact] = React.useState(false);
  const [contactDraft, setContactDraft] = React.useState({
    email: guest.email || "",
    phone: guest.phone || "",
    nationality: guest.nationality || "",
  });
  const [savingContact, setSavingContact] = React.useState(false);
  const contactSeqRef = React.useRef(0);

  const [editingTags, setEditingTags] = React.useState(false);
  const [newTagInput, setNewTagInput] = React.useState("");
  const [savingTags, setSavingTags] = React.useState(false);
  const tagsSeqRef = React.useRef(0);
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
    const seq = ++notesSeqRef.current;
    const targetId = guest.id;
    const previousNotes = guest.notes;
    const nextNotes = notesDraft;
    setGuest((prev) => (prev.id === targetId ? { ...prev, notes: nextNotes } : prev));
    onGuestUpdated?.(targetId, { notes: nextNotes });
    setEditingNotes(false);
    setSavingNotes(true);
    try {
      const result = await updateGuestNotes(targetId, { notes: nextNotes });
      if (result.success) {
        toast.success("Notes updated");
      } else {
        if (seq === notesSeqRef.current) {
          setGuest((prev) => (prev.id === targetId ? { ...prev, notes: previousNotes } : prev));
          onGuestUpdated?.(targetId, { notes: previousNotes });
        }
        toast.danger(result.error || "Failed to update notes");
      }
    } catch {
      if (seq === notesSeqRef.current) {
        setGuest((prev) => (prev.id === targetId ? { ...prev, notes: previousNotes } : prev));
        onGuestUpdated?.(targetId, { notes: previousNotes });
      }
      toast.danger("Failed to update notes — check your connection and retry");
    } finally {
      if (seq === notesSeqRef.current) setSavingNotes(false);
    }
  }

  async function handleSaveContact() {
    const seq = ++contactSeqRef.current;
    const targetId = guest.id;
    const previousPatch: Partial<GuestRow> = {
      email: guest.email,
      phone: guest.phone,
      nationality: guest.nationality,
    };
    const patch: Partial<GuestRow> = {
      email: contactDraft.email || null,
      phone: contactDraft.phone || null,
      nationality: contactDraft.nationality || null,
    };
    setGuest((prev) => (prev.id === targetId ? { ...prev, ...patch } : prev));
    onGuestUpdated?.(targetId, patch);
    setEditingContact(false);
    setSavingContact(true);
    try {
      const result = await updateGuestContact(targetId, contactDraft);
      if (result.success) {
        toast.success("Contact updated");
      } else {
        if (seq === contactSeqRef.current) {
          setGuest((prev) => (prev.id === targetId ? { ...prev, ...previousPatch } : prev));
          onGuestUpdated?.(targetId, previousPatch);
        }
        toast.danger(result.error || "Failed to update contact");
      }
    } catch {
      if (seq === contactSeqRef.current) {
        setGuest((prev) => (prev.id === targetId ? { ...prev, ...previousPatch } : prev));
        onGuestUpdated?.(targetId, previousPatch);
      }
      toast.danger("Failed to update contact — check your connection and retry");
    } finally {
      if (seq === contactSeqRef.current) setSavingContact(false);
    }
  }

  async function handleAddTag(tag: string) {
    if (savingTags) return;
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || guest.tags.includes(trimmed)) return;

    const seq = ++tagsSeqRef.current;
    const targetId = guest.id;
    const previousTags = guest.tags;
    const newTags = [...guest.tags, trimmed];
    setGuest((prev) => (prev.id === targetId ? { ...prev, tags: newTags } : prev));
    onGuestUpdated?.(targetId, { tags: newTags });
    setNewTagInput("");
    setSavingTags(true);
    try {
      const result = await updateGuestTags(targetId, { tags: newTags });
      if (!result.success) {
        if (seq === tagsSeqRef.current) {
          setGuest((prev) => (prev.id === targetId ? { ...prev, tags: previousTags } : prev));
          onGuestUpdated?.(targetId, { tags: previousTags });
        }
        toast.danger(result.error || "Failed to add tag");
      }
    } catch {
      if (seq === tagsSeqRef.current) {
        setGuest((prev) => (prev.id === targetId ? { ...prev, tags: previousTags } : prev));
        onGuestUpdated?.(targetId, { tags: previousTags });
      }
      toast.danger("Failed to add tag — check your connection and retry");
    } finally {
      if (seq === tagsSeqRef.current) setSavingTags(false);
    }
  }

  async function handleRemoveTag(tag: string) {
    if (savingTags) return;
    const seq = ++tagsSeqRef.current;
    const targetId = guest.id;
    const previousTags = guest.tags;
    const newTags = guest.tags.filter((t) => t !== tag);
    setGuest((prev) => (prev.id === targetId ? { ...prev, tags: newTags } : prev));
    onGuestUpdated?.(targetId, { tags: newTags });
    setSavingTags(true);
    try {
      const result = await updateGuestTags(targetId, { tags: newTags });
      if (!result.success) {
        if (seq === tagsSeqRef.current) {
          setGuest((prev) => (prev.id === targetId ? { ...prev, tags: previousTags } : prev));
          onGuestUpdated?.(targetId, { tags: previousTags });
        }
        toast.danger(result.error || "Failed to remove tag");
      }
    } catch {
      if (seq === tagsSeqRef.current) {
        setGuest((prev) => (prev.id === targetId ? { ...prev, tags: previousTags } : prev));
        onGuestUpdated?.(targetId, { tags: previousTags });
      }
      toast.danger("Failed to remove tag — check your connection and retry");
    } finally {
      if (seq === tagsSeqRef.current) setSavingTags(false);
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


  const suggestions = SUGGESTED_TAGS.filter((t) => !guest.tags.includes(t));
  const resetContactDraft = () =>
    setContactDraft({ email: guest.email || "", phone: guest.phone || "", nationality: guest.nationality || "" });

  return (
    <Drawer.Backdrop
      isOpen={open}
      onOpenChange={(isOpen) => handleClose(isOpen)}
      variant="opaque"
      className="bg-black/30"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          className={`
            flex w-full flex-col overflow-hidden rounded-t-3xl bg-card p-0 shadow-[0_-24px_80px_rgb(0_0_0/0.25)]
            h-[min(94dvh,56rem)] max-h-[94dvh]
            md:h-dvh md:max-h-dvh md:w-[min(28rem,100vw)]
            md:rounded-none md:border-l md:border-border/60 md:shadow-[-24px_0_80px_rgb(15_23_42/0.12)]
          `}
        >
          {isMobile && <Drawer.Handle className="mt-3 shrink-0" />}

          <Drawer.Header className="shrink-0 flex-row items-start gap-3 px-6 pb-4 pt-4 md:pt-6">
            <Avatar size="lg" className="shrink-0" aria-hidden="true">
              <Avatar.Fallback className="font-semibold">{getInitials(guest.fullName)}</Avatar.Fallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <Drawer.Heading className="truncate text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground">
                {guest.fullName}
              </Drawer.Heading>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Guest since {formatDate(guest.createdAt, "MMM yyyy")}
                {guest.nationality ? ` · ${guest.nationality}` : ""}
              </p>
            </div>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Close guest profile"
              onPress={() => handleClose(false)}
              className="hidden shrink-0 rounded-lg text-muted-foreground md:inline-flex"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </Drawer.Header>

          <Tabs
            key={resetKey}
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key as typeof tab)}
            className="flex min-h-0 w-full flex-1 flex-col gap-0 overflow-hidden"
          >
            <div className="shrink-0 border-b border-border/60 px-6 pb-4">
              <Tabs.ListContainer>
                <Tabs.List aria-label="Guest sections" className="grid w-full grid-cols-2">
                  <SegmentedTab id="overview">Overview</SegmentedTab>
                  <SegmentedTab id="history">
                    History{bookings && bookings.length > 0 ? ` · ${bookings.length}` : ""}
                  </SegmentedTab>
                </Tabs.List>
              </Tabs.ListContainer>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {/* ── Overview ── */}
              <Tabs.Panel id="overview" className={cn("mt-0 flex min-h-full flex-col gap-6 p-6", ENTER)}>
                <section aria-label="Guest stats" className="grid grid-cols-3 gap-3 rounded-2xl bg-secondary/60 p-4">
                  <Stat label="Stays" value={stayCount.toLocaleString("en")} />
                  <Stat label="Nights" value={roomNights === null ? "—" : roomNights.toLocaleString("en")} />
                  <Stat label="Spent" value={formatCurrency(totalSpend, currency)} align="end" />
                </section>

                {/* Contact */}
                <section aria-label="Contact" className="space-y-2">
                  <SectionHead
                    title="Contact"
                    action={
                      !editingContact && (
                        <EditButton
                          label="Edit"
                          onPress={() => {
                            resetContactDraft();
                            setEditingContact(true);
                          }}
                        />
                      )
                    }
                  />
                  {editingContact ? (
                    <form
                      className={cn("flex flex-col gap-3", ENTER)}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSaveContact();
                      }}
                    >
                      <DrawerField label="Email" type="email" autoFocus value={contactDraft.email}
                        onChange={(v) => setContactDraft((p) => ({ ...p, email: v }))} />
                      <DrawerField label="Phone" type="tel" value={contactDraft.phone}
                        onChange={(v) => setContactDraft((p) => ({ ...p, phone: v }))} />
                      <DrawerField label="Nationality" value={contactDraft.nationality}
                        onChange={(v) => setContactDraft((p) => ({ ...p, nationality: v }))} />
                      <EditorActions
                        saving={savingContact}
                        onCancel={() => {
                          setEditingContact(false);
                          resetContactDraft();
                        }}
                      />
                    </form>
                  ) : (
                    <div className="space-y-1">
                      <ContactLink href={guest.phone ? `tel:${guest.phone}` : undefined} icon={<Phone className="size-4" />}>
                        {guest.phone || "No phone"}
                      </ContactLink>
                      <ContactLink href={guest.email ? `mailto:${guest.email}` : undefined} icon={<Mail className="size-4" />}>
                        {guest.email || "No email"}
                      </ContactLink>
                    </div>
                  )}
                </section>

                {/* Tags */}
                <section aria-label="Tags" className="space-y-2">
                  <SectionHead
                    title="Tags"
                    action={
                      <EditButton
                        label={editingTags ? "Done" : guest.tags.length ? "Edit" : "Add"}
                        icon={!editingTags}
                        onPress={() => setEditingTags((p) => !p)}
                      />
                    }
                  />
                  {editingTags ? (
                    <div className={cn("space-y-3", ENTER)}>
                      {guest.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Current tags">
                          {guest.tags.map((tag) => (
                            <Button
                              key={tag}
                              size="sm"
                              variant="secondary"
                              aria-label={`Remove tag ${tagLabel(tag)}`}
                              isDisabled={savingTags}
                              onPress={() => void handleRemoveTag(tag)}
                              className="gap-2 rounded-lg font-medium max-md:h-11"
                            >
                              {tagLabel(tag)}
                              <X className="size-3 text-muted-foreground" aria-hidden="true" />
                            </Button>
                          ))}
                        </div>
                      )}
                      {suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested tags">
                          {suggestions.map((tag) => (
                            <Button
                              key={tag}
                              size="sm"
                              variant="tertiary"
                              isDisabled={savingTags}
                              onPress={() => void handleAddTag(tag)}
                              className="gap-1 rounded-lg font-medium text-muted-foreground max-md:h-11"
                            >
                              <Plus className="size-3" aria-hidden="true" />
                              {tagLabel(tag)}
                            </Button>
                          ))}
                        </div>
                      )}
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleAddTag(newTagInput);
                        }}
                      >
                        <TextField aria-label="New tag" value={newTagInput} onChange={setNewTagInput} isDisabled={savingTags} className="min-w-0 flex-1">
                          <Input placeholder="New tag" className="rounded-xl max-md:h-11 max-md:text-base" />
                        </TextField>
                        <Button type="submit" variant="secondary" isDisabled={!newTagInput.trim() || savingTags} className="rounded-xl max-md:h-11">
                          Add
                        </Button>
                      </form>
                    </div>
                  ) : guest.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {guest.tags.map((tag) => (
                        <Chip key={tag} size="sm" variant="soft" color={getTagColor(tag)}>
                          {tagLabel(tag)}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No tags</p>
                  )}
                </section>

                {/* Notes */}
                <section aria-label="Notes" className="space-y-2">
                  <SectionHead
                    title="Notes"
                    action={
                      !editingNotes && (
                        <EditButton
                          label={guest.notes ? "Edit" : "Add note"}
                          onPress={() => {
                            setNotesDraft(guest.notes || "");
                            setEditingNotes(true);
                          }}
                        />
                      )
                    }
                  />
                  {editingNotes ? (
                    <form
                      className={cn("space-y-3", ENTER)}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSaveNotes();
                      }}
                    >
                      <TextArea
                        aria-label="Guest notes"
                        rows={5}
                        value={notesDraft}
                        maxLength={2000}
                        autoFocus
                        onChange={(event) => setNotesDraft(event.target.value)}
                        placeholder="Preferences, requests, internal notes"
                        className="w-full resize-none rounded-xl text-base sm:text-sm"
                      />
                      <EditorActions
                        saving={savingNotes}
                        onCancel={() => {
                          setEditingNotes(false);
                          setNotesDraft(guest.notes || "");
                        }}
                      />
                    </form>
                  ) : guest.notes ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{guest.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes</p>
                  )}
                </section>

                {/* Secondary facts */}
                <Disclosure className="mt-auto border-t border-border/60 pt-2">
                  <Disclosure.Heading>
                    <Button
                      slot="trigger"
                      variant="ghost"
                      fullWidth
                      className="justify-between rounded-lg px-0 text-sm font-medium text-muted-foreground max-md:h-11 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-transparent [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                    >
                      More details
                      <Disclosure.Indicator />
                    </Button>
                  </Disclosure.Heading>
                  <Disclosure.Content>
                    <Disclosure.Body className="px-0">
                      <dl className="divide-y divide-border/50">
                        <Fact label="Nationality">{guest.nationality || "—"}</Fact>
                        <Fact label="ID number" mono>{guest.nationalId || "—"}</Fact>
                        <Fact label="Guest since">{formatDate(guest.createdAt, "MMM d, yyyy")}</Fact>
                        {guest.lastStayDate && <Fact label="Last stay">{formatDate(guest.lastStayDate, "MMM d, yyyy")}</Fact>}
                      </dl>
                    </Disclosure.Body>
                  </Disclosure.Content>
                </Disclosure>
              </Tabs.Panel>

              {/* ── History ── */}
              <Tabs.Panel id="history" className={cn("mt-0 px-6 py-2", ENTER)}>
                <BookingHistory
                  open={open}
                  bookings={bookings}
                  currency={currency}
                  error={bookingsQuery.isError && !bookings}
                  onRetry={() => void bookingsQuery.refetch()}
                />
              </Tabs.Panel>
            </div>
          </Tabs>

          {/* Footer: the one primary action */}
          <div className="shrink-0 border-t border-border/60 bg-card px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <Button
              size="lg"
              fullWidth
              variant="primary"
              className="rounded-xl font-semibold"
              onPress={() => {
                handleClose(false);
                window.dispatchEvent(
                  new CustomEvent("roomline:new-booking", {
                    detail: {
                      guest: {
                        id: guest.id,
                        fullName: guest.fullName,
                        email: guest.email,
                        phone: guest.phone,
                        nationality: guest.nationality,
                      },
                    },
                  })
                );
              }}
            >
              New booking
            </Button>
          </div>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function Stat({ label, value, align = "start" }: { label: string; value: string; align?: "start" | "end" }) {
  return (
    <div className={cn("min-w-0", align === "end" && "text-right")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-md font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function SectionHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {action}
    </div>
  );
}

function EditButton({ label, onPress, icon = true }: { label: string; onPress: () => void; icon?: boolean }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onPress={onPress}
      className="h-11 gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground md:h-8"
    >
      {icon && <Pencil className="size-3" aria-hidden="true" />}
      {label}
    </Button>
  );
}

function EditorActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="tertiary" onPress={onCancel} className="rounded-lg max-md:h-11">
        Cancel
      </Button>
      <Button size="sm" type="submit" variant="primary" isPending={saving} className="rounded-lg font-semibold max-md:h-11">
        Save
      </Button>
    </div>
  );
}

function DrawerField({ label, value, onChange, type, autoFocus }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <TextField value={value} onChange={onChange} type={type} autoFocus={autoFocus} className="w-full">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input className="rounded-xl max-md:h-11 max-md:text-base" />
    </TextField>
  );
}

function ContactLink({ href, icon, children }: { href?: string; icon: React.ReactNode; children: React.ReactNode }) {
  const inner = (
    <>
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </>
  );
  if (!href) {
    return <p className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground md:min-h-10">{inner}</p>;
  }
  return (
    <a
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-lg text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 [@media(hover:hover)_and_(pointer:fine)]:hover:text-primary"
    >
      {inner}
    </a>
  );
}

function Fact({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right text-xs font-medium text-foreground", mono && "font-mono")}>{children}</dd>
    </div>
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
  error,
  onRetry,
}: {
  open: boolean;
  bookings: GuestBookingSummary[] | null;
  currency: string;
  error: boolean;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm font-semibold text-foreground">Couldn&apos;t load history</p>
        <Button size="sm" variant="secondary" onPress={onRetry} className="rounded-xl max-md:h-11">
          Try again
        </Button>
      </div>
    );
  }

  if (open && bookings === null) {
    return (
      <div className="divide-y divide-border/50">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 py-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-40 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (!bookings || bookings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <CalendarX2 aria-hidden className="size-5" />
        </span>
        <p className="text-sm font-semibold text-foreground">No bookings yet</p>
      </div>
    );
  }

  const reservations = foldReservations(bookings);

  return (
    <ul className="divide-y divide-border/50">
      {reservations.map((r) => {
        const room = r.roomsTotal > 1 ? `${r.roomsTotal} rooms` : [r.roomTypeName, r.roomNumber ? `Room ${r.roomNumber}` : null].filter(Boolean).join(" · ");
        return (
          <li key={r.key} className="space-y-1 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-sm font-medium text-foreground">{r.reference}</span>
              <BookingStatusPill status={r.status} className="shrink-0" />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {formatDate(r.checkIn, "MMM d")} – {formatDate(r.checkOut, "MMM d, yyyy")}
              {r.nights ? ` · ${r.nights} ${r.nights === 1 ? "night" : "nights"}` : ""}
              {room ? ` · ${room}` : ""}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(r.totalAmount, currency)}</span>
              <span className={cn("text-xs font-medium", PAYMENT_STATUS_TONE[r.paymentStatus] ?? "text-muted-foreground")}>
                {getPaymentLabel(r.paymentStatus)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
