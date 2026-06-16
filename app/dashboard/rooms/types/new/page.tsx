"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RoomTypeForm, type RoomTypeFormValues } from "../../_components/room-type-form";
import { createRoomType } from "@/app/actions/rooms";
import { AMENITIES_LIST } from "@/lib/amenities";

export default function NewRoomTypePage() {
  const router = useRouter();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  async function handleSubmit(values: RoomTypeFormValues) {
    const selectedAmenitiesData = AMENITIES_LIST.filter((a) =>
      values.selectedAmenities.includes(a.label)
    ).map((a) => ({ icon: a.icon, label: a.label }));

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
      amenities: selectedAmenitiesData,
      isActive: values.isActive,
      sortOrder: values.sortOrder,
    });

    if (result.success) {
      toast.success(`Room type "${values.name}" created`);
      router.push("/dashboard/rooms/types");
      router.refresh();
      return { success: true };
    } else {
      if (result.fieldErrors) {
        const fieldErrors: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(result.fieldErrors)) {
          fieldErrors[key] = msgs[0];
        }
        setErrors(fieldErrors);
      }
      toast.error(result.error || "Failed to create room type");
      return { success: false, error: result.error };
    }
  }

  return (
    <RoomTypeForm
      onSubmit={handleSubmit}
      submitLabel="Create Room Type"
      submittingLabel="Creating..."
      title="New Room Type"
      subtitle="Add a new room category to your hotel."
      errors={errors}
    />
  );
}
