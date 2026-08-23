"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "@heroui/react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoomTypeForm, type RoomTypeFormValues } from "../../_components/room-type-form";
import { getRoomType, updateRoomType } from "@/app/actions/rooms";
import { toAmenityObjects } from "@/lib/amenities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditRoomTypePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const isNew = searchParams.get("new") === "1";

  const [fetching, setFetching] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [initialValues, setInitialValues] = React.useState<Partial<RoomTypeFormValues> | undefined>(undefined);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [hotelId, setHotelId] = React.useState<string | undefined>(undefined);
  const [initialImages, setInitialImages] = React.useState<{ url: string; caption: string; order: number }[]>([]);
  const [showBanner, setShowBanner] = React.useState(isNew);

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
      setInitialImages((rt.images || []) as { url: string; caption: string; order: number }[]);
      setHotelId(rt.hotelId);
      setFetching(false);
    }
    load();
  }, [id]);

  async function handleSubmit(values: RoomTypeFormValues) {
    const selectedAmenitiesData = toAmenityObjects(values.selectedAmenities);

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
      toast.success(`"${values.name}" updated`);
      return { success: true };
    } else {
      if ("fieldErrors" in result && result.fieldErrors) {
        const fieldErrors: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(result.fieldErrors as Record<string, string[]>)) {
          fieldErrors[key] = (msgs as string[])[0];
        }
        setErrors(fieldErrors);
      }
      toast.danger(result.error || "Failed to update room type");
      return { success: false, error: result.error };
    }
  }

  if (fetching) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-8 rounded-lg" />
          <div><Skeleton className="h-6 w-48 mb-1" /><Skeleton className="h-4 w-32" /></div>
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

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <p className="text-lg font-semibold text-foreground">Room type not found</p>
        <Link href="/dashboard/rooms/types">
          <Button variant="outline" className="mt-4 text-sm rounded-xl">Back to Room Types</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* "Just created" banner — shown when redirected from new page */}
      {showBanner && (
        <div className="max-w-2xl mx-auto mb-4">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
            <Camera className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">Room created — now add photos</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Rooms with photos get significantly more bookings. Add at least 3 photos below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBanner(false)}
              className="text-amber-400 hover:text-amber-600 text-xs shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <RoomTypeForm
        initialValues={initialValues}
        hotelId={hotelId}
        roomTypeId={id}
        initialImages={initialImages}
        photosFirst={true}
        onSubmit={handleSubmit}
        submitLabel="Save Changes"
        submittingLabel="Saving..."
        title="Edit Room Type"
        subtitle="Update room details. Changes go live on your booking page immediately."
        errors={errors}
      />
    </>
  );
}
