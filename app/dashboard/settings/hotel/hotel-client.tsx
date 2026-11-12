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

const inputClass = "h-11 w-full rounded-xl border border-border/70 bg-card px-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60 sm:h-10 sm:text-[13px] [@media(hover:hover)_and_(pointer:fine)]:hover:border-border";
const labelClass = "text-xs font-medium text-muted-foreground";

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      {children}
    </div>
  );
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
        <PenCard className="gap-3 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-[15px] font-semibold text-foreground">Direct booking page</h2>
              <p className="text-xs text-muted-foreground">Share this link so guests can book {values.name || "your property"} directly.</p>
            </div>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-press inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground sm:min-h-0 sm:px-0 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Open
            </a>
          </div>
          <div className="flex h-11 items-center gap-2 rounded-[12px] border border-border/70 bg-secondary/50 px-3 sm:h-10">
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground select-all">
              {bookingUrl.replace(/^https?:\/\//, "")}
            </span>
            <button
              type="button"
              onClick={copyBookingLink}
              className="ui-press inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-1 text-xs font-medium text-muted-foreground sm:min-h-0 sm:px-0 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            >
              {copiedUrl ? (
                <>
                  <Check className="size-4 text-emerald-700" aria-hidden="true" />
                  <span className="text-emerald-700">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-4" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </PenCard>
      )}

      <PenCard className="gap-4 sm:p-5">
        <header className="space-y-1">
          <h2 className="text-[15px] font-semibold text-foreground">Hotel profile</h2>
          <p className="text-xs text-muted-foreground">Guests see these details on your booking page and emails.</p>
        </header>

        <Field label="Hotel name" htmlFor="hotel-name">
          <input id="hotel-name" className={inputClass} placeholder="Your hotel name" value={values.name} required
            disabled={!canEdit} onChange={(e) => set("name", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="City" htmlFor="hotel-city">
            <input id="hotel-city" className={inputClass} placeholder="e.g. Accra" value={values.city} disabled={!canEdit} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Country" htmlFor="hotel-country">
            <input id="hotel-country" className={inputClass} placeholder="e.g. Ghana" value={values.country} disabled={!canEdit} onChange={(e) => set("country", e.target.value)} />
          </Field>
        </div>

        <Field label="Address" htmlFor="hotel-address">
          <input id="hotel-address" className={inputClass} placeholder="Street address" value={values.address} disabled={!canEdit} onChange={(e) => set("address", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone" htmlFor="hotel-phone">
            <input id="hotel-phone" type="tel" className={inputClass} placeholder="+233 XX XXX XXXX" value={values.phone} disabled={!canEdit} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="hotel-email">
            <input id="hotel-email" type="email" className={inputClass} placeholder="hotel@example.com" value={values.email} disabled={!canEdit} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>

        <Field label="Hotel description" htmlFor="hotel-description">
          <textarea id="hotel-description" rows={3} maxLength={2000} className={cn(inputClass, "h-auto resize-none py-3 leading-relaxed")}
            placeholder="Describe your hotel, its location, amenities, and atmosphere…" value={values.description}
            disabled={!canEdit} onChange={(e) => set("description", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Check-in time" htmlFor="hotel-checkin-time">
            <input id="hotel-checkin-time" type="time" className={inputClass} value={values.checkInTime} disabled={!canEdit} onChange={(e) => set("checkInTime", e.target.value)} />
          </Field>
          <Field label="Check-out time" htmlFor="hotel-checkout-time">
            <input id="hotel-checkout-time" type="time" className={inputClass} value={values.checkOutTime} disabled={!canEdit} onChange={(e) => set("checkOutTime", e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Timezone">
            <HeroSelectField
              value={values.timezone || "Africa/Accra"}
              onValueChange={(next) => set("timezone", next)}
              options={timezoneOptions}
              triggerClassName="min-h-11 sm:min-h-10"
              label={null}
              ariaLabel="Timezone"
              isDisabled={!canEdit}
            />
          </Field>
          <Field label="Currency">
            <div className="flex h-11 items-center rounded-[12px] border border-border/70 bg-secondary/50 px-3 text-[13px] text-foreground sm:h-10">
              GHS <span className="ml-2 text-muted-foreground">· Ghana Cedi</span>
            </div>
          </Field>
        </div>

        <Field label="Cancellation policy" htmlFor="hotel-cancellation-policy">
          <textarea id="hotel-cancellation-policy" rows={2} maxLength={500} className={cn(inputClass, "h-auto resize-none py-3 leading-relaxed")}
            placeholder="e.g. Free cancellation up to 24 hours before check-in." value={values.cancellationPolicy}
            disabled={!canEdit} onChange={(e) => set("cancellationPolicy", e.target.value)} />
        </Field>

        <div className="space-y-3 rounded-2xl border border-border/60 bg-secondary/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
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
                <label htmlFor="hotel-tax-rate" className={cn(labelClass, "mb-2 block")}>Tax rate (%)</label>
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
            onUpload={async (url) => {
              const res = await saveHotelImageUrl("logo", url);
              if (!res.success) {
                toast.danger(res.error || "Failed to save logo");
                return;
              }
              setCurrentLogoUrl(url);
              router.refresh();
            }}
            onRemove={async () => {
              const res = await saveHotelImageUrl("logo", "");
              if (!res.success) {
                toast.danger(res.error || "Failed to remove logo");
                return;
              }
              setCurrentLogoUrl(null);
              router.refresh();
            }}
          />
          <ImageUpload
            label="Cover image"
            disabled={!canEdit}
            currentUrl={currentCoverUrl}
            storagePath={`hotels/${hotelId}/branding`}
            aspect="h-[84px]"
            onUpload={async (url) => {
              const res = await saveHotelImageUrl("cover", url);
              if (!res.success) {
                toast.danger(res.error || "Failed to save cover image");
                return;
              }
              setCurrentCoverUrl(url);
              router.refresh();
            }}
            onRemove={async () => {
              const res = await saveHotelImageUrl("cover", "");
              if (!res.success) {
                toast.danger(res.error || "Failed to remove cover image");
                return;
              }
              setCurrentCoverUrl(null);
              router.refresh();
            }}
          />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
          <p className="text-[11px] text-muted-foreground">
            {canEdit
              ? saving ? "Saving changes…" : hasChanges ? "You have unsaved changes." : staffName ? `Changes apply immediately · ${staffName}` : "Changes apply across the property immediately."
              : "View only — a super admin manages this profile."}
          </p>
          {canEdit && <HeroButton type="submit" variant="primary" isPending={saving} isDisabled={!values.name || (!hasChanges && !saving)}
            className="ui-press h-11 rounded-full px-5 text-sm font-medium sm:h-9">
            Save changes
          </HeroButton>}
        </footer>
      </PenCard>
    </form>
  );
}
