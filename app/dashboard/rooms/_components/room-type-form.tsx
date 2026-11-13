"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, Plus } from "lucide-react";
import {
  Button,
  FieldError,
  Input,
  InputGroup,
  Label,
  Switch,
  TextArea,
  TextField,
  ToggleButton,
  toast,
} from "@heroui/react";

import { cn, slugify } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { AMENITIES_LIST } from "@/lib/amenities";
import { RoomImagesUpload, type RoomImage } from "@/components/ui/room-images-upload";
import { saveRoomImages } from "@/app/actions/upload";
import { SaveBar, SettingsGroup, SettingsRow } from "@/app/dashboard/settings/_components/settings-ui";

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
  /** Show photos first (edit mode) */
  photosFirst?: boolean;
  /** Called with form values on submit */
  onSubmit: (values: RoomTypeFormValues) => Promise<{ success: boolean; error?: string }>;
  submitLabel: string;
  submittingLabel: string;
  title: string;
  /** Kept for callers; the redesigned header shows no subtitle. */
  subtitle?: string;
  errors: Record<string, string>;
  isModal?: boolean;
  onCancel?: () => void;
  /** ISO currency code shown as the price prefix (defaults to GHS) */
  currency?: string;
  /** Optional notice rendered under the page title (e.g. "add photos"). */
  notice?: React.ReactNode;
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

const FIELD_LABEL = "text-xs font-medium text-muted-foreground";
const FIELD_INPUT = "rounded-xl max-md:h-11 max-md:text-base";

