"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert, CloseButton, toast } from "@heroui/react";
import { Camera } from "lucide-react";

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
    <RoomTypeForm
      initialValues={initialValues}
      hotelId={hotelId}
      roomTypeId={roomTypeId}
      initialImages={initialImages}
      photosFirst
      currency={currency}
      onSubmit={handleSubmit}
      submitLabel="Save changes"
      submittingLabel="Saving…"
      title={name}
      errors={errors}
      notice={
        showBanner ? (
          <Alert status="accent" className="rounded-2xl animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-[var(--ease-out-ui)] motion-reduce:animate-none">
            <Alert.Indicator>
              <Camera className="size-4" aria-hidden="true" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>Room type created. Add photos next.</Alert.Title>
            </Alert.Content>
            <CloseButton aria-label="Dismiss" onPress={() => setShowBanner(false)} />
          </Alert>
        ) : undefined
      }
    />
  );
}
