"use server";

import { z } from "zod";
import { supabaseAdmin } from "../../lib/supabase/admin";

const OnboardingSchema = z.object({
  name: z.string().min(1, "Hotel name is required"),
  clerk_org_id: z.string().min(1, "Clerk Org ID is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  country: z.string().default("Ghana"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email address"),
  hotel_type: z.string(),
  number_of_rooms: z.number().int().positive(),
  star_rating: z.string().optional(),
  website: z.string().optional(),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;

function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-") + "-" + Math.random().toString(36).substring(2, 6);
}

export async function createHotelProfile(formData: OnboardingInput) {
  const result = OnboardingSchema.safeParse(formData);

  if (!result.success) {
    return { error: result.error.issues[0]?.message || result.error.message };
  }

  const data = result.data;
  // Make the slug unique by appending a random string to avoid collisions on onboarding
  const slug = slugify(data.name);

  const supabase = supabaseAdmin;

  const settings = {
    hotel_type: data.hotel_type,
    number_of_rooms: data.number_of_rooms,
    star_rating: data.star_rating,
    website: data.website,
  };

  const { error } = await supabase.from("hotels").insert({
    name: data.name,
    slug,
    clerk_org_id: data.clerk_org_id,
    address: data.address,
    city: data.city,
    country: data.country,
    phone: data.phone,
    email: data.email,
    settings,
  });

  if (error) {
    console.error("Supabase insert error:", error);
    return { error: error.message || "Failed to create hotel profile." };
  }

  // Admin staff_profile upsert
  const { auth, clerkClient } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (userId) {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    
    await supabase.from('staff_profiles').upsert({
      clerk_org_id:       data.clerk_org_id,
      clerk_user_id:      userId,
      email:              clerkUser.emailAddresses?.[0]?.emailAddress ?? null,
      full_name:          `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim(),
      avatar_url:         clerkUser.imageUrl ?? null,
      role:               'admin',
      is_active:          true,
      granted_at:         new Date().toISOString(),
      granted_by:         null,
      notification_prefs: {},
    }, {
      onConflict: 'clerk_user_id,clerk_org_id',
    });
  }

  return { success: true };
}