/** Cards with a title column on pages; flat stacked sections inside the modal. */
function FormSection({ title, framed, children }: { title: string; framed: boolean; children: React.ReactNode }) {
  if (framed) return <SettingsGroup title={title}>{children}</SettingsGroup>;
  return (
    <section aria-label={title} className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
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
  errors,
  isModal = false,
  onCancel,
  currency = "GHS",
  notice,
}: RoomTypeFormProps) {
  const framed = !isModal;
  const isEdit = Boolean(roomTypeId);
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
  // Last saved values — the edit page shows its save bar only when they differ.
  // The slug is compared as derived (name → slug), the same value a save sends.
  const [baseline, setBaseline] = React.useState(() => ({
    ...values,
    slug: values.name ? slugify(values.name) : values.slug,
  }));

  // Slug derives from the name during render until manually edited — no
  // setState-in-effect cascade, same behaviour as the previous effect.
  const effectiveSlug = slugManuallyEdited || !values.name ? values.slug : slugify(values.name);

  const dirty = JSON.stringify({ ...values, slug: effectiveSlug }) !== JSON.stringify(baseline);
  const canSubmit = Boolean(values.name && values.basePrice);

  function set<K extends keyof RoomTypeFormValues>(key: K, value: RoomTypeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setSubmitting(true);
    const next = { ...values, slug: effectiveSlug };
    try {
      const result = await onSubmit(next);
      // Parent page handles its own success/error toasts with context-specific messages
      if (result.success) setBaseline(next);
    } catch {
      toast.danger("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function discard() {
    setValues(baseline);
    setSlugManuallyEdited(false);
  }

  // ── Amenities ────────────────────────────────────────────────

  const allAmenityOptions = React.useMemo(() => {
    const known = AMENITIES_LIST.map((a) => a.label);
    const extra = [...customAmenities, ...values.selectedAmenities].filter(
      (label, i, arr) =>
        !known.some((k) => k.toLowerCase() === label.toLowerCase()) &&
        arr.findIndex((x) => x.toLowerCase() === label.toLowerCase()) === i
    );
    return [...known, ...extra];
  }, [customAmenities, values.selectedAmenities]);

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
    const exists = allAmenityOptions.some((option) => option.toLowerCase() === label.toLowerCase());
    if (exists) {
      toast.danger("That amenity already exists");
      return;
    }
    setCustomAmenities((prev) => [...prev, label]);
    setValues((prev) => ({ ...prev, selectedAmenities: [...prev.selectedAmenities, label] }));
    setCustomAmenityInput("");
  }

  const photos = hotelId && roomTypeId && (
    <FormSection title="Photos" framed={framed}>
      <RoomImagesUpload hotelId={hotelId} roomTypeId={roomTypeId} images={images} onChange={setImages} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">First photo is the cover · up to 10</p>
        {images.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            isPending={savingImages}
            onPress={async () => {
              setSavingImages(true);
              const r = await saveRoomImages(roomTypeId, images);
              setSavingImages(false);
              if (r.success) toast.success("Photos saved");
              else toast.danger(r.error ?? "Failed to save photos");
            }}
            className="rounded-lg max-md:h-11"
          >
            Save photos
          </Button>
        )}
      </div>
    </FormSection>
  );

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className={cn(framed && "mx-auto w-full max-w-5xl pt-6 md:pt-8")}>
      {framed && (
        <header className="mb-6 space-y-4">
          <Link
            href="/dashboard/rooms"
            className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Rooms
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
          {notice}
        </header>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
        className={framed ? "space-y-6" : "space-y-8"}
      >
        {photosFirst && photos}

        <FormSection title="Details" framed={framed}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              value={values.name}
              onChange={(v) => {
                set("name", v);
                setSlugManuallyEdited(false);
              }}
              isRequired
              isInvalid={!!errors.name}
              className="w-full"
            >
              <Label className={FIELD_LABEL}>Name</Label>
              <Input placeholder="Deluxe King" className={FIELD_INPUT} />
              <FieldError>{errors.name}</FieldError>
            </TextField>
            <TextField
              value={effectiveSlug}
              onChange={(v) => {
                set("slug", v);
                setSlugManuallyEdited(true);
              }}
              className="w-full"
            >
              <Label className={FIELD_LABEL}>Web address</Label>
              <Input placeholder="deluxe-king" className={cn(FIELD_INPUT, "font-mono text-sm")} />
            </TextField>
          </div>
          <TextField value={values.shortDescription} onChange={(v) => set("shortDescription", v)} className="w-full">
            <Label className={FIELD_LABEL}>Short description</Label>
            <Input placeholder="Shown on the booking page list" className={FIELD_INPUT} />
          </TextField>
          <TextField value={values.description} onChange={(v) => set("description", v)} className="w-full">
            <Label className={FIELD_LABEL}>Full description</Label>
            <TextArea rows={4} className="resize-none rounded-xl text-base sm:text-sm" />
          </TextField>
        </FormSection>

        <FormSection title="Capacity" framed={framed}>
          <TextField value={values.bedConfiguration} onChange={(v) => set("bedConfiguration", v)} className="w-full">
            <Label className={FIELD_LABEL}>Beds</Label>
            <Input placeholder="1 King bed, 1 Sofa bed" className={FIELD_INPUT} />
          </TextField>
          <div className="grid grid-cols-2 gap-4">
            <HeroSelectField
              label="Max adults"
              value={String(values.maxAdults)}
              onValueChange={(v) => set("maxAdults", Number(v))}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
              ariaLabel="Max adults"
              triggerClassName="max-md:min-h-11"
            />
            <HeroSelectField
              label="Max children"
              value={String(values.maxChildren)}
              onValueChange={(v) => set("maxChildren", Number(v))}
              options={[0, 1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
              ariaLabel="Max children"
              triggerClassName="max-md:min-h-11"
            />
          </div>
        </FormSection>

        <FormSection title="Pricing" framed={framed}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PriceField
              label="Base price per night"
              currency={currency}
              value={values.basePrice}
              onChange={(v) => set("basePrice", v)}
              error={errors.basePrice}
              isRequired
            />
            <PriceField
              label="Weekend price"
              currency={currency}
              value={values.weekendPrice}
              onChange={(v) => set("weekendPrice", v)}
              placeholder="Same as base"
            />
          </div>
        </FormSection>

        <FormSection title="Amenities" framed={framed}>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Amenities">
            {allAmenityOptions.map((label) => {
              const selected = values.selectedAmenities.includes(label);
              return (
                <ToggleButton
                  key={label}
                  size="sm"
                  isSelected={selected}
                  onChange={() => toggleAmenity(label)}
                  className="gap-1 rounded-lg font-medium max-md:h-11 data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary"
                >
                  {selected && <Check className="size-3" aria-hidden="true" />}
                  {label}
                </ToggleButton>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <TextField
              aria-label="Add an amenity"
              value={customAmenityInput}
              onChange={setCustomAmenityInput}
              className="min-w-0 flex-1"
            >
              <Input
                placeholder="Add an amenity"
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomAmenity();
                  }
                }}
                className={FIELD_INPUT}
              />
            </TextField>
            <Button
              variant="secondary"
              onPress={addCustomAmenity}
              isDisabled={!customAmenityInput.trim()}
              className="rounded-xl max-md:h-11"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add
            </Button>
          </div>
        </FormSection>

        {!photosFirst && photos}

        <FormSection title="Visibility" framed={framed}>
          <SettingsRow label="Active" hint="Hidden from the booking page when off">
            <Switch isSelected={values.isActive} onChange={(selected) => set("isActive", selected)} aria-label="Room type active">
              <Switch.Content className="min-h-11 items-center md:min-h-0">
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingsRow>
        </FormSection>

        {/* Create flows end with a plain footer; edit pages use the save bar below. */}
        {isModal ? (
          <div className="flex flex-col-reverse gap-2 pb-2 sm:flex-row sm:justify-end">
            <Button variant="tertiary" onPress={onCancel} className="rounded-xl max-sm:w-full max-md:h-11">
              Cancel
            </Button>
            <Button type="submit" variant="primary" isDisabled={!canSubmit} isPending={submitting} className="rounded-xl font-semibold max-sm:w-full max-md:h-11">
              {submitting ? submittingLabel : submitLabel}
            </Button>
          </div>
        ) : !isEdit ? (
          <div className="flex flex-col-reverse gap-2 pb-8 sm:flex-row sm:justify-end lg:ml-[14rem]">
            <Link
              href="/dashboard/rooms"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-medium text-foreground outline-none sm:w-auto focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary"
            >
              Cancel
            </Link>
            <Button type="submit" variant="primary" isDisabled={!canSubmit} isPending={submitting} className="rounded-xl font-semibold max-sm:w-full max-md:h-11">
              {submitting ? submittingLabel : submitLabel}
            </Button>
          </div>
        ) : (
          <div className="pb-8">
            <SaveBar
              visible={dirty || submitting}
              saving={submitting}
              canSave={canSubmit}
              onSave={() => void submit()}
              onDiscard={discard}
              saveLabel={submitLabel}
            />
          </div>
        )}
      </form>
    </div>
  );
}

function PriceField({
  label,
  currency,
  value,
  onChange,
  error,
  placeholder = "0.00",
  isRequired,
}: {
  label: string;
  currency: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  isRequired?: boolean;
}) {
  return (
    <TextField value={value} onChange={onChange} type="number" isRequired={isRequired} isInvalid={!!error} className="w-full">
      <Label className={FIELD_LABEL}>{label}</Label>
      <InputGroup className="rounded-xl max-md:h-11">
        <InputGroup.Prefix className="text-xs font-medium text-muted-foreground">{currency}</InputGroup.Prefix>
        <InputGroup.Input min="0" step="0.01" inputMode="decimal" placeholder={placeholder} className="min-w-0 tabular-nums max-md:text-base" />
      </InputGroup>
      <FieldError>{error}</FieldError>
    </TextField>
  );
}
