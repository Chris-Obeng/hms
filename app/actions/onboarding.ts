"use server";

import { z } from "zod";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../lib/supabase/admin";
import { slugify } from "@/lib/utils";

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

function uniqueSlug(text: string) {
  // 4-char base36 suffix ensures uniqueness while keeping slug readable
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slugify(text, 40)}-${suffix}`;
}

export async function createHotelProfile(formData: OnboardingInput) {
  const { userId } = await auth();
  if (!userId) {
    return { error: "Not authenticated." };
  }

  const result = OnboardingSchema.safeParse(formData);

  if (!result.success) {
    return { error: result.error.issues[0]?.message || result.error.message };
  }

  const data = result.data;

  // The org id comes from the client — verify the caller actually administers it,
  // otherwise anyone could attach a hotel (and a super_admin staff profile) to
  // someone else's organization.
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId });
  const membership = memberships.data.find(
    (m) => m.organization.id === data.clerk_org_id
  );

  if (!membership || membership.role !== "org:admin") {
    return { error: "You do not have permission to onboard this organization." };
  }

  const { data: existingHotel } = await supabaseAdmin
    .from("hotels")
    .select("id")
    .eq("clerk_org_id", data.clerk_org_id)
    .maybeSingle();

  if (existingHotel) {
    return { error: "This organization already has a hotel profile." };
  }

  // Make the slug unique by appending a random string to avoid collisions on onboarding
  const slug = uniqueSlug(data.name);

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
    status: 'pending', // Deactivated by default until platform admin approval
  });

  if (error) {
    console.error("Supabase insert error:", error);
    return { error: error.message || "Failed to create hotel profile." };
  }

  // Admin staff_profile upsert — the onboarding user MUST become super_admin,
  // otherwise requireAuth() will reject them and they'll be locked out of the
  // hotel they just created. Surface any failure instead of swallowing it.
  {
    const clerkUser = await client.users.getUser(userId);

    const { error: staffError } = await supabase.from('staff_profiles').upsert({
      clerk_org_id:       data.clerk_org_id,
      clerk_user_id:      userId,
      email:              clerkUser.emailAddresses?.[0]?.emailAddress ?? null,
      full_name:          `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim(),
      avatar_url:         clerkUser.imageUrl ?? null,
      role:               'super_admin',
      is_active:          true,
      granted_at:         new Date().toISOString(),
      granted_by:         null,
      notification_prefs: {},
    }, {
      onConflict: 'clerk_user_id,clerk_org_id',
    });

    if (staffError) {
      console.error("Admin staff_profile upsert error:", staffError);
      return { error: "Hotel created, but we couldn't set up your admin access. Please contact support." };
    }
  }

  return { success: true };
}
