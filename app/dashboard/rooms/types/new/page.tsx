"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { RoomTypeForm, type RoomTypeFormValues } from "../../_components/room-type-form";
import { createRoomType } from "@/app/actions/rooms";
import { toAmenityObjects } from "@/lib/amenities";

export default function NewRoomTypePage() {
  const router = useRouter();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  async function handleSubmit(values: RoomTypeFormValues) {
    const result = await createRoomType({
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
      toast.success(`"${values.name}" created — now add photos`);
      // Auto-redirect to edit page so staff can immediately upload images
      router.push(`/dashboard/rooms/types/${result.id}?new=1`);
      return { success: true };
    } else {
      if ("fieldErrors" in result && result.fieldErrors) {
        const fieldErrors: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(result.fieldErrors as Record<string, string[]>)) {
          fieldErrors[key] = (msgs as string[])[0];
        }
        setErrors(fieldErrors);
      }
      toast.danger(result.error || "Failed to create room type");
      return { success: false, error: result.error };
    }
  }

  return (
    <RoomTypeForm
      onSubmit={handleSubmit}
      submitLabel="Create Room Type"
      submittingLabel="Creating..."
      title="New Room Type"
      subtitle="Add a new room category. You'll add photos on the next step."
      errors={errors}
    />
  );
}
