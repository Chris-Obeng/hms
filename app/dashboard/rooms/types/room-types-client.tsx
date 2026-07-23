"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "@heroui/react";
import { RoomTypesTable, type RoomTypeRow } from "./room-types-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoomTypeForm, type RoomTypeFormValues } from "../_components/room-type-form";
import { createRoomType } from "@/app/actions/rooms";
import { AMENITIES_LIST } from "@/lib/amenities";

interface RoomTypesClientProps {
  data: RoomTypeRow[];
  currency: string;
  totalRooms: number;
}

export function RoomTypesClient({ data, currency, totalRooms }: RoomTypesClientProps) {
  const router = useRouter();
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const totalRoomTypes = data.length;

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
      toast.success(`"${values.name}" created — now add photos`);
      setIsAddModalOpen(false);
      // Redirect to edit page for image uploads
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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-page-title text-foreground">Room Types</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalRoomTypes} room type{totalRoomTypes !== 1 ? "s" : ""} · {totalRooms} total room{totalRooms !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={() => {
            setErrors({});
            setIsAddModalOpen(true);
          }}
          size="sm"
          className="h-9 text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90"
        >
          <Plus className="size-3.5 mr-1.5" />
          Add Room Type
        </Button>
      </div>

      <RoomTypesTable data={data} currency={currency} />

      {/* Add Room Type Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-2xl h-[85vh] max-h-[85vh] flex flex-col rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <DialogTitle>Add Room Type</DialogTitle>
            <DialogDescription>
              Create a new room category. You can upload photos on the next step.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <RoomTypeForm
              onSubmit={handleSubmit}
              submitLabel="Create Room Type"
              submittingLabel="Creating..."
              title="Add Room Type"
              subtitle="Create a new room category. You'll add photos on the next step."
              errors={errors}
              isModal={true}
              onCancel={() => setIsAddModalOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
