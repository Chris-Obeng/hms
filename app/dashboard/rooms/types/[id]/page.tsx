import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Hotel } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import type { RoomTypeFormValues } from "../../_components/room-type-form";
import { EditRoomTypeClient } from "./edit-room-type-client";

function NoHotelState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Hotel className="mb-4 h-12 w-12 text-muted-foreground" />
      <h2 className="mb-2 text-lg font-semibold">No Hotel Found</h2>
      <p className="text-muted-foreground">
        Please set up your hotel profile to manage rooms.
      </p>
    </div>
  );
}

export default async function EditRoomTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await auth();

  if (!orgId) {
    return <NoHotelState />;
  }

  const [{ id }, resolvedParams] = await Promise.all([params, searchParams]);

  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, currency")
    .eq("clerk_org_id", orgId)
    .maybeSingle();

  if (!hotel) {
    return <NoHotelState />;
  }

  // Scoped to the caller's hotel so a foreign or unknown id returns a real 404
  const { data: roomType } = await supabase
    .from("room_types")
    .select(
      "id, name, slug, short_description, description, bed_configuration, max_adults, max_children, base_price, weekend_price, amenities, images, is_active"
    )
    .eq("id", id)
    .eq("hotel_id", hotel.id)
    .maybeSingle();

  if (!roomType) {
    notFound();
  }

  const amenities = (roomType.amenities ?? []) as { icon: string; label: string }[];
  const images = (roomType.images ?? []) as { url: string; caption: string; order: number }[];

  const initialValues: Partial<RoomTypeFormValues> = {
    name: roomType.name,
    slug: roomType.slug ?? "",
    shortDescription: roomType.short_description ?? "",
    description: roomType.description ?? "",
    bedConfiguration: roomType.bed_configuration ?? "",
    maxAdults: roomType.max_adults ?? 2,
    maxChildren: roomType.max_children ?? 0,
    basePrice: (roomType.base_price ?? 0).toString(),
    weekendPrice: roomType.weekend_price?.toString() ?? "",
    selectedAmenities: amenities.map((a) => a.label),
    isActive: roomType.is_active ?? true,
  };

  return (
    <EditRoomTypeClient
      roomTypeId={roomType.id}
      hotelId={hotel.id}
      currency={hotel.currency ?? "GHS"}
      name={roomType.name}
      initialValues={initialValues}
      initialImages={images}
      isNew={resolvedParams.new === "1"}
    />
  );
}
