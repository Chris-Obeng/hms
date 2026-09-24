"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Button, Card, Input, Switch, toast } from "@heroui/react";

import { cn, slugify } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { AMENITIES_LIST } from "@/lib/amenities";
import { RoomImagesUpload, type RoomImage } from "@/components/ui/room-images-upload";
import { saveRoomImages } from "@/app/actions/upload";

// ── Types ──────────────────────────────────────────────────────

export interface RoomTypeFormValues {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  bedConfiguration: string;
  maxAdults: number;
  maxChildren: number;
  basePrice: string;
  weekendPrice: string;
  selectedAmenities: string[];
  isActive: boolean;
}

export interface RoomTypeFormProps {
  /** Pre-populated values for edit mode */
  initialValues?: Partial<RoomTypeFormValues>;
  /** Hotel ID — required for image upload storage path */
  hotelId?: string;
  /** Room type ID — required for image upload (edit mode only) */
  roomTypeId?: string;
  /** Initial images from DB */
  initialImages?: RoomImage[];
  /** Show photos card first (edit mode) */
  photosFirst?: boolean;
  /** Called with form values on submit */
  onSubmit: (values: RoomTypeFormValues) => Promise<{ success: boolean; error?: string }>;
  submitLabel: string;
  submittingLabel: string;
  title: string;
  subtitle?: string;
  errors: Record<string, string>;
  isModal?: boolean;
  onCancel?: () => void;
  /** ISO currency code shown as the price prefix (defaults to GHS) */
  currency?: string;
}

// ── Default Values ─────────────────────────────────────────────

const DEFAULT_VALUES: RoomTypeFormValues = {
  name: "",
  slug: "",
  shortDescription: "",
  description: "",
  bedConfiguration: "",
  maxAdults: 2,
  maxChildren: 0,
  basePrice: "",
  weekendPrice: "",
  selectedAmenities: [],
  isActive: true,
};

// ── Section wrapper ────────────────────────────────────────────
// Cards on the standalone page; flat, airy sections inside modals.

function FormSection({
  title,
  framed,
  children,
  className,
}: {
  title: string;
  framed: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!framed) {
    return (
      <section className={cn("space-y-4", className)}>
        <h3 className="text-label font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {children}
      </section>
    );
  }
  return (
    <Card className={className}>
      <Card.Header>
        <Card.Title className="text-sm font-medium">{title}</Card.Title>
      </Card.Header>
      <Card.Content className="space-y-4">{children}</Card.Content>
    </Card>
  );
}

// ── Component ──────────────────────────────────────────────────

