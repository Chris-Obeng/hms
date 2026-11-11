"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button as HeroButton, toast } from "@heroui/react";
import { Check, Copy, ExternalLink } from "lucide-react";

import { updateHotelProfile } from "@/app/actions/settings";
import { saveHotelImageUrl } from "@/app/actions/upload";
import { HeroSelectField } from "@/components/ui/hero-select";
import { ImageUpload } from "@/components/ui/image-upload";
import { PenCard } from "@/components/ui/pen/pen-card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type HotelCurrency } from "@/lib/money";

const TIMEZONE_OPTIONS = [
  "Africa/Accra",
  "Africa/Abidjan",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Cairo",
  "Africa/Casablanca",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

interface HotelSettingsClientProps {
  canEdit: boolean;
  hotelId: string;
  bookingUrl?: string | null;
  initialData: {
    name: string;
    address: string;
    city: string;
    country: string;
    phone: string;
    email: string;
    description: string;
    checkInTime: string;
    checkOutTime: string;
    timezone: string;
    currency: HotelCurrency;
    cancellationPolicy: string;
    taxEnabled: boolean;
    taxPercentage: number;
  };
  logoUrl: string | null;
  coverImageUrl: string | null;
  staffName?: string;
}

const inputClass = "h-10 w-full rounded-[10px] border border-border/70 bg-card px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60";
const labelClass = "text-xs font-medium text-muted-foreground";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-1.5", className)}>
    <label className={labelClass}>{label}</label>
    {children}
  </div>;
}

