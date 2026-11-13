"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  Switch,
  TextArea,
  TextField,
  TimeField,
  toast,
} from "@heroui/react";
import { parseTime } from "@internationalized/date";
import { Check, Copy, ExternalLink } from "lucide-react";

import { updateHotelProfile } from "@/app/actions/settings";
import { saveHotelImageUrl } from "@/app/actions/upload";
import { ImageUpload } from "@/components/ui/image-upload";
import { type HotelCurrency } from "@/lib/money";
import { SaveBar, SettingsGroup, SettingsRow } from "../_components/settings-ui";

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

/** Field heights: 44px touch targets on phones, 40px from `sm`. */
const FIELD_H = "min-h-11 sm:min-h-10";

function toTime(value: string) {
  if (!value) return null;
  try {
    return parseTime(value.length === 5 ? value : value.slice(0, 5));
  } catch {
    return null;
  }
}

export function HotelSettingsClient({
  canEdit,
  hotelId,
  bookingUrl,
  initialData,
  logoUrl,
  coverImageUrl,
}: HotelSettingsClientProps) {
  const router = useRouter();
  const [values, setValues] = React.useState(initialData);
  const [saving, setSaving] = React.useState(false);
  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [currentLogoUrl, setCurrentLogoUrl] = React.useState(logoUrl);
  const [currentCoverUrl, setCurrentCoverUrl] = React.useState(coverImageUrl);

  const timezones = React.useMemo(() => {
    const active = values.timezone || "Africa/Accra";
    return TIMEZONE_OPTIONS.includes(active) ? TIMEZONE_OPTIONS : [active, ...TIMEZONE_OPTIONS];
  }, [values.timezone]);

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const hasChanges = JSON.stringify(values) !== JSON.stringify(initialData);

  async function save() {
    if (!values.name.trim()) {
      toast.danger("Hotel name is required");
      return;
    }
    setSaving(true);
    const result = await updateHotelProfile(values);
    setSaving(false);
    if (result.success) {
      toast.success("Hotel profile saved");
      router.refresh();
    } else {
      toast.danger(result.error || "Failed to update hotel profile");
    }
  }

  // Warn before leaving with unsaved edits
  React.useEffect(() => {
    if (!canEdit || !hasChanges) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
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

  const disabled = !canEdit;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-8"
    >
      {!canEdit && (
        <Alert status="default" className="rounded-2xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>View only</Alert.Title>
            <Alert.Description>A super admin manages the hotel profile.</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {bookingUrl && (
        <SettingsGroup title="Booking page">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-xl bg-secondary/70 px-3 sm:min-h-10">
              <span className="truncate font-mono text-sm text-foreground select-all">
                {bookingUrl.replace(/^https?:\/\//, "")}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onPress={copyBookingLink} className="flex-1 rounded-xl sm:flex-initial">
                {copiedUrl ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                {copiedUrl ? "Copied" : "Copy"}
              </Button>
              <Button
                variant="tertiary"
                onPress={() => window.open(bookingUrl, "_blank", "noopener,noreferrer")}
                className="flex-1 rounded-xl sm:flex-initial"
              >
                <ExternalLink className="size-4" />
                Open
              </Button>
            </div>
          </div>
        </SettingsGroup>
      )}

      <SettingsGroup title="Profile">
        <TextField fullWidth isRequired isDisabled={disabled} value={values.name} onChange={(v) => set("name", v)}>
          <Label>Hotel name</Label>
          <Input placeholder="Your hotel name" />
        </TextField>
        <TextField fullWidth isDisabled={disabled} value={values.description} onChange={(v) => set("description", v)}>
          <Label>Description</Label>
          <TextArea rows={3} maxLength={2000} placeholder="What makes your hotel special" className="resize-none" />
        </TextField>
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
          <ImageUpload
            label="Logo"
            disabled={disabled}
            currentUrl={currentLogoUrl}
            storagePath={`hotels/${hotelId}/branding`}
            aspect="h-24"
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
            disabled={disabled}
            currentUrl={currentCoverUrl}
            storagePath={`hotels/${hotelId}/branding`}
            aspect="h-24"
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
      </SettingsGroup>

      <SettingsGroup title="Contact">
        <TextField fullWidth isDisabled={disabled} value={values.address} onChange={(v) => set("address", v)}>
          <Label>Address</Label>
          <Input placeholder="Street address" autoComplete="street-address" />
        </TextField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField fullWidth isDisabled={disabled} value={values.city} onChange={(v) => set("city", v)}>
            <Label>City</Label>
            <Input placeholder="Accra" />
          </TextField>
          <TextField fullWidth isDisabled={disabled} value={values.country} onChange={(v) => set("country", v)}>
            <Label>Country</Label>
            <Input placeholder="Ghana" />
          </TextField>
          <TextField fullWidth isDisabled={disabled} type="tel" value={values.phone} onChange={(v) => set("phone", v)}>
            <Label>Phone</Label>
            <Input placeholder="+233 30 000 0000" inputMode="tel" />
          </TextField>
          <TextField fullWidth isDisabled={disabled} type="email" value={values.email} onChange={(v) => set("email", v)}>
            <Label>Email</Label>
            <Input placeholder="hello@yourhotel.com" />
          </TextField>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Stays">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TimeField
            granularity="minute"
            isDisabled={disabled}
            value={toTime(values.checkInTime)}
            onChange={(v) => set("checkInTime", v ? v.toString().slice(0, 5) : "")}
          >
            <Label>Check-in</Label>
            <TimeField.Group className="h-11 sm:h-10">
              <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
            </TimeField.Group>
          </TimeField>
          <TimeField
            granularity="minute"
            isDisabled={disabled}
            value={toTime(values.checkOutTime)}
            onChange={(v) => set("checkOutTime", v ? v.toString().slice(0, 5) : "")}
          >
            <Label>Check-out</Label>
            <TimeField.Group className="h-11 sm:h-10">
              <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
            </TimeField.Group>
          </TimeField>

          <Select
            fullWidth
            isDisabled={disabled}
            value={values.timezone || "Africa/Accra"}
            onChange={(v) => v && set("timezone", String(v))}
          >
            <Label>Timezone</Label>
            <Select.Trigger className={FIELD_H}>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover className="max-h-72">
              <ListBox>
                {timezones.map((tz) => (
                  <ListBox.Item key={tz} id={tz} textValue={tz}>
                    {tz.replace("_", " ")}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <TextField fullWidth isReadOnly value="GHS · Ghana Cedi">
            <Label>Currency</Label>
            <Input className="bg-secondary/60 text-muted-foreground" />
          </TextField>
        </div>
        <TextField
          fullWidth
          isDisabled={disabled}
          value={values.cancellationPolicy}
          onChange={(v) => set("cancellationPolicy", v)}
        >
          <Label>Cancellation policy</Label>
          <TextArea rows={2} maxLength={500} placeholder="Free cancellation up to 24 hours before check-in" className="resize-none" />
        </TextField>
      </SettingsGroup>

      <SettingsGroup title="Tax">
        <SettingsRow label="Charge tax / VAT">
          <Switch
            aria-label="Charge tax / VAT"
            isSelected={values.taxEnabled}
            isDisabled={disabled}
            onChange={(v) => set("taxEnabled", v)}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        </SettingsRow>
        {values.taxEnabled && (
          <NumberField
            value={values.taxPercentage}
            minValue={0}
            maxValue={100}
            step={0.5}
            isDisabled={disabled}
            onChange={(v) => set("taxPercentage", typeof v === "number" && !Number.isNaN(v) ? v : 0)}
            formatOptions={{ maximumFractionDigits: 2 }}
            className="max-w-48"
          >
            <Label>Rate (%)</Label>
            <NumberField.Group>
              <NumberField.DecrementButton />
              <NumberField.Input className="min-w-0 text-center tabular-nums" />
              <NumberField.IncrementButton />
            </NumberField.Group>
          </NumberField>
        )}
      </SettingsGroup>

      {canEdit && (
        <SaveBar
          visible={hasChanges || saving}
          saving={saving}
          canSave={Boolean(values.name.trim())}
          onSave={() => void save()}
          onDiscard={() => setValues(initialData)}
        />
      )}
    </form>
  );
}