export function RoomTypeForm({
  initialValues = {},
  hotelId,
  roomTypeId,
  initialImages = [],
  photosFirst = false,
  onSubmit,
  submitLabel,
  submittingLabel,
  title,
  subtitle,
  errors,
  isModal = false,
  onCancel,
  currency = "GHS",
}: RoomTypeFormProps) {
  const framed = !isModal;
  const [submitting, setSubmitting] = React.useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false);
  const [images, setImages] = React.useState<RoomImage[]>(initialImages);
  const [savingImages, setSavingImages] = React.useState(false);
  const [customAmenities, setCustomAmenities] = React.useState<string[]>([]);
  const [customAmenityInput, setCustomAmenityInput] = React.useState("");

  // Merge defaults with initial values
  const [values, setValues] = React.useState<RoomTypeFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });

  // Slug derives from the name during render until manually edited — no
  // setState-in-effect cascade, same behaviour as the previous effect.
  const effectiveSlug =
    slugManuallyEdited || !values.name ? values.slug : slugify(values.name);

  function set<K extends keyof RoomTypeFormValues>(key: K, value: RoomTypeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ ...values, slug: effectiveSlug });
      // Parent page handles its own success/error toasts with context-specific messages
    } catch {
      toast.danger("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Amenities ────────────────────────────────────────────────

  const allAmenityOptions = React.useMemo(() => {
    const known = AMENITIES_LIST.map((a) => a.label);
    const extra = customAmenities.filter(
      (label) => !known.some((k) => k.toLowerCase() === label.toLowerCase())
    );
    return [...known, ...extra];
  }, [customAmenities]);

  function toggleAmenity(label: string) {
    setValues((prev) => ({
      ...prev,
      selectedAmenities: prev.selectedAmenities.includes(label)
        ? prev.selectedAmenities.filter((a) => a !== label)
        : [...prev.selectedAmenities, label],
    }));
  }

  function addCustomAmenity() {
    const label = customAmenityInput.trim().replace(/\s+/g, " ");
    if (!label) return;
    if (label.length > 60) {
      toast.danger("Amenity name is too long (max 60 characters)");
      return;
    }
    const exists = allAmenityOptions.some(
      (option) => option.toLowerCase() === label.toLowerCase()
    );
    if (exists) {
      toast.danger("That amenity already exists");
      return;
    }
    setCustomAmenities((prev) => [...prev, label]);
    setValues((prev) => ({
      ...prev,
      selectedAmenities: [...prev.selectedAmenities, label],
    }));
    setCustomAmenityInput("");
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className={cn("space-y-6", framed ? "mx-auto max-w-2xl" : "")}>
      {/* Header */}
      {!isModal && (
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/rooms"
            className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photos first — shown at top in edit mode */}
        {hotelId && roomTypeId && photosFirst && (
          <PhotosCard
            roomTypeId={roomTypeId}
            hotelId={hotelId}
            images={images}
            setImages={setImages}
            savingImages={savingImages}
            setSavingImages={setSavingImages}
          />
        )}

        {/* Basic Info */}
        <FormSection title="Basic information" framed={framed}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rt-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Name *
              </label>
              <Input
                id="rt-name"
                placeholder="e.g. Deluxe King Room"
                value={values.name}
                onChange={(e) => {
                  set("name", e.target.value);
                  setSlugManuallyEdited(false);
                }}
                className={cn("h-9 w-full rounded-xl", errors.name && "border-destructive")}
              />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="rt-slug" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Slug
              </label>
              <Input
                id="rt-slug"
                placeholder="auto-generated"
                value={effectiveSlug}
                onChange={(e) => {
                  set("slug", e.target.value);
                  setSlugManuallyEdited(true);
                }}
                className="h-9 w-full rounded-xl font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rt-short-description" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Short description
            </label>
            <Input
              id="rt-short-description"
              placeholder="A brief description for listings..."
              value={values.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
              className="h-9 w-full rounded-xl"
            />
          </div>

          <div>
            <label htmlFor="rt-description" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Full description
            </label>
            <textarea
              id="rt-description"
              placeholder="Detailed description of this room type..."
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </FormSection>

        {/* Configuration */}
        <FormSection title="Configuration" framed={framed}>
          <div>
            <label htmlFor="rt-bed-config" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Bed configuration
            </label>
            <Input
              id="rt-bed-config"
              placeholder="e.g. 1 King Bed, 1 Sofa Bed"
              value={values.bedConfiguration}
              onChange={(e) => set("bedConfiguration", e.target.value)}
              className="h-9 w-full rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Max adults
              </label>
              <HeroSelectField value={String(values.maxAdults)} onValueChange={(v) => set("maxAdults", Number(v))} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: n }))} ariaLabel="Max adults" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Max children
              </label>
              <HeroSelectField value={String(values.maxChildren)} onValueChange={(v) => set("maxChildren", Number(v))} options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: n }))} ariaLabel="Max children" />
            </div>
          </div>
        </FormSection>

        {/* Pricing */}
        <FormSection title="Pricing" framed={framed}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rt-base-price" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Base price / night *
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">
                  {currency}
                </span>
                <Input
                  id="rt-base-price"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={values.basePrice}
                  onChange={(e) => set("basePrice", e.target.value)}
                  className={cn("h-9 w-full rounded-xl pl-12", errors.basePrice && "border-destructive")}
                />
              </div>
              {errors.basePrice && (
                <p className="mt-1 text-xs text-destructive">{errors.basePrice}</p>
              )}
            </div>
            <div>
              <label htmlFor="rt-weekend-price" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Weekend price (optional)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">
                  {currency}
                </span>
                <Input
                  id="rt-weekend-price"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={values.weekendPrice}
                  onChange={(e) => set("weekendPrice", e.target.value)}
                  className="h-9 w-full rounded-xl pl-12"
                />
              </div>
            </div>
          </div>
        </FormSection>

        {/* Amenities */}
        <FormSection title="Amenities" framed={framed}>
          <div className="flex flex-wrap gap-2">
            {allAmenityOptions.map((amenityLabel) => {
              const isSelected = values.selectedAmenities.includes(amenityLabel);
              const isCustom = !AMENITIES_LIST.some(
                (a) => a.label.toLowerCase() === amenityLabel.toLowerCase()
              );
              return (
                <button
                  key={amenityLabel}
                  type="button"
                  onClick={() => toggleAmenity(amenityLabel)}
                  aria-pressed={isSelected}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                    isSelected
                      ? "border-foreground/30 bg-foreground/5 text-foreground"
                      : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {isSelected ? <X className="size-3" /> : <Plus className="size-3" />}
                  {amenityLabel}
                  {isCustom && (
                    <span className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      custom
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Staff can add amenities beyond the preset list */}
          <div className="flex gap-2">
            <Input
              aria-label="Add a custom amenity"
              placeholder="Add your own (e.g. Ocean View, Airport Pickup)..."
              value={customAmenityInput}
              onChange={(e) => setCustomAmenityInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomAmenity();
                }
              }}
              maxLength={60}
              className="h-9 flex-1 rounded-xl"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 shrink-0 rounded-xl text-sm"
              onPress={addCustomAmenity}
              isDisabled={!customAmenityInput.trim()}
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>
          <p className="text-caption text-muted-foreground/60">
            Tap an amenity to include it. Type above to add amenities unique to your hotel.
          </p>
        </FormSection>

        {/* Images — only shown in edit mode (roomTypeId exists) */}
        {hotelId && roomTypeId && !photosFirst && (
          <PhotosCard
            roomTypeId={roomTypeId}
            hotelId={hotelId}
            images={images}
            setImages={setImages}
            savingImages={savingImages}
            setSavingImages={setSavingImages}
          />
        )}

        {/* Settings */}
        <FormSection title="Settings" framed={framed}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive room types are hidden from the guest booking page.
              </p>
            </div>
            <Switch
              isSelected={values.isActive}
              onChange={(selected) => set("isActive", selected)}
              aria-label="Room type active"
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>
        </FormSection>

        {/* Actions */}
        <div className={cn("flex items-center justify-between gap-3", framed ? "pb-8" : "pb-2")}>
          {isModal ? (
            <Button variant="ghost" type="button" onPress={onCancel} className="rounded-xl text-sm">
              Cancel
            </Button>
          ) : (
            <Link href="/dashboard/rooms">
              <Button variant="ghost" type="button" className="rounded-xl text-sm">
                Cancel
              </Button>
            </Link>
          )}
          <Button
            type="submit"
            isDisabled={submitting || !values.name || !values.basePrice}
            isPending={submitting}
            className="min-w-[140px] rounded-xl text-sm"
          >
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Photos Card ────────────────────────────────────────────────

function PhotosCard({
  roomTypeId, hotelId, images, setImages, savingImages, setSavingImages,
}: {
  roomTypeId: string;
  hotelId: string;
  images: RoomImage[];
  setImages: React.Dispatch<React.SetStateAction<RoomImage[]>>;
  savingImages: boolean;
  setSavingImages: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <Card className="border-2 border-dashed border-border/60 transition-colors hover:border-border">
      <Card.Header>
        <Card.Title className="flex items-center justify-between text-sm font-medium">
          <div className="flex items-center gap-2">
            <span>Photos</span>
            {images.length === 0 && (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-caption font-medium text-amber-700 dark:text-amber-300">
                No photos yet
              </span>
            )}
          </div>
          {images.length > 0 && (
            <button
              type="button"
              disabled={savingImages}
              onClick={async () => {
                setSavingImages(true);
                const r = await saveRoomImages(roomTypeId, images);
                setSavingImages(false);
                if (r.success) toast.success("Photos saved");
                else toast.danger(r.error ?? "Failed to save photos");
              }}
              className="-my-1 min-h-8 rounded-lg px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              {savingImages ? "Saving…" : "Save Photos"}
            </button>
          )}
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <RoomImagesUpload
          hotelId={hotelId}
          roomTypeId={roomTypeId}
          images={images}
          onChange={setImages}
        />
        <p className="text-caption text-muted-foreground/50 mt-2">
          First photo is the listing thumbnail. Drag to reorder. Max 10.
        </p>
      </Card.Content>
    </Card>
  );
}
