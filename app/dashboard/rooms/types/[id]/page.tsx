"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RoomTypeForm, type RoomTypeFormValues } from "../../_components/room-type-form";
import { getRoomType, updateRoomType } from "@/app/actions/rooms";
import { AMENITIES_LIST } from "@/lib/amenities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditRoomTypePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [fetching, setFetching] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [initialValues, setInitialValues] = React.useState<Partial<RoomTypeFormValues> | undefined>(undefined);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Fetch room type on mount
  React.useEffect(() => {
    async function load() {
      const result = await getRoomType(id);
      if (!result.success || !result.data) {
        setNotFound(true);
        setFetching(false);
        return;
      }
      const rt = result.data;
      setInitialValues({
        name: rt.name,
        slug: rt.slug,
        shortDescription: rt.shortDescription || "",
        description: rt.description || "",
        bedConfiguration: rt.bedConfiguration || "",
        maxAdults: rt.maxAdults || 2,
        maxChildren: rt.maxChildren || 0,
        basePrice: rt.basePrice.toString(),
        weekendPrice: rt.weekendPrice?.toString() || "",
        selectedAmenities: (rt.amenities || []).map((a) => a.label),
        isActive: rt.isActive ?? true,
        sortOrder: rt.sortOrder || 0,
      });
      setFetching(false);
    }
    load();
  }, [id]);

  async function handleSubmit(values: RoomTypeFormValues) {
    const selectedAmenitiesData = AMENITIES_LIST.filter((a) =>
      values.selectedAmenities.includes(a.label)
    ).map((a) => ({ icon: a.icon, label: a.label }));

    const result = await updateRoomType(id, {
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
      toast.success(`Room type "${values.name}" updated`);
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
      toast.error(result.error || "Failed to update room type");
      return { success: false, error: result.error };
    }
  }

  // Loading skeleton
  if (fetching) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-8 rounded-lg" />
          <div>
            <Skeleton className="h-6 w-48 mb-1" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-9 w-full rounded-xl" />
              <Skeleton className="h-9 w-full rounded-xl" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Not found state
  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <p className="text-lg font-semibold text-foreground">Room type not found</p>
        <Link href="/dashboard/rooms/types">
          <Button variant="outline" className="mt-4 text-sm rounded-xl">
            Back to Room Types
          </Button>
        </Link>
      </div>
    );
  }

  // Ready to render form (initialValues must be set by now)
  return (
    <RoomTypeForm
      initialValues={initialValues}
      onSubmit={handleSubmit}
      submitLabel="Save Changes"
      submittingLabel="Saving..."
      title="Edit Room Type"
      subtitle="Update room type details and pricing."
      errors={errors}
    />
  );
}
