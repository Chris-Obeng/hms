"use client";

import * as React from "react";
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  Button,
  Table,
  Chip,
  Modal,
  Input,
  Select,
  ListBox,
  Alert,
  Spinner,
} from "@heroui/react";
import { toast } from "@heroui/react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { RoomMapping, RoomMappingInput } from "@/types/platform-integrations";
import {
  createRoomMapping,
  updateRoomMapping,
  deleteRoomMapping,
} from "../_actions";

interface RoomMappingsTabProps {
  hotelId: string;
  mappings: RoomMapping[];
  onRefresh: () => Promise<void>;
}

/**
 * RoomMappingsTab Component
 * 
 * Allows platform admins to create, edit, and delete room mappings
 * between HotelOS room types and Bed24 room IDs.
 */
export function RoomMappingsTab({
  hotelId,
  mappings,
  onRefresh,
}: RoomMappingsTabProps) {
  // ── State ───────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingMapping, setEditingMapping] = React.useState<RoomMapping | null>(null);
  const [isDeleting, setIsDeleting] = React.useState<string | null>(null);

  // ── Handlers ────────────────────────────────────────────────

  function handleAdd() {
    setEditingMapping(null);
    setIsModalOpen(true);
  }

  function handleEdit(mapping: RoomMapping) {
    setEditingMapping(mapping);
    setIsModalOpen(true);
  }

  async function handleDelete(mappingId: string) {
    if (
      !confirm(
        "Are you sure you want to delete this room mapping? This cannot be undone."
      )
    ) {
      return;
    }

    setIsDeleting(mappingId);
    const result = await deleteRoomMapping(mappingId);
    setIsDeleting(null);

    if (result.success) {
      toast.success(result.message ?? "Room mapping deleted successfully");
      await onRefresh();
    } else {
      toast.error(result.error);
    }
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setEditingMapping(null);
  }

  async function handleSaveMapping() {
    await onRefresh();
    handleCloseModal();
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Info Alert ────────────────────────────────────────── */}
      <Alert status="default">
        <Alert.Indicator>
          <AlertCircle className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Description>
            Map HotelOS room types to their corresponding Bed24 room IDs. Each room
            type should be mapped to ensure availability syncs correctly across channels.
            Room mappings are typically configured during hotel onboarding.
          </Alert.Description>
        </Alert.Content>
      </Alert>

      {/* ── Mappings Card ─────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between w-full">
            <div>
              <Card.Title>Room Channel Mappings</Card.Title>
              <p className="text-sm text-foreground/70 mt-0.5">
                {mappings.length} room type{mappings.length === 1 ? "" : "s"} mapped to Bed24
              </p>
            </div>
            <Button
              color="primary"
              size="sm"
              onPress={handleAdd}
              startContent={<Plus className="size-3.5" />}
            >
              Add Mapping
            </Button>
          </div>
        </Card.Header>

        <Card.Content className="p-0">
          {mappings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Layers className="size-8 text-foreground/25 mb-3" />
              <p className="text-sm font-medium text-foreground/70">
                No room mappings configured
              </p>
              <p className="text-xs text-foreground/50 mt-1 max-w-xs">
                Click "Add Mapping" to map room types to Bed24 room IDs
              </p>
            </div>
          ) : (
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Room channel mappings">
                  <Table.Header>
                    <Table.Column isRowHeader>Room Type</Table.Column>
                    <Table.Column>Bed24 Property ID</Table.Column>
                    <Table.Column>Bed24 Room ID</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column>Mapped</Table.Column>
                    <Table.Column>Actions</Table.Column>
                  </Table.Header>
                  <Table.Body items={mappings}>
                    {(mapping) => (
                      <Table.Row key={mapping.id} id={mapping.id}>
                        <Table.Cell>
                          <div>
                            <p className="text-sm font-medium">
                              {mapping.roomTypeName}
                            </p>
                            <p className="text-[11px] text-foreground/50">
                              GHS {mapping.roomTypeBasePrice.toLocaleString()}/night
                            </p>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                            {mapping.beds24PropertyId}
                          </code>
                        </Table.Cell>
                        <Table.Cell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                            {mapping.beds24RoomId}
                          </code>
                        </Table.Cell>
                        <Table.Cell>
                          <Chip
                            color={
                              mapping.isRoomTypeActive ? "success" : "warning"
                            }
                            variant="soft"
                            size="sm"
                          >
                            {mapping.isRoomTypeActive ? "Active" : "Inactive"}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell>
                          <span className="text-xs text-foreground/55">
                            {new Date(mapping.createdAt).toLocaleDateString(
                              "en-GB"
                            )}
                          </span>
                        </Table.Cell>
                        <Table.Cell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="light"
                              size="sm"
                              isIconOnly
                              onPress={() => handleEdit(mapping)}
                              aria-label="Edit mapping"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="light"
                              size="sm"
                              isIconOnly
                              color="danger"
                              isPending={isDeleting === mapping.id}
                              onPress={() => handleDelete(mapping.id)}
                              aria-label="Delete mapping"
                            >
                              {isDeleting === mapping.id ? (
                                <Spinner size="sm" color="current" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                            </Button>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>

      {/* ── Add/Edit Modal ────────────────────────────────────── */}
      <MappingModal
        isOpen={isModalOpen}
        hotelId={hotelId}
        mapping={editingMapping}
        onClose={handleCloseModal}
        onSave={handleSaveMapping}
      />
    </div>
  );
}

