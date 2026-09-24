"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { Camera, X } from "lucide-react";

import { updateRoomType } from "@/app/actions/rooms";
import { toAmenityObjects } from "@/lib/amenities";

import {
  RoomTypeForm,
  type RoomTypeFormValues,
} from "../../_components/room-type-form";

interface EditRoomTypeClientProps {
  roomTypeId: string;
  hotelId: string;
  /** ISO currency code used as the price prefix (e.g. GHS, USD) */
  currency: string;
  /** Current room type name — shown as the page title */
  name: string;
  initialValues: Partial<RoomTypeFormValues>;
  initialImages: { url: string; caption: string; order: number }[];
  /** True right after creation (?new=1) — shows the "add photos" nudge */
  isNew: boolean;
}

export function EditRoomTypeClient({
  roomTypeId,
  hotelId,
  currency,
  name,
  initialValues,
  initialImages,
  isNew,
}: EditRoomTypeClientProps) {
  const router = useRouter();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [showBanner, setShowBanner] = React.useState(isNew);

  async function handleSubmit(values: RoomTypeFormValues) {
    const result = await updateRoomType(roomTypeId, {
      name: values.name,
      slug: values.slug,
      shortDescription: values.shortDescription,
      description: values.description,
      bedConfiguration: values.bedConfiguration,
      maxAdults: values.maxAdults,
      maxChildren: values.maxChildren,
      basePrice: Number(values.basePrice),
      weekendPrice: values.weekendPrice ? Number(values.weekendPrice) : undefined,
      amenities: toAmenityObjects(values.selectedAmenities),
      isActive: values.isActive,
    });

    if (result.success) {
      toast.success(`"${values.name}" updated`);
      // Refresh server data so the page header (title) reflects the save
      router.refresh();
      return { success: true };
    }

    if ("fieldErrors" in result && result.fieldErrors) {
      const fieldErrors: Record<string, string> = {};
      for (const [key, msgs] of Object.entries(
        result.fieldErrors as Record<string, string[]>
      )) {
        if ((msgs as string[])[0]) fieldErrors[key] = (msgs as string[])[0];
      }
      setErrors(fieldErrors);
    }
    toast.danger(result.error || "Failed to update room type");
    return { success: false, error: result.error };
  }

  return (
    <>
      {/* "Just created" banner — shown when redirected from the new page */}
      {showBanner && (
        <div className="mx-auto mb-4 max-w-2xl">
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3"
          >
            <Camera className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Room created — now add photos
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300/80">
                Rooms with photos get significantly more bookings. Add at least 3 photos below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBanner(false)}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-amber-600/70 transition-colors hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-400/70 dark:hover:text-amber-200"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <RoomTypeForm
        initialValues={initialValues}
        hotelId={hotelId}
        roomTypeId={roomTypeId}
        initialImages={initialImages}
        photosFirst
        currency={currency}
        onSubmit={handleSubmit}
        submitLabel="Save Changes"
        submittingLabel="Saving..."
        title={name}
        errors={errors}
      />
    </>
  );
}
