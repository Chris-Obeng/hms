"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Modal } from "@heroui/react";

import { RoomTypesTable, type RoomTypeRow } from "./room-types-table";
import { RoomTypeForm, type RoomTypeFormValues } from "../_components/room-type-form";
import { createRoomType } from "@/app/actions/rooms";
import { toAmenityObjects } from "@/lib/amenities";
import { toast } from "@heroui/react";

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
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title text-foreground">Room Types</h1>
          <p className="text-body mt-0.5 text-muted-foreground">
            {totalRoomTypes} room type{totalRoomTypes !== 1 ? "s" : ""} · {totalRooms} total room
            {totalRooms !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onPress={() => {
            setErrors({});
            setIsAddModalOpen(true);
          }}
          size="sm"
          className="shrink-0"
        >
          <Plus className="size-4" />
          Add Room Type
        </Button>
      </div>

      <RoomTypesTable data={data} currency={currency} />

      {/* Add room type modal */}
      <Modal.Backdrop isOpen={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <Modal.Container>
          <Modal.Dialog className="flex h-[85dvh] max-w-2xl flex-col p-0 sm:h-[85vh]">
            <Modal.CloseTrigger />
            <Modal.Header className="shrink-0 border-b border-border">
              <Modal.Heading>Add Room Type</Modal.Heading>
              <p className="text-caption text-muted-foreground">
                Create a new room category. You can upload photos on the next step.
              </p>
            </Modal.Header>
            <Modal.Body className="min-h-0 flex-1 overflow-y-auto">
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
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
