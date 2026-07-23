"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateHotelProfile } from "@/app/actions/settings";
import { saveHotelImageUrl } from "@/app/actions/upload";
import { ImageUpload } from "@/components/ui/image-upload";

// ── Types ──────────────────────────────────────────────────────────

interface HotelSettingsClientProps {
  hotelId: string;
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
    currency: string;
    cancellationPolicy: string;
    taxEnabled: boolean;
    taxPercentage: number;
  };
  logoUrl: string | null;
  coverImageUrl: string | null;
  staffName?: string;
}

// ── Timezone Options ───────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────

export function HotelSettingsClient({
  hotelId,
  initialData,
  logoUrl,
  coverImageUrl,
  staffName,
}: HotelSettingsClientProps) {
  const router = useRouter();
  const [values, setValues] = React.useState(initialData);
  const [saving, setSaving] = React.useState(false);
  const [currentLogoUrl, setCurrentLogoUrl] = React.useState(logoUrl);
  const [currentCoverUrl, setCurrentCoverUrl] = React.useState(coverImageUrl);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Hotel name *
            </label>
            <Input
              placeholder="Your hotel name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              className="h-9 rounded-xl"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                City
              </label>
              <Input
                placeholder="e.g. Accra"
                value={values.city}
                onChange={(e) => set("city", e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Country
              </label>
              <Input
                placeholder="e.g. Ghana"
                value={values.country}
                onChange={(e) => set("country", e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Address
            </label>
            <Input
              placeholder="Street address"
              value={values.address}
              onChange={(e) => set("address", e.target.value)}
              className="h-9 rounded-xl"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Phone
              </label>
              <Input
                type="tel"
                placeholder="+233 XX XXX XXXX"
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Email
              </label>
              <Input
                type="email"
                placeholder="hotel@example.com"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Hotel description
            </label>
            <textarea
              placeholder="Describe your hotel, its location, amenities, and atmosphere..."
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
              maxLength={2000}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground resize-none"
            />
            <p className="text-caption text-muted-foreground/50 mt-1">
              {values.description.length}/2000 · Shown on the guest booking page
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Operations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Check-in time
              </label>
              <Input
                type="time"
                value={values.checkInTime}
                onChange={(e) => set("checkInTime", e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Check-out time
              </label>
              <Input
                type="time"
                value={values.checkOutTime}
                onChange={(e) => set("checkOutTime", e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Timezone
              </label>
              <select
                value={values.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                className="h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Select timezone...</option>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Currency
              </label>
              <select
                value={values.currency}
                onChange={(e) => set("currency", e.target.value)}
                className="h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Select currency...</option>
                <option value="GHS">GHS (Ghana Cedi)</option>
                <option value="NGN">NGN (Nigerian Naira)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Cancellation Policy
            </label>
            <textarea
              placeholder="e.g. Free cancellation up to 24 hours before check-in. No refunds for late cancellations."
              value={values.cancellationPolicy}
              onChange={(e) => set("cancellationPolicy", e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground resize-none"
            />
            <p className="text-caption text-muted-foreground/50 mt-1">
              {values.cancellationPolicy.length}/500 · Shown to guests at checkout
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tax / VAT */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Tax / VAT</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Enable Tax / VAT</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Applied to all new bookings when enabled. Shown as a line item on guest invoices.
              </p>
            </div>
            <Switch checked={values.taxEnabled} onCheckedChange={() => set("taxEnabled", !values.taxEnabled)} />
          </div>
          {values.taxEnabled && (
            <div className="flex items-center gap-3">
              <div className="w-36">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Tax rate (%)
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={values.taxPercentage}
                    onChange={(e) => set("taxPercentage", parseFloat(e.target.value) || 0)}
                    className="h-9 rounded-xl pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-5">
                e.g. 15% VAT adds {values.taxPercentage}% to the room subtotal
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Media</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <ImageUpload
              label="Logo"
              hint="Shown in the admin header and guest booking page. Square recommended."
              currentUrl={currentLogoUrl}
              storagePath={`hotels/${hotelId}/branding`}
              aspect="aspect-square"
              onUpload={async (url) => {
                await saveHotelImageUrl("logo", url);
                setCurrentLogoUrl(url);
              }}
              onRemove={async () => {
                await saveHotelImageUrl("logo", "");
                setCurrentLogoUrl(null);
              }}
            />
            <ImageUpload
              label="Cover Image"
              hint="Hero image on the guest booking page. Landscape recommended."
              currentUrl={currentCoverUrl}
              storagePath={`hotels/${hotelId}/branding`}
              aspect="aspect-video"
              onUpload={async (url) => {
                await saveHotelImageUrl("cover", url);
                setCurrentCoverUrl(url);
              }}
              onRemove={async () => {
                await saveHotelImageUrl("cover", "");
                setCurrentCoverUrl(null);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center justify-between pb-8">
        <p className="text-xs text-muted-foreground">
          {staffName ? `Editing as ${staffName}` : ""}
        </p>
        <Button
          type="submit"
          disabled={saving || !values.name || !hasChanges}
          className="text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90 min-w-[140px]"
        >
          <Save className="size-3.5 mr-1.5" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
