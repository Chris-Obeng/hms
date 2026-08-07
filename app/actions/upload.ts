"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

async function getHotelId() {
  const { orgId } = await auth();
  if (!orgId) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id")
    .eq("clerk_org_id", orgId)
    .single();
  if (!hotel) throw new Error("Hotel not found");
  return hotel.id;
}

function assertStorageUrl(url: string): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Storage is not configured");

  let parsed: URL;
  let allowed: URL;
  try {
    parsed = new URL(url);
    allowed = new URL(supabaseUrl);
  } catch {
    throw new Error("Invalid image URL");
  }

  if (parsed.protocol !== "https:" || parsed.host !== allowed.host) {
    throw new Error("Invalid image URL");
  }
}
// ── Hotel branding images (logo / cover) ─────────────────────────

export async function saveHotelImageUrl(
  type: "logo" | "cover",
  url: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const hotelId = await getHotelId();
    if (url) assertStorageUrl(url);
    const supabase = await createClient();
    const { error } = await supabase
      .from("hotels")
      .update(type === "logo" ? { logo_url: url } : { cover_image_url: url })
      .eq("id", hotelId);
    if (error) throw error;
    revalidatePath("/dashboard/settings/hotel");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Room type images ─────────────────────────────────────────────

export async function saveRoomImages(
  roomTypeId: string,
  images: { url: string; caption: string; order: number }[]
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const hotelId = await getHotelId();
    for (const image of images) {
      assertStorageUrl(image.url);
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("room_types")
      .update({ images })
      .eq("id", roomTypeId)
      .eq("hotel_id", hotelId);
    if (error) throw error;
    revalidatePath("/dashboard/rooms/types");
    revalidatePath(`/dashboard/rooms/types/${roomTypeId}`);
    // Booking pages are force-dynamic so they always fetch fresh — no cache to bust
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Delete a file from Supabase Storage ──────────────────────────

export async function deleteStorageFile(
  path: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const hotelId = await getHotelId();

    const prefix = `hotels/${hotelId}/`;
    if (!path.startsWith(prefix) || path.includes("..")) {
      throw new Error("Invalid file path");
    }
    const { error } = await supabaseAdmin.storage.from("hotel-assets").remove([path]);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
