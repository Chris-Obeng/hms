"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AMENITIES_LIST } from "@/lib/amenities";

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
  sortOrder: number;
}

export interface RoomTypeFormProps {
  /** Pre-populated values for edit mode */
  initialValues?: Partial<RoomTypeFormValues>;
  /** Called with form values on submit */
  onSubmit: (values: RoomTypeFormValues) => Promise<{ success: boolean; error?: string }>;
  /** Label for the submit button (e.g. "Create Room Type") */
  submitLabel: string;
  /** Label while submitting (e.g. "Creating...") */
  submittingLabel: string;
  /** Page title (e.g. "New Room Type") */
  title: string;
  /** Page subtitle */
  subtitle: string;
  /** Validation errors from server action, keyed by field name */
  errors: Record<string, string>;
}

// ── Slugify ────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
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
  sortOrder: 0,
};

// ── Component ──────────────────────────────────────────────────

export function RoomTypeForm({
  initialValues = {},
  onSubmit,
  submitLabel,
  submittingLabel,
  title,
  subtitle,
  errors,
}: RoomTypeFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false);

  // Merge defaults with initial values
  const [values, setValues] = React.useState<RoomTypeFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });

  // Auto-generate slug from name (only if not manually edited)
  React.useEffect(() => {
    if (values.name && !slugManuallyEdited) {
      setValues((prev) => ({ ...prev, slug: slugify(values.name) }));
    }
  }, [values.name, slugManuallyEdited]);

  function set<K extends keyof RoomTypeFormValues>(key: K, value: RoomTypeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await onSubmit(values);
      // Parent page handles its own success/error toasts with context-specific messages
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleAmenity(label: string) {
    setValues((prev) => ({
      ...prev,
      selectedAmenities: prev.selectedAmenities.includes(label)
        ? prev.selectedAmenities.filter((a) => a !== label)
        : [...prev.selectedAmenities, label],
    }));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/rooms/types"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Name *
                </label>
                <Input
                  placeholder="e.g. Deluxe King Room"
                  value={values.name}
                  onChange={(e) => {
                    set("name", e.target.value);
                    setSlugManuallyEdited(false);
                  }}
                  className={cn("h-9 rounded-xl", errors.name && "border-destructive")}
                />
                {errors.name && (
                  <p className="text-xs text-destructive mt-1">{errors.name}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Slug
                </label>
                <Input
                  placeholder="auto-generated"
                  value={values.slug}
                  onChange={(e) => {
                    set("slug", e.target.value);
                    setSlugManuallyEdited(true);
                  }}
                  className="h-9 rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Short description
              </label>
              <Input
                placeholder="A brief description for listings..."
                value={values.shortDescription}
                onChange={(e) => set("shortDescription", e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Full description
              </label>
              <textarea
                placeholder="Detailed description of this room type..."
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Bed configuration
              </label>
              <Input
                placeholder="e.g. 1 King Bed, 1 Sofa Bed"
                value={values.bedConfiguration}
                onChange={(e) => set("bedConfiguration", e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Max adults
                </label>
                <select
                  value={values.maxAdults}
                  onChange={(e) => set("maxAdults", Number(e.target.value))}
                  className="h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Max children
                </label>
                <select
                  value={values.maxChildren}
                  onChange={(e) => set("maxChildren", Number(e.target.value))}
                  className="h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Base price / night *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">
                    GHS
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={values.basePrice}
                    onChange={(e) => set("basePrice", e.target.value)}
                    className={cn("h-9 pl-12 rounded-xl", errors.basePrice && "border-destructive")}
                  />
                </div>
                {errors.basePrice && (
                  <p className="text-xs text-destructive mt-1">{errors.basePrice}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Weekend price (optional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">
                    GHS
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={values.weekendPrice}
                    onChange={(e) => set("weekendPrice", e.target.value)}
                    className="h-9 pl-12 rounded-xl"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Amenities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Amenities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {AMENITIES_LIST.map((amenity) => {
                const isSelected = values.selectedAmenities.includes(amenity.label);
                return (
                  <button
                    key={amenity.label}
                    type="button"
                    onClick={() => toggleAmenity(amenity.label)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                      isSelected
                        ? "border-foreground/30 bg-foreground/5 text-foreground"
                        : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    {isSelected ? <X className="size-3" /> : <Plus className="size-3" />}
                    {amenity.label}
                  </button>
                );
              })}
            </div>
            {values.selectedAmenities.length === 0 && (
              <p className="text-xs text-muted-foreground/50 mt-3 italic">
                Click amenities above to add them to this room type.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive room types are hidden from the guest booking page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => set("isActive", !values.isActive)}
                className={cn(
                  "relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  values.isActive ? "bg-foreground" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block size-5 rounded-full bg-background shadow ring-0 transition-transform",
                    values.isActive ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Sort order
              </label>
              <Input
                type="number"
                min="0"
                value={values.sortOrder}
                onChange={(e) => set("sortOrder", Number(e.target.value))}
                className="h-9 rounded-xl w-24"
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pb-8">
          <Link href="/dashboard/rooms/types">
            <Button variant="ghost" type="button" className="text-sm rounded-xl">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={submitting || !values.name || !values.basePrice}
            className="text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90 min-w-[140px]"
          >
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
