"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getHotelScope } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ── Hotel branding images (logo / cover) ─────────────────────────

export async function saveHotelImageUrl(
  type: "logo" | "cover",
  url: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { hotelId } = await getHotelScope();
    const supabase = await createClient();
    await supabase
      .from("hotels")
      .update(type === "logo" ? { logo_url: url } : { cover_image_url: url })
      .eq("id", hotelId);
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
    const { hotelId } = await getHotelScope();
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
    await getHotelScope(); // auth check
    const { error } = await supabaseAdmin.storage.from("hotel-assets").remove([path]);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