/** Hotel profile panel per the design: one card, paired fields, branding tiles, footer save. */
export function HotelSettingsClient({ canEdit, hotelId, bookingUrl, initialData, logoUrl, coverImageUrl, staffName }: HotelSettingsClientProps) {
  const router = useRouter();
  const [values, setValues] = React.useState(initialData);
  const [saving, setSaving] = React.useState(false);
  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [currentLogoUrl, setCurrentLogoUrl] = React.useState(logoUrl);
  const [currentCoverUrl, setCurrentCoverUrl] = React.useState(coverImageUrl);

  const timezoneOptions = React.useMemo(() => {
    const active = values.timezone || "Africa/Accra";
    const list = TIMEZONE_OPTIONS.includes(active)
      ? TIMEZONE_OPTIONS
      : [active, ...TIMEZONE_OPTIONS];
    return list.map((tz) => ({ value: tz, label: tz }));
  }, [values.timezone]);

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const result = await updateHotelProfile(values);
    setSaving(false);

    if (result.success) {
      toast.success("Hotel profile updated");
      router.refresh();
    } else {
      toast.danger(result.error || "Failed to update hotel profile");
    }
  };

  const hasChanges = JSON.stringify(values) !== JSON.stringify(initialData);

  // Warn before leaving with unsaved edits
  React.useEffect(() => {
    if (!canEdit || !hasChanges) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [canEdit, hasChanges]);

  function copyBookingLink() {
    if (!bookingUrl) return;
    navigator.clipboard.writeText(bookingUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {bookingUrl && (
        <PenCard className="gap-2.5 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-[15px] font-semibold text-foreground">Direct booking page</h2>
              <p className="text-xs text-muted-foreground">Share this link so guests can book {values.name || "your property"} directly.</p>
            </div>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Open
            </a>
          </div>
          <div className="flex h-10 items-center gap-2 rounded-[10px] border border-border/70 bg-secondary/50 px-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground select-all">
              {bookingUrl.replace(/^https?:\/\//, "")}
            </span>
            <button
              type="button"
              onClick={copyBookingLink}
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {copiedUrl ? (
                <>
                  <Check className="size-3.5 text-[var(--success)]" aria-hidden="true" />
                  <span className="text-[var(--success)]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </PenCard>
      )}

      <PenCard className="gap-4 sm:p-5">
        <header className="space-y-0.5">
          <h2 className="text-[15px] font-semibold text-foreground">Hotel profile</h2>
          <p className="text-xs text-muted-foreground">Guests see these details on your booking page and emails.</p>
        </header>

        <Field label="Hotel name">
          <input className={inputClass} placeholder="Your hotel name" value={values.name} required
            disabled={!canEdit} onChange={(e) => set("name", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="City">
            <input className={inputClass} placeholder="e.g. Accra" value={values.city} disabled={!canEdit} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Country">
            <input className={inputClass} placeholder="e.g. Ghana" value={values.country} disabled={!canEdit} onChange={(e) => set("country", e.target.value)} />
          </Field>
        </div>

        <Field label="Address">
          <input className={inputClass} placeholder="Street address" value={values.address} disabled={!canEdit} onChange={(e) => set("address", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <input type="tel" className={inputClass} placeholder="+233 XX XXX XXXX" value={values.phone} disabled={!canEdit} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputClass} placeholder="hotel@example.com" value={values.email} disabled={!canEdit} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>

        <Field label="Hotel description">
          <textarea rows={3} maxLength={2000} className={cn(inputClass, "h-auto resize-none py-2.5 leading-relaxed")}
            placeholder="Describe your hotel, its location, amenities, and atmosphere…" value={values.description}
            disabled={!canEdit} onChange={(e) => set("description", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Check-in time">
            <input type="time" className={inputClass} value={values.checkInTime} disabled={!canEdit} onChange={(e) => set("checkInTime", e.target.value)} />
          </Field>
          <Field label="Check-out time">
            <input type="time" className={inputClass} value={values.checkOutTime} disabled={!canEdit} onChange={(e) => set("checkOutTime", e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Timezone">
            <HeroSelectField
              value={values.timezone || "Africa/Accra"}
              onValueChange={(next) => set("timezone", next)}
              options={timezoneOptions}
              label={null}
              ariaLabel="Timezone"
              isDisabled={!canEdit}
            />
          </Field>
          <Field label="Currency">
            <div className="flex h-10 items-center rounded-[10px] border border-border/70 bg-secondary/50 px-3 text-[13px] text-foreground">
              GHS <span className="ml-1.5 text-muted-foreground">· Ghana Cedi</span>
            </div>
          </Field>
        </div>

        <Field label="Cancellation policy">
          <textarea rows={2} maxLength={500} className={cn(inputClass, "h-auto resize-none py-2.5 leading-relaxed")}
            placeholder="e.g. Free cancellation up to 24 hours before check-in." value={values.cancellationPolicy}
            disabled={!canEdit} onChange={(e) => set("cancellationPolicy", e.target.value)} />
        </Field>

        <div className="space-y-3 rounded-2xl border border-border/60 bg-secondary/30 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-[13px] font-medium text-foreground">Tax / VAT</p>
              <p className="text-xs text-muted-foreground">Applied as a line item on new bookings and guest invoices.</p>
            </div>
            <Switch
              aria-label="Enable Tax / VAT"
              checked={values.taxEnabled}
              isDisabled={!canEdit}
              onCheckedChange={(checked) => set("taxEnabled", checked)}
            />
          </div>
          {values.taxEnabled && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="w-36">
                <label htmlFor="hotel-tax-rate" className={cn(labelClass, "mb-1.5 block")}>Tax rate (%)</label>
                <div className="relative">
                  <input
                    id="hotel-tax-rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    disabled={!canEdit}
                    value={values.taxPercentage}
                    onChange={(e) => set("taxPercentage", parseFloat(e.target.value) || 0)}
                    className={cn(inputClass, "pr-8 tabular-nums")}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                Adds {values.taxPercentage}% to the room subtotal on guest invoices.
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
          <ImageUpload
            label="Logo"
            disabled={!canEdit}
            currentUrl={currentLogoUrl}
            storagePath={`hotels/${hotelId}/branding`}
            aspect="h-[84px]"
            onUpload={async (url) => { await saveHotelImageUrl("logo", url); setCurrentLogoUrl(url); }}
            onRemove={async () => { await saveHotelImageUrl("logo", ""); setCurrentLogoUrl(null); }}
          />
          <ImageUpload
            label="Cover image"
            disabled={!canEdit}
            currentUrl={currentCoverUrl}
            storagePath={`hotels/${hotelId}/branding`}
            aspect="h-[84px]"
            onUpload={async (url) => { await saveHotelImageUrl("cover", url); setCurrentCoverUrl(url); }}
            onRemove={async () => { await saveHotelImageUrl("cover", ""); setCurrentCoverUrl(null); }}
          />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3.5">
          <p className="text-[11px] text-muted-foreground">
            {canEdit
              ? saving ? "Saving changes…" : hasChanges ? "You have unsaved changes." : staffName ? `Changes apply immediately · ${staffName}` : "Changes apply across the property immediately."
              : "View only — a super admin manages this profile."}
          </p>
          {canEdit && <HeroButton type="submit" variant="primary" isPending={saving} isDisabled={!values.name || (!hasChanges && !saving)}
            className="h-9 rounded-full px-5 text-sm font-medium">
            Save changes
          </HeroButton>}
        </footer>
      </PenCard>
    </form>
  );
}