// ── MappingModal Sub-component ────────────────────────────────────

interface MappingModalProps {
  isOpen: boolean;
  hotelId: string;
  mapping: RoomMapping | null;
  onClose: () => void;
  onSave: () => Promise<void>;
}

function MappingModal({
  isOpen,
  hotelId,
  mapping,
  onClose,
  onSave,
}: MappingModalProps) {
  const [beds24PropertyId, setBeds24PropertyId] = React.useState("");
  const [beds24RoomId, setBeds24RoomId] = React.useState("");
  const [roomTypeId, setRoomTypeId] = React.useState("");
  const [roomTypes, setRoomTypes] = React.useState<
    Array<{ id: string; name: string; basePrice: number }>
  >([]);
  const [isLoadingRoomTypes, setIsLoadingRoomTypes] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const isEditing = !!mapping;

  // Load room types when modal opens
  React.useEffect(() => {
    if (isOpen) {
      loadRoomTypes();
      
      if (mapping) {
        setBeds24PropertyId(mapping.beds24PropertyId);
        setBeds24RoomId(mapping.beds24RoomId);
        setRoomTypeId(mapping.roomTypeId);
      } else {
        // Reset form for new mapping
        setBeds24PropertyId("");
        setBeds24RoomId("");
        setRoomTypeId("");
      }
    }
  }, [isOpen, mapping]);

  async function loadRoomTypes() {
    setIsLoadingRoomTypes(true);
    
    try {
      // Note: In production, this should be a server action
      // For now, using direct supabase call (will be refactored)
      const { data } = await fetch(
        `/api/platform/hotels/${hotelId}/room-types`
      ).then((r) => r.json());
      
      setRoomTypes(data ?? []);
    } catch (err) {
      console.error("Failed to load room types:", err);
      toast.error("Failed to load room types");
    } finally {
      setIsLoadingRoomTypes(false);
    }
  }

  async function handleSubmit() {
    if (!beds24PropertyId.trim() || !beds24RoomId.trim() || !roomTypeId) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSaving(true);

    const input: RoomMappingInput = {
      hotelId,
      beds24PropertyId: beds24PropertyId.trim(),
      beds24RoomId: beds24RoomId.trim(),
      roomTypeId,
    };

    const result = isEditing
      ? await updateRoomMapping(mapping.id, input)
      : await createRoomMapping(input);

    setIsSaving(false);

    if (result.success) {
      toast.success(result.message ?? "Room mapping saved successfully");
      await onSave();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-lg">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              {isEditing ? "Edit Room Mapping" : "Add Room Mapping"}
            </Modal.Heading>
          </Modal.Header>

          <Modal.Body className="space-y-4">
            <p className="text-sm text-foreground/70">
              Map a HotelOS room type to its Bed24 room ID for channel sync
            </p>

            {/* Bed24 Property ID */}
            <Input
              label="Bed24 Property ID"
              value={beds24PropertyId}
              onChange={(e) => setBeds24PropertyId(e.target.value)}
              placeholder="e.g. 123456"
              variant="secondary"
              description="The property ID from Bed24 (should match hotel config)"
              isRequired
            />

            {/* Bed24 Room ID */}
            <Input
              label="Bed24 Room ID"
              value={beds24RoomId}
              onChange={(e) => setBeds24RoomId(e.target.value)}
              placeholder="e.g. 789012"
              variant="secondary"
              description="The room ID from Bed24 (found in Bed24 room settings)"
              isRequired
            />

            {/* Room Type Selector */}
            <div className="space-y-2">
              <Select
                selectedKey={roomTypeId || undefined}
                onSelectionChange={(key) => {
                  if (key) setRoomTypeId(String(key));
                }}
                isDisabled={isLoadingRoomTypes || isEditing}
                variant="secondary"
                placeholder="Select a room type"
              >
                <label className="text-sm font-medium">HotelOS Room Type</label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {roomTypes.map((rt) => (
                      <ListBox.Item key={rt.id} id={rt.id} textValue={rt.name}>
                        <div>
                          <p className="font-medium">{rt.name}</p>
                          <p className="text-xs text-foreground/55">
                            GHS {rt.basePrice.toLocaleString()}/night
                          </p>
                        </div>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <p className="text-xs text-foreground/60">
                {isEditing
                  ? "Room type cannot be changed after creation"
                  : "Choose which room type to map"}
              </p>
            </div>

            {isLoadingRoomTypes && (
              <div className="flex items-center gap-2 text-sm text-foreground/60">
                <Spinner size="sm" color="current" />
                <span>Loading room types...</span>
              </div>
            )}
          </Modal.Body>

          <Modal.Footer>
            <Button variant="secondary" slot="close">
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={handleSubmit}
              isPending={isSaving}
              isDisabled={
                !beds24PropertyId.trim() ||
                !beds24RoomId.trim() ||
                !roomTypeId ||
                isLoadingRoomTypes
              }
            >
              {isSaving && <Spinner size="sm" color="current" />}
              {isEditing ? "Save Changes" : "Create Mapping"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
