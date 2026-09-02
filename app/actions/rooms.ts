"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAuth, requireMinRole, toActionError } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { toStoredBlockRange } from "@/lib/calendar-domain";

// ── Schemas ──────────────────────────────────────────────────────────

const RoomTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z.string().min(1).max(100),
  shortDescription: z.string().max(200).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  bedConfiguration: z.string().max(100).optional().or(z.literal("")),
  maxAdults: z.coerce.number().int().min(0).default(2),
  maxChildren: z.coerce.number().int().min(0).default(0),
  basePrice: z.coerce.number().min(0, "Base price is required"),
  weekendPrice: z.coerce.number().min(0).optional().or(z.literal("")),
  amenities: z.array(z.object({
    icon: z.string(),
    label: z.string(),
  })).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

const RoomSchema = z.object({
  roomTypeId: z.string().uuid("Room type is required"),
  roomNumber: z.string().min(1, "Room number is required"),
  floor: z.string().optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  status: z.enum(["available", "occupied", "maintenance", "out_of_service"]).default("available"),
  isActive: z.boolean().default(true),
});

const AvailabilityBlockSchema = z.object({
  roomId: z.string().uuid("Room is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.enum(["maintenance", "deep_cleaning", "owner_use", "renovation", "other"]),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type RoomTypeInput = z.infer<typeof RoomTypeSchema>;
export type RoomInput = z.infer<typeof RoomSchema>;
export type AvailabilityBlockInput = z.infer<typeof AvailabilityBlockSchema>;

// ── Auth helpers ─────────────────────────────────────────────────────

/**
 * Minimum auth for read operations: any active staff member.
 * Returns { hotelId, currency } on success or { error } on failure.
 */
async function getHotelId(): Promise<{ hotelId: string; currency: string } | { error: string }> {
  try {
    const ctx = await requireAuth();
    return { hotelId: ctx.hotelId, currency: ctx.hotel.currency };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authenticated" };
  }
}

// ── Room Types CRUD ────────────────────────────────────────────────

export async function getRoomTypes() {
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_types")
    .select(`
      id, name, slug, short_description, description, bed_configuration,
      max_adults, max_children, base_price, weekend_price, amenities, images,
      is_active, sort_order, created_at, updated_at,
      rooms:rooms(count)
    `)
    .eq("hotel_id", result.hotelId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return { success: false as const, error: error.message };

  return {
    success: true as const,
    data: data.map((rt) => ({
      id: rt.id,
      name: rt.name,
      slug: rt.slug,
      shortDescription: rt.short_description,
      description: rt.description,
      bedConfiguration: rt.bed_configuration,
      maxAdults: rt.max_adults,
      maxChildren: rt.max_children,
      basePrice: rt.base_price,
      weekendPrice: rt.weekend_price,
      amenities: rt.amenities as { icon: string; label: string }[] | null,
      images: rt.images as { url: string; caption: string; order: number }[] | null,
      isActive: rt.is_active,
      sortOrder: rt.sort_order,
      roomCount: (rt.rooms as unknown as { count: number }[]).length,
      createdAt: rt.created_at,
      updatedAt: rt.updated_at,
    })),
  };
}

export async function getRoomType(id: string) {
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_types")
    .select("*")
    .eq("id", id)
    .eq("hotel_id", result.hotelId)
    .single();

  if (error) return { success: false as const, error: error.message };
  if (!data) return { success: false as const, error: "Room type not found" };

  return {
    success: true as const,
    data: {
      id: data.id,
      hotelId: data.hotel_id,
      name: data.name,
      slug: data.slug,
      shortDescription: data.short_description,
      description: data.description,
      bedConfiguration: data.bed_configuration,
      maxAdults: data.max_adults,
      maxChildren: data.max_children,
      basePrice: data.base_price,
      weekendPrice: data.weekend_price,
      amenities: data.amenities as { icon: string; label: string }[] | null,
      images: data.images as { url: string; caption: string; order: number }[] | null,
      isActive: data.is_active,
      sortOrder: data.sort_order,
    },
  };
}

export async function createRoomType(input: RoomTypeInput) {
  try { await requireMinRole("manager", "create room types"); }
  catch (err) { return toActionError(err, { action: "rooms.createRoomType" }); }
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const parsed = RoomTypeSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    return { success: false as const, error: "Validation failed", fieldErrors };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const { error, data: newRoomType } = await supabase.from("room_types").insert({
    hotel_id: result.hotelId,
    name: data.name,
    slug: data.slug || slugify(data.name),
    short_description: data.shortDescription || null,
    description: data.description || null,
    bed_configuration: data.bedConfiguration || null,
    max_adults: data.maxAdults,
    max_children: data.maxChildren,
    base_price: data.basePrice,
    weekend_price: data.weekendPrice || null,
    amenities: data.amenities,
    is_active: data.isActive,
    sort_order: data.sortOrder,
  }).select("id").single();

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/dashboard/rooms/types");
  return { success: true as const, id: newRoomType.id };
}

export async function updateRoomType(id: string, input: RoomTypeInput) {
  try { await requireMinRole("manager", "update room types"); }
  catch (err) { return toActionError(err, { action: "rooms.updateRoomType" }); }
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const parsed = RoomTypeSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    return { success: false as const, error: "Validation failed", fieldErrors };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("room_types")
    .update({
      name: data.name,
      slug: data.slug || slugify(data.name),
      short_description: data.shortDescription || null,
      description: data.description || null,
      bed_configuration: data.bedConfiguration || null,
      max_adults: data.maxAdults,
      max_children: data.maxChildren,
      base_price: data.basePrice,
      weekend_price: data.weekendPrice || null,
      amenities: data.amenities,
      is_active: data.isActive,
      sort_order: data.sortOrder,
    })
    .eq("id", id)
    .eq("hotel_id", result.hotelId);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/dashboard/rooms/types");
  return { success: true as const };
}

export async function toggleRoomTypeActive(id: string, isActive: boolean) {
  try { await requireMinRole("manager", "toggle room type active status"); }
  catch (err) { return toActionError(err, { action: "rooms.toggleRoomTypeActive" }); }
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("room_types")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("hotel_id", result.hotelId);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/dashboard/rooms/types");
  return { success: true as const };
}

export async function deleteRoomType(id: string) {
  try { await requireMinRole("super_admin", "delete room types"); }
  catch (err) { return toActionError(err, { action: "rooms.deleteRoomType" }); }
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("room_types")
    .delete()
    .eq("id", id)
    .eq("hotel_id", result.hotelId);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/dashboard/rooms/types");
  return { success: true as const };
}

export async function getHotelSlug(): Promise<string | null> {
  const result = await getHotelId();
  if ("error" in result) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("hotels")
    .select("slug, custom_domain")
    .eq("id", result.hotelId)
    .single();
  if (!data) return null;
  const base = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "localhost:3000";
  return data.custom_domain
    ? `https://${data.custom_domain}`
    : `https://${data.slug}.${base}`;
}

// ── Rooms CRUD ─────────────────────────────────────────────────────

export async function getRooms() {
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select(`
      id, room_number, floor, status, is_active, notes, created_at, updated_at,
      room_types!inner(id, name, slug)
    `)
    .eq("hotel_id", result.hotelId)
    .order("room_number", { ascending: true });

  if (error) return { success: false as const, error: error.message };

  return {
    success: true as const,
    data: data.map((r) => ({
      id: r.id,
      roomNumber: r.room_number,
      floor: r.floor,
      status: r.status,
      isActive: r.is_active,
      notes: r.notes,
      roomTypeId: r.room_types.id,
      roomTypeName: r.room_types.name,
      roomTypeSlug: r.room_types.slug,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  };
}

export async function createRoom(input: RoomInput) {
  try { await requireMinRole("manager", "create rooms"); }
  catch (err) { return toActionError(err, { action: "rooms.createRoom" }); }
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const parsed = RoomSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    return { success: false as const, error: "Validation failed", fieldErrors };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("rooms").insert({
    hotel_id: result.hotelId,
    room_type_id: data.roomTypeId,
    room_number: data.roomNumber,
    floor: data.floor || null,
    notes: data.notes || null,
    status: data.status,
    is_active: data.isActive,
  });

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/dashboard/rooms/directory");
  return { success: true as const };
}

export async function updateRoomStatus(id: string, status: string) {
  try { await requireMinRole("front_desk", "update room status"); }
  catch (err) { return toActionError(err, { action: "rooms.updateRoomStatus" }); }
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rooms")
    .update({ status })
    .eq("id", id)
    .eq("hotel_id", result.hotelId);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/dashboard/rooms/directory");
  return { success: true as const };
}

export async function updateRoom(id: string, input: Partial<RoomInput>) {
  try { await requireMinRole("manager", "update rooms"); }
  catch (err) { return toActionError(err, { action: "rooms.updateRoom" }); }
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("rooms")
    .update({
      ...(input.roomTypeId !== undefined ? { room_type_id: input.roomTypeId } : {}),
      ...(input.roomNumber !== undefined ? { room_number: input.roomNumber } : {}),
      ...(input.floor !== undefined ? { floor: input.floor || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    })
    .eq("id", id)
    .eq("hotel_id", result.hotelId);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/dashboard/rooms/directory");
  return { success: true as const };
}

// ── Availability Blocks ───────────────────────────────────────────

export async function createAvailabilityBlock(input: AvailabilityBlockInput) {
  // Front desk blocks rooms daily (maintenance, cleaning, owner stays);
  // removing blocks stays manager+ per availability_blocks RLS policy.
  try { await requireMinRole("front_desk", "block rooms"); }
  catch (err) { return toActionError(err, { action: "rooms.createAvailabilityBlock" }); }
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const parsed = AvailabilityBlockSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    return { success: false as const, error: "Validation failed", fieldErrors };
  }

  const data = parsed.data;
  const supabase = await createClient();

  let storedRange;
  try { storedRange = toStoredBlockRange(data.startDate, data.endDate); }
  catch (err) { return { success: false as const, error: err instanceof Error ? err.message : "Invalid dates" }; }

  const { error } = await supabase.from("availability_blocks").insert({
    hotel_id: result.hotelId,
    room_id: data.roomId,
    start_date: storedRange.startDate,
    end_date: storedRange.endDate,
    reason: data.reason,
    notes: data.notes || null,
  });

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/dashboard/rooms/directory");
  revalidatePath("/dashboard/calendar");
  return { success: true as const };
}

export async function getAvailabilityBlocks(roomId: string) {
  const result = await getHotelId();
  if ("error" in result) return { success: false as const, error: result.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_blocks")
    .select("*")
    .eq("room_id", roomId)
    .gte("end_date", new Date().toISOString().split("T")[0])
    .order("start_date", { ascending: true });

  if (error) return { success: false as const, error: error.message };

  return { success: true as const, data };
}
